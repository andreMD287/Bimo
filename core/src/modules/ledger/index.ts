// Interfaz publica del modulo ledger (spec 08 §1): no importa a ningun otro modulo.
export { dayOfEntry, entryOwner, existingCustomerIds, insertEntry, isReversed, loadEntries } from './entries';
export type { InsertEntryInput, StoredEntry } from './entries';
export { loadCustomers, upsertCustomer } from './customers';
export type { CustomerInput, UpsertResult } from './customers';
