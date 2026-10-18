//! `bimo-p256-verifier` (spec 03 §2): verifica firmas P-256 crudas para la smart account.
//! Implementa el trait `Verifier` de OpenZeppelin (`stellar-accounts`). No es actualizable.
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, panic_with_error, Bytes, BytesN, Env, Vec};
use stellar_accounts::verifiers::Verifier;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `key_data[0]` no es `0x04` (clave SEC1 sin comprimir).
    InvalidKeyPrefix = 1,
    /// El `hash` (auth_digest) no mide 32 bytes.
    InvalidHashLength = 2,
}

#[contract]
pub struct P256Verifier;

impl Verifier for P256Verifier {
    type KeyData = BytesN<65>;
    type SigData = BytesN<64>;

    fn verify(e: &Env, hash: Bytes, key_data: BytesN<65>, sig_data: BytesN<64>) -> bool {
        if hash.len() != 32 {
            panic_with_error!(e, Error::InvalidHashLength);
        }
        // El firmante firma SHA-256(auth_digest): igual que CryptoKit (inc. 2).
        let digest = e.crypto().sha256(&hash);
        // Falla (panic) si la firma no es valida o si s esta en la mitad alta (low-S).
        e.crypto().secp256r1_verify(&key_data, &digest, &sig_data);
        true
    }

    fn canonicalize_key(e: &Env, key_data: BytesN<65>) -> Bytes {
        if key_data.get(0) != Some(0x04) {
            panic_with_error!(e, Error::InvalidKeyPrefix);
        }
        Bytes::from_slice(e, &key_data.to_array())
    }

    fn batch_canonicalize_key(e: &Env, key_data: Vec<BytesN<65>>) -> Vec<Bytes> {
        Vec::from_iter(e, key_data.iter().map(|key| Self::canonicalize_key(e, key)))
    }
}

#[contractimpl]
impl P256Verifier {
    pub fn verify(e: &Env, hash: Bytes, key_data: BytesN<65>, sig_data: BytesN<64>) -> bool {
        <Self as Verifier>::verify(e, hash, key_data, sig_data)
    }

    pub fn canonicalize_key(e: &Env, key_data: BytesN<65>) -> Bytes {
        <Self as Verifier>::canonicalize_key(e, key_data)
    }

    pub fn batch_canonicalize_key(e: &Env, key_data: Vec<BytesN<65>>) -> Vec<Bytes> {
        <Self as Verifier>::batch_canonicalize_key(e, key_data)
    }
}

#[cfg(test)]
mod test;
