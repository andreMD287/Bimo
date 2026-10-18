//! Vectores del spec 03 §2.
extern crate std;

use super::*;
use soroban_sdk::{vec, Bytes, BytesN, Env};

const KEY: &str = "04b609d9b7b75af1981c44fe316b89e3a0416a2b4cc0c42ae93ac5da8ba91215a8588f5c41d34fe80bcd7ed19e470bfc9b125a32350279d6ee867dffef85dae70e";
const HASH: &str = "d57e80ca9916952669f6de2da4f7b23cebe6fa88764c36919c7bd0edcb013f8f";
const SHA_OF_HASH: &str = "79991d75ee6b2c2c7b043dc1b85fa55b8a02bd14dc3b28195ae24ef94dbdd2e7";
const SIG_LOW_S: &str = "478017dab1238e75b685f8e322c7164bb695289e04efa4d132350439db498a055b11e328e975ef7f20d887dc6043e4c6e8df25f2cab0378b89e36556f525a8ad";
const SIG_HIGH_S: &str = "359f38f09c89bc24abaaafc28aa31446d3b517ed054043127c2ecf28af9c62fff87eba6464a1cce15861f8df4c2272b4d5e35056d92fa2fcb6628b7ac3f3c366";
const SIG_HIGH_S_NORMALIZED: &str = "359f38f09c89bc24abaaafc28aa31446d3b517ed054043127c2ecf28af9c62ff0781459a9b5e331fa79e0720b3dd8d4ae703aa56cde7fb883d573f48386f61eb";

fn unhex<const N: usize>(s: &str) -> [u8; N] {
    let mut out = [0u8; N];
    assert_eq!(s.len(), N * 2);
    for i in 0..N {
        out[i] = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap();
    }
    out
}

fn setup() -> (Env, P256VerifierClient<'static>) {
    let env = Env::default();
    let id = env.register(P256Verifier, ());
    let client = P256VerifierClient::new(&env, &id);
    (env, client)
}

fn hash(env: &Env) -> Bytes {
    Bytes::from_array(env, &unhex::<32>(HASH))
}

#[test]
fn vector_sha256_del_hash_coincide_con_el_spec() {
    let (env, _) = setup();
    let d = env.crypto().sha256(&hash(&env)).to_bytes();
    assert_eq!(d.to_array(), unhex::<32>(SHA_OF_HASH));
}

#[test]
fn firma_low_s_valida_pasa() {
    let (env, c) = setup();
    let key = BytesN::from_array(&env, &unhex::<65>(KEY));
    let sig = BytesN::from_array(&env, &unhex::<64>(SIG_LOW_S));
    assert!(c.verify(&hash(&env), &key, &sig));
}

#[test]
fn firma_high_s_normalizada_pasa() {
    let (env, c) = setup();
    let key = BytesN::from_array(&env, &unhex::<65>(KEY));
    let sig = BytesN::from_array(&env, &unhex::<64>(SIG_HIGH_S_NORMALIZED));
    assert!(c.verify(&hash(&env), &key, &sig));
}

#[test]
fn firma_high_s_sin_normalizar_falla() {
    let (env, c) = setup();
    let key = BytesN::from_array(&env, &unhex::<65>(KEY));
    let sig = BytesN::from_array(&env, &unhex::<64>(SIG_HIGH_S));
    assert!(c.try_verify(&hash(&env), &key, &sig).is_err());
}

#[test]
fn firma_sobre_otro_hash_falla() {
    let (env, c) = setup();
    let key = BytesN::from_array(&env, &unhex::<65>(KEY));
    let sig = BytesN::from_array(&env, &unhex::<64>(SIG_LOW_S));
    let mut other = unhex::<32>(HASH);
    other[0] ^= 1;
    assert!(c.try_verify(&Bytes::from_array(&env, &other), &key, &sig).is_err());
}

#[test]
fn hash_que_no_mide_32_bytes_falla() {
    let (env, c) = setup();
    let key = BytesN::from_array(&env, &unhex::<65>(KEY));
    let sig = BytesN::from_array(&env, &unhex::<64>(SIG_LOW_S));
    let short = Bytes::from_slice(&env, &unhex::<32>(HASH)[..31]);
    assert_eq!(c.try_verify(&short, &key, &sig), Err(Ok(soroban_sdk::Error::from_contract_error(Error::InvalidHashLength as u32))));
}

#[test]
fn canonicalize_devuelve_los_65_bytes_tal_cual() {
    let (env, c) = setup();
    let key = BytesN::from_array(&env, &unhex::<65>(KEY));
    let out = c.canonicalize_key(&key);
    assert_eq!(out, Bytes::from_array(&env, &unhex::<65>(KEY)));
}

#[test]
fn clave_sin_prefijo_0x04_falla() {
    let (env, c) = setup();
    let mut raw = unhex::<65>(KEY);
    raw[0] = 0x02;
    let key = BytesN::from_array(&env, &raw);
    assert_eq!(c.try_canonicalize_key(&key), Err(Ok(soroban_sdk::Error::from_contract_error(Error::InvalidKeyPrefix as u32))));
    let sig = BytesN::from_array(&env, &unhex::<64>(SIG_LOW_S));
    assert!(c.try_verify(&hash(&env), &key, &sig).is_err());
}

#[test]
fn batch_canonicalize_conserva_el_orden() {
    let (env, c) = setup();
    let a = BytesN::from_array(&env, &unhex::<65>(KEY));
    let mut raw = unhex::<65>(KEY);
    raw[1] ^= 0xff;
    let b = BytesN::from_array(&env, &raw);
    let out = c.batch_canonicalize_key(&vec![&env, a.clone(), b.clone()]);
    assert_eq!(out.get(0).unwrap(), Bytes::from_array(&env, &a.to_array()));
    assert_eq!(out.get(1).unwrap(), Bytes::from_array(&env, &b.to_array()));
}

#[test]
fn contrato_no_expone_actualizacion_de_codigo() {
    let src = include_str!("lib.rs");
    let code = &src[..src.find("#[cfg(test)]").unwrap()];
    for forbidden in ["update_current_contract_wasm", "upgrade", "storage()"] {
        assert!(!code.contains(forbidden), "no debe usar {forbidden}");
    }
}
