// Interfaz publica del modulo verificacion (spec 08 §1).
export { MAX_PACKAGE_DAYS, MAX_PERIOD_DAYS, authenticateLink, buildPackage, createLink, hashToken, listLinks, requestRestore, revokeLink } from './enlaces';
export type { CreateLinkInput, LinkAccess } from './enlaces';
