//! `bimo-account` (spec 03 §3): smart account del comercio. Es la smart account de OpenZeppelin
//! (`stellar-accounts`) sin cambios de logica; Bimo solo fija la configuracion inicial.
//!
//! Configuracion del incremento 1: una sola regla de contexto `Default` (ID 0) con el firmante
//! `Signer::External(bimo-p256-verifier, clave_publica_del_iPhone)` y sin politicas.
//! Bimo nunca queda como firmante (QA-02, ADR-02).
#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    add_context_rule, do_check_auth, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer,
    SmartAccount, SmartAccountError,
};

#[contract]
pub struct BimoAccount;

#[contractimpl]
impl BimoAccount {
    /// `signers`: el firmante externo del dueno; `policies`: vacio en el incremento 1.
    pub fn __constructor(e: &Env, signers: Vec<Signer>, policies: Map<Address, Val>) {
        add_context_rule(e, &ContextRuleType::Default, &String::from_str(e, "default"), None, &signers, &policies);
    }
}

#[contractimpl]
impl CustomAccountInterface for BimoAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for BimoAccount {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for BimoAccount {}

#[cfg(test)]
mod test;
