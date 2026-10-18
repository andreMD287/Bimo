extern crate std;

use super::*;
use bimo_p256_verifier::P256Verifier;
use soroban_sdk::{Bytes, Env, Map, Vec};
use stellar_accounts::smart_account::{ContextRuleType, Signer};

#[test]
fn constructor_crea_una_sola_regla_default_con_el_firmante_del_iphone() {
    let e = Env::default();
    // La cuenta consulta al verificador real (canonicalize_key) al crear la regla.
    let verifier = e.register(P256Verifier, ());
    let mut raw = [7u8; 65];
    raw[0] = 0x04;
    let key = Bytes::from_array(&e, &raw);
    let signers = Vec::from_array(&e, [Signer::External(verifier.clone(), key.clone())]);
    let id = e.register(BimoAccount, (signers, Map::<Address, Val>::new(&e)));
    let c = BimoAccountClient::new(&e, &id);

    assert_eq!(c.get_context_rules_count(), 1);
    let rule = c.get_context_rule(&0);
    assert_eq!(rule.context_type, ContextRuleType::Default);
    assert_eq!(rule.signers.len(), 1);
    assert_eq!(rule.signers.get(0).unwrap(), Signer::External(verifier, key));
    assert_eq!(rule.policies.len(), 0);
    assert!(rule.valid_until.is_none());
}
