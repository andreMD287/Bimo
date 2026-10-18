// Interfaz publica del modulo comercios (spec 08 §1): otros modulos solo importan desde aqui.
export {
  CHALLENGE_TTL_MS,
  LEDGER_ACCOUNTS,
  consumeChallenge,
  createMerchant,
  getAccountInfo,
  getDevicePublicKey,
  getMerchantMe,
  issueChallenge,
  merchantOfUser,
  parsePublicKey,
  registerDevice,
  verifyChallengeSignature,
} from './service';
export type { MerchantMe } from './service';
export {
  DEPLOY_LEASE_MS,
  claimAccountDeploy,
  closeDeployMessage,
  completeDeploy,
  failDeploy,
  getDeployContext,
  retryDeployLater,
  startDeploying,
} from './cuentas';
export type { DeployContext, DeployMessage } from './cuentas';
export { loadChannels, upsertChannel } from './canales';
export type { ChannelInput, ChannelUpsertResult } from './canales';
