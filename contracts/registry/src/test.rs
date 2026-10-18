extern crate std;

use super::*;
use soroban_sdk::{
    Event,
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    vec, Address, BytesN, Env, IntoVal, Vec,
};

const DATE: u32 = 20261006;

struct Ctx {
    env: Env,
    id: Address,
    admin: Address,
    attester: Address,
    merchant: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.ledger().with_mut(|l| {
        l.sequence_number = 100;
        l.timestamp = 1_700_000_000;
    });
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let merchant = Address::generate(&env);
    let id = env.register(Registry, (admin.clone(), attester.clone()));
    Ctx { env, id, admin, attester, merchant }
}

fn client<'a>(c: &'a Ctx) -> RegistryClient<'a> {
    RegistryClient::new(&c.env, &c.id)
}

fn item(env: &Env, date: u32, byte: u8) -> SealItem {
    SealItem {
        date,
        root: BytesN::from_array(env, &[byte; 32]),
        entry_count: 5,
        origin_flags: 1,
        amend: Amend::None,
    }
}

fn amend(env: &Env, date: u32, byte: u8, prev: u32) -> SealItem {
    SealItem {
        amend: Amend::Of(AmendInfo { prev_version: prev, reason_hash: BytesN::from_array(env, &[0xAA; 32]) }),
        ..item(env, date, byte)
    }
}

#[test]
fn seal_guarda_y_get_devuelve_el_sello() {
    let c = setup();
    c.env.mock_all_auths();
    client(&c).seal(&c.merchant, &item(&c.env, DATE, 1));
    // Evento ("sealed", merchant, date) -> (version, root, entry_count, origin_flags)
    let evs = c.env.events().all();
    assert_eq!(evs.events().len(), 1);
    assert_eq!(
        evs,
        std::vec![Sealed {
            merchant: c.merchant.clone(),
            date: DATE,
            version: 1,
            root: BytesN::from_array(&c.env, &[1; 32]),
            entry_count: 5,
            origin_flags: 1,
        }
        .to_xdr(&c.env, &c.id)]
    );
    let all = client(&c).get(&c.merchant, &DATE);
    assert_eq!(all.len(), 1);
    let r = all.get(0).unwrap();
    assert_eq!(r.version, 1);
    assert_eq!(r.attester, c.attester);
    assert_eq!(r.ledger, 100);
    assert_eq!(r.timestamp, 1_700_000_000);
    assert_eq!(client(&c).latest(&c.merchant, &DATE).unwrap().root, r.root);
}

