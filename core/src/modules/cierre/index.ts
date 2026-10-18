// Interfaz publica del modulo cierre (spec 08 §1).
export { closeDay, listDays, loadDays, loadSeals, parseDate, sealHistory, todayInBogota } from './dias';
export type { CloseInput, DayHistory, DaySummary } from './dias';
export { MAX_DAYS_PER_REQUEST, ensureSigningRequest, getPendingSigning, supersedeIfAffected, supersedeOpenRequest } from './firma';
export type { PendingView } from './firma';
export { withMerchantLock } from './lock';
export { confirmRequest, discardRequest, failRequest, loadSubmission, markSent, submitSignature } from './sellos';
export type { SealSigner, SubmitSignatureInput, Submission } from './sellos';
