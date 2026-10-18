// Interfaz publica del modulo sync (spec 08 §1): otros modulos solo importan desde aqui.
export { MAX_PULL_LIMIT, pullChanges } from './pull';
export type { PullChange, PullPage } from './pull';
export { CLOCK_SUSPECT_MS, MAX_PUSH_ITEMS, pushItems } from './push';
export type { PushInput, PushItemIn, PushResultOut } from './push';
