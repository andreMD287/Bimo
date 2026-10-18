// Interfaz publica del modulo comercios (spec 08 §1): otros modulos solo importan desde aqui.
export {
  CHALLENGE_TTL_MS,
  LEDGER_ACCOUNTS,
  consumeChallenge,
  createMerchant,
  getMerchantMe,
  issueChallenge,
  merchantOfUser,
  parsePublicKey,
  registerDevice,
  verifyChallengeSignature,
} from './service';
export type { MerchantMe } from './service';
