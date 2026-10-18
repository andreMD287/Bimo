//! `bimo-registry` (spec 03 §4): registro de solo adicion de sellos diarios por comercio.
//! Sin funcion de actualizacion de codigo ni de borrado (ADR-15).
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env, Vec,
};

/// Maximo de items por lote (spec 03 §4.3).
const MAX_BATCH: u32 = 14;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AmendInfo {
    pub prev_version: u32,
    pub reason_hash: BytesN<32>,
}

/// `None` = primer sello del dia. (El spec 03 v1.4 usa este enum en lugar de `Option<AmendInfo>`:
/// soroban-sdk 26.1 no compila con `testutils` un campo `Option<struct>` de `#[contracttype]`.)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Amend {
    None,
    Of(AmendInfo),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SealItem {
    pub date: u32,
    pub root: BytesN<32>,
    pub entry_count: u32,
    pub origin_flags: u32,
    pub amend: Amend,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SealRecord {
    pub version: u32,
    pub root: BytesN<32>,
    pub entry_count: u32,
    pub origin_flags: u32,
    pub reason_hash: Option<BytesN<32>>,
    pub attester: Address,
    pub ledger: u32,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Attester,
    Latest(Address, u32),
    Seal(Address, u32, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadySealed = 1,
    NotSealed = 2,
    VersionConflict = 3,
    InvalidDate = 4,
    ReservedFlags = 5,
    EmptyBatch = 6,
    BatchTooLarge = 7,
    DuplicateDate = 8,
}

/// Evento ("sealed", merchant, date) -> (version, root, entry_count, origin_flags) (spec 03 §4.4).
#[contractevent(topics = ["sealed"], data_format = "vec")]
pub struct Sealed {
    #[topic]
    pub merchant: Address,
    #[topic]
    pub date: u32,
    pub version: u32,
    pub root: BytesN<32>,
    pub entry_count: u32,
    pub origin_flags: u32,
}

/// Evento ("attester", old, new) -> ().
#[contractevent(topics = ["attester"])]
pub struct AttesterChanged {
    #[topic]
    pub old: Address,
    #[topic]
    pub new: Address,
}

/// Evento ("admin", old, new) -> ().
#[contractevent(topics = ["admin"])]
pub struct AdminChanged {
    #[topic]
    pub old: Address,
    #[topic]
    pub new: Address,
}

#[contract]
pub struct Registry;

fn valid_date(date: u32) -> bool {
    let year = date / 10_000;
    let month = (date / 100) % 100;
    let day = date % 100;
    (2024..=2099).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day)
}

fn extend_persistent(e: &Env, key: &DataKey) {
    let max = e.storage().max_ttl();
    e.storage().persistent().extend_ttl(key, max, max);
}

fn extend_instance(e: &Env) {
    let max = e.storage().max_ttl();
    e.storage().instance().extend_ttl(max, max);
}

fn attester_of(e: &Env) -> Address {
    e.storage().instance().get(&DataKey::Attester).unwrap()
}

fn admin_of(e: &Env) -> Address {
    e.storage().instance().get(&DataKey::Admin).unwrap()
}

fn store_item(e: &Env, merchant: &Address, item: &SealItem, attester: &Address) -> Result<(), Error> {
    if !valid_date(item.date) {
        return Err(Error::InvalidDate);
    }
    if item.origin_flags >> 4 != 0 {
        return Err(Error::ReservedFlags);
    }

    let latest_key = DataKey::Latest(merchant.clone(), item.date);
    let latest: Option<u32> = e.storage().persistent().get(&latest_key);

    let (version, reason_hash) = match (&item.amend, latest) {
        (Amend::None, Some(_)) => return Err(Error::AlreadySealed),
        (Amend::None, None) => (1u32, None),
        (Amend::Of(_), None) => return Err(Error::NotSealed),
        (Amend::Of(a), Some(current)) => {
            if a.prev_version != current {
                return Err(Error::VersionConflict);
            }
            (current + 1, Some(a.reason_hash.clone()))
        }
    };

    let record = SealRecord {
        version,
        root: item.root.clone(),
        entry_count: item.entry_count,
        origin_flags: item.origin_flags,
        reason_hash,
        attester: attester.clone(),
        ledger: e.ledger().sequence(),
        timestamp: e.ledger().timestamp(),
    };
    let seal_key = DataKey::Seal(merchant.clone(), item.date, version);
    e.storage().persistent().set(&seal_key, &record);
    e.storage().persistent().set(&latest_key, &version);
    extend_persistent(e, &seal_key);
    extend_persistent(e, &latest_key);

    Sealed {
        merchant: merchant.clone(),
        date: item.date,
        version,
        root: item.root.clone(),
        entry_count: item.entry_count,
        origin_flags: item.origin_flags,
    }
    .publish(e);
    Ok(())
}

#[contractimpl]
impl Registry {
    pub fn __constructor(e: Env, admin: Address, attester: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Attester, &attester);
    }

    pub fn seal(e: Env, merchant: Address, item: SealItem) -> Result<(), Error> {
        merchant.require_auth();
        let attester = attester_of(&e);
        attester.require_auth();
        extend_instance(&e);
        store_item(&e, &merchant, &item, &attester)
    }

    pub fn seal_batch(e: Env, merchant: Address, items: Vec<SealItem>) -> Result<(), Error> {
        merchant.require_auth();
        let attester = attester_of(&e);
        attester.require_auth();

        let n = items.len();
        if n == 0 {
            return Err(Error::EmptyBatch);
        }
        if n > MAX_BATCH {
            return Err(Error::BatchTooLarge);
        }
        for i in 0..n {
            let d = items.get_unchecked(i).date;
            for j in (i + 1)..n {
                if items.get_unchecked(j).date == d {
                    return Err(Error::DuplicateDate);
                }
            }
        }
        extend_instance(&e);
        // Todo o nada: si un item falla, la transaccion entera revierte.
        for item in items.iter() {
            store_item(&e, &merchant, &item, &attester)?;
        }
        Ok(())
    }

    pub fn get(e: Env, merchant: Address, date: u32) -> Vec<SealRecord> {
        let mut out = Vec::new(&e);
        let latest: Option<u32> = e
            .storage()
            .persistent()
            .get(&DataKey::Latest(merchant.clone(), date));
        if let Some(latest) = latest {
            for v in 1..=latest {
                if let Some(r) = e
                    .storage()
                    .persistent()
                    .get(&DataKey::Seal(merchant.clone(), date, v))
                {
                    out.push_back(r);
                }
            }
        }
        out
    }

    pub fn latest(e: Env, merchant: Address, date: u32) -> Option<SealRecord> {
        let v: Option<u32> = e
            .storage()
            .persistent()
            .get(&DataKey::Latest(merchant.clone(), date));
        v.and_then(|v| e.storage().persistent().get(&DataKey::Seal(merchant, date, v)))
    }

    pub fn extend_ttl(e: Env, merchant: Address, date: u32) {
        extend_instance(&e);
        let latest_key = DataKey::Latest(merchant.clone(), date);
        let latest: Option<u32> = e.storage().persistent().get(&latest_key);
        if let Some(latest) = latest {
            extend_persistent(&e, &latest_key);
            for v in 1..=latest {
                extend_persistent(&e, &DataKey::Seal(merchant.clone(), date, v));
            }
        }
    }

    pub fn attester(e: Env) -> Address {
        attester_of(&e)
    }

    pub fn admin(e: Env) -> Address {
        admin_of(&e)
    }

    pub fn set_attester(e: Env, new: Address) {
        let admin = admin_of(&e);
        admin.require_auth();
        let old = attester_of(&e);
        e.storage().instance().set(&DataKey::Attester, &new);
        extend_instance(&e);
        AttesterChanged { old, new }.publish(&e);
    }

    pub fn set_admin(e: Env, new: Address) {
        let admin = admin_of(&e);
        admin.require_auth();
        e.storage().instance().set(&DataKey::Admin, &new);
        extend_instance(&e);
        AdminChanged { old: admin, new }.publish(&e);
    }
}

#[cfg(test)]
mod test;
