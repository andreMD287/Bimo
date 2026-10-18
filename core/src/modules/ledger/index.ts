// Interfaz publica del modulo ledger (spec 08 §1): no importa a ningun otro modulo.
export {
  countDayEntries,
  dayOfEntry,
  entryOwner,
  existingCustomerIds,
  existingEntryIds,
  insertEntry,
  isReversed,
  loadDayEntriesForSeal,
  loadEntries,
} from './entries';
export type { InsertEntryInput, SealableEntry, StoredEntry } from './entries';
export { loadCustomers, upsertCustomer } from './customers';
export type { CustomerInput, UpsertResult } from './customers';