#[test]
fn seal_exige_autorizacion_del_comercio_y_del_atestador() {
    let c = setup();
    let it = item(&c.env, DATE, 1);
    // Sin ninguna autorizacion
    assert!(client(&c).try_seal(&c.merchant, &it).is_err());
    // Solo el comercio
    c.env.mock_auths(&[MockAuth {
        address: &c.merchant,
        invoke: &MockAuthInvoke {
            contract: &c.id,
            fn_name: "seal",
            args: (c.merchant.clone(), it.clone()).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    assert!(client(&c).try_seal(&c.merchant, &it).is_err());
    // Solo el atestador
    c.env.mock_auths(&[MockAuth {
        address: &c.attester,
        invoke: &MockAuthInvoke {
            contract: &c.id,
            fn_name: "seal",
            args: (c.merchant.clone(), it.clone()).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    assert!(client(&c).try_seal(&c.merchant, &it).is_err());
    // Ambos
    c.env.mock_auths(&[
        MockAuth {
            address: &c.merchant,
            invoke: &MockAuthInvoke {
                contract: &c.id,
                fn_name: "seal",
                args: (c.merchant.clone(), it.clone()).into_val(&c.env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &c.attester,
            invoke: &MockAuthInvoke {
                contract: &c.id,
                fn_name: "seal",
                args: (c.merchant.clone(), it.clone()).into_val(&c.env),
                sub_invokes: &[],
            },
        },
    ]);
    assert!(client(&c).try_seal(&c.merchant, &it).is_ok());
}

#[test]
fn segundo_seal_del_mismo_dia_falla_con_already_sealed() {
    let c = setup();
    c.env.mock_all_auths();
    client(&c).seal(&c.merchant, &item(&c.env, DATE, 1));
    let r = client(&c).try_seal(&c.merchant, &item(&c.env, DATE, 2));
    assert_eq!(r, Err(Ok(Error::AlreadySealed)));
}

#[test]
fn enmienda_incrementa_la_version_y_conserva_las_anteriores() {
    let c = setup();
    c.env.mock_all_auths();
    client(&c).seal(&c.merchant, &item(&c.env, DATE, 1));
    client(&c).seal(&c.merchant, &amend(&c.env, DATE, 2, 1));
    client(&c).seal(&c.merchant, &amend(&c.env, DATE, 3, 2));
    let all = client(&c).get(&c.merchant, &DATE);
    assert_eq!(all.len(), 3);
    assert_eq!(all.get(1).unwrap().version, 2);
    assert!(all.get(0).unwrap().reason_hash.is_none());
    assert!(all.get(1).unwrap().reason_hash.is_some());
    assert_eq!(client(&c).latest(&c.merchant, &DATE).unwrap().version, 3);
}

#[test]
fn enmienda_con_prev_version_desactualizado_falla_con_version_conflict() {
    let c = setup();
    c.env.mock_all_auths();
    client(&c).seal(&c.merchant, &item(&c.env, DATE, 1));
    client(&c).seal(&c.merchant, &amend(&c.env, DATE, 2, 1));
    let r = client(&c).try_seal(&c.merchant, &amend(&c.env, DATE, 3, 1));
    assert_eq!(r, Err(Ok(Error::VersionConflict)));
}

#[test]
fn enmienda_sobre_dia_sin_sello_falla_con_not_sealed() {
    let c = setup();
    c.env.mock_all_auths();
    let r = client(&c).try_seal(&c.merchant, &amend(&c.env, DATE, 2, 1));
    assert_eq!(r, Err(Ok(Error::NotSealed)));
}

#[test]
fn fecha_invalida_falla_con_invalid_date() {
    let c = setup();
    c.env.mock_all_auths();
    for d in [20231231u32, 21000101, 20261301, 20260001, 20260100, 20260132, 0] {
        let r = client(&c).try_seal(&c.merchant, &item(&c.env, d, 1));
        assert_eq!(r, Err(Ok(Error::InvalidDate)), "fecha {d}");
    }
    // Limites validos
    assert!(client(&c).try_seal(&c.merchant, &item(&c.env, 20240101, 1)).is_ok());
    assert!(client(&c).try_seal(&c.merchant, &item(&c.env, 20991231, 1)).is_ok());
}

#[test]
fn bits_reservados_de_origin_flags_fallan_con_reserved_flags() {
    let c = setup();
    c.env.mock_all_auths();
    let mut it = item(&c.env, DATE, 1);
    it.origin_flags = 0b1111; // bits 0..3 permitidos
    assert!(client(&c).try_seal(&c.merchant, &it).is_ok());
    let mut it2 = item(&c.env, 20261007, 1);
    it2.origin_flags = 1 << 4;
    assert_eq!(client(&c).try_seal(&c.merchant, &it2), Err(Ok(Error::ReservedFlags)));
    it2.origin_flags = 1 << 31;
    assert_eq!(client(&c).try_seal(&c.merchant, &it2), Err(Ok(Error::ReservedFlags)));
}

#[test]
fn batch_vacio_falla_con_empty_batch() {
    let c = setup();
    c.env.mock_all_auths();
    let items: Vec<SealItem> = Vec::new(&c.env);
    assert_eq!(client(&c).try_seal_batch(&c.merchant, &items), Err(Ok(Error::EmptyBatch)));
}

#[test]
fn batch_de_15_items_falla_y_no_guarda_nada() {
    let c = setup();
    c.env.mock_all_auths();
    let mut items: Vec<SealItem> = Vec::new(&c.env);
    for i in 0..15u32 {
        items.push_back(item(&c.env, 20261001 + i, 1));
    }
    assert_eq!(client(&c).try_seal_batch(&c.merchant, &items), Err(Ok(Error::BatchTooLarge)));
    assert_eq!(client(&c).get(&c.merchant, &20261001).len(), 0);
}

#[test]
fn batch_de_14_items_pasa() {
    let c = setup();
    c.env.mock_all_auths();
    let mut items: Vec<SealItem> = Vec::new(&c.env);
    for i in 0..14u32 {
        items.push_back(item(&c.env, 20261001 + i, 1));
    }
    client(&c).seal_batch(&c.merchant, &items);
    assert_eq!(client(&c).get(&c.merchant, &20261014).len(), 1);
}

#[test]
fn batch_con_fecha_repetida_falla_con_duplicate_date_y_no_guarda_nada() {
    let c = setup();
    c.env.mock_all_auths();
    let items = vec![&c.env, item(&c.env, 20261001, 1), item(&c.env, 20261002, 2), item(&c.env, 20261001, 3)];
    assert_eq!(client(&c).try_seal_batch(&c.merchant, &items), Err(Ok(Error::DuplicateDate)));
    assert_eq!(client(&c).get(&c.merchant, &20261002).len(), 0);
}

#[test]
fn batch_es_todo_o_nada_si_un_item_falla() {
    let c = setup();
    c.env.mock_all_auths();
    client(&c).seal(&c.merchant, &item(&c.env, 20261002, 9));
    // el segundo item ya esta sellado: todo el lote debe revertir
    let items = vec![&c.env, item(&c.env, 20261001, 1), item(&c.env, 20261002, 2)];
    assert_eq!(client(&c).try_seal_batch(&c.merchant, &items), Err(Ok(Error::AlreadySealed)));
    assert_eq!(client(&c).get(&c.merchant, &20261001).len(), 0);
}

#[test]
fn batch_valido_guarda_varios_dias_con_una_sola_autorizacion() {
    let c = setup();
    c.env.mock_all_auths();
    let items = vec![&c.env, item(&c.env, 20261001, 1), item(&c.env, 20261002, 2), item(&c.env, 20261003, 3)];
    client(&c).seal_batch(&c.merchant, &items);
    // una sola autorizacion del comercio y una del atestador para todo el lote
    let auths = c.env.auths();
    assert_eq!(auths.iter().filter(|(a, _)| *a == c.merchant).count(), 1);
    assert_eq!(auths.iter().filter(|(a, _)| *a == c.attester).count(), 1);
    for d in [20261001u32, 20261002, 20261003] {
        assert_eq!(client(&c).get(&c.merchant, &d).len(), 1);
    }
}

#[test]
fn set_attester_aplica_al_siguiente_sello_y_los_viejos_conservan_el_anterior() {
    let c = setup();
    c.env.mock_all_auths();
    client(&c).seal(&c.merchant, &item(&c.env, 20261001, 1));
    let new_attester = Address::generate(&c.env);
    client(&c).set_attester(&new_attester);
    // El admin autorizo el cambio
    assert!(c.env.auths().iter().any(|(a, _)| *a == c.admin));
    assert_eq!(client(&c).attester(), new_attester);
    client(&c).seal(&c.merchant, &item(&c.env, 20261002, 2));
    // Ahora el atestador nuevo es el que se exige
    assert!(c.env.auths().iter().any(|(a, _)| *a == new_attester));
    assert!(!c.env.auths().iter().any(|(a, _)| *a == c.attester));
    assert_eq!(client(&c).latest(&c.merchant, &20261001).unwrap().attester, c.attester);
    assert_eq!(client(&c).latest(&c.merchant, &20261002).unwrap().attester, new_attester);
}

#[test]
fn set_attester_y_set_admin_exigen_al_admin() {
    let c = setup();
    let other = Address::generate(&c.env);
    assert!(client(&c).try_set_attester(&other).is_err());
    assert!(client(&c).try_set_admin(&other).is_err());
    c.env.mock_all_auths();
    client(&c).set_admin(&other);
    assert_eq!(client(&c).admin(), other);
}

#[test]
fn extend_ttl_es_publico_y_no_falla_sin_sello() {
    let c = setup();
    // sin mock_all_auths: cualquiera puede llamarlo
    client(&c).extend_ttl(&c.merchant, &DATE);
    c.env.mock_all_auths();
    client(&c).seal(&c.merchant, &item(&c.env, DATE, 1));
    client(&c).extend_ttl(&c.merchant, &DATE);
}

#[test]
fn contrato_no_expone_actualizacion_de_codigo_ni_borrado() {
    // Interfaz publica permitida por el spec 03 §4.2 (mas el constructor).
    let allowed = [
        "__constructor", "seal", "seal_batch", "get", "latest", "extend_ttl", "attester", "admin", "set_attester",
        "set_admin",
    ];
    let src = include_str!("lib.rs");
    let impl_start = src.find("#[contractimpl]").unwrap();
    let impl_src = &src[impl_start..];
    let end = impl_src.find("#[cfg(test)]").unwrap();
    let mut found = std::vec::Vec::new();
    for line in impl_src[..end].lines() {
        if let Some(rest) = line.trim_start().strip_prefix("pub fn ") {
            found.push(std::string::String::from(rest.split('(').next().unwrap()));
        }
    }
    assert_eq!(found.len(), allowed.len(), "funciones: {found:?}");
    for f in &found {
        assert!(allowed.contains(&f.as_str()), "funcion fuera del spec: {f}");
    }
    for forbidden in ["update_current_contract_wasm", ".remove(", "upgrade", "delete"] {
        let code: std::string::String =
            src[..src.find("#[cfg(test)]").unwrap()].lines().filter(|l| !l.trim_start().starts_with("//")).collect();
        assert!(!code.contains(forbidden), "no debe usar {forbidden}");
    }
}
