// Corre: node docs/specs/02-check.mjs  → debe imprimir fail=0
import fs from 'node:fs';
import * as R from './02-referencia.mjs';
const v = JSON.parse(fs.readFileSync(new URL('./02-vectores.json', import.meta.url)));
const hex = (b) => Buffer.from(b).toString('hex'), bin = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
let ok = 0, fail = 0; const t = (c, m) => c ? ok++ : (fail++, console.log('FALLA', m));
for (const x of v.entries) {
  const eb = R.encodeEntry(x.entry);
  t(hex(eb) === x.canonical_hex, 'canonical ' + x.name);
  t(hex(R.leafHash(bin(x.salt), eb)) === x.leaf_hash, 'leaf ' + x.name);
  t(R.businessDate(Date.parse(x.entry.occurred_at)) === x.business_date, 'fecha ' + x.name);
}
for (const tr of v.trees) t(hex(R.merkleRoot(tr.leaves.map(bin))) === tr.root, 'root ' + tr.size);
for (const p of v.proofs) {
  t(R.auditPath(p.leaf_index, v.trees.find(x=>x.size===p.tree_size).leaves.map(bin)).map(hex).join() === p.audit_path.join(), 'path');
  t(R.verifyInclusion(bin(p.leaf), p.leaf_index, p.tree_size, p.audit_path.map(bin), bin(p.root)), 'verify ' + p.tree_size + '/' + p.leaf_index);
}
const d = v.day_example, byId = Object.fromEntries(v.entries.map(e => [e.entry.id, e]));
const dl = d.entry_ids.map(id => bin(byId[id].leaf_hash));
t(hex(R.merkleRoot(dl)) === d.root, 'day root');
t(R.verifyInclusion(dl[2], 2, dl.length, d.proof_for_index_2.map(bin), bin(d.root)), 'day proof');
// alteración: cambiar 1 centavo debe romper la prueba
const e2 = structuredClone(byId[d.entry_ids[2]].entry); e2.lines[0].amount_minor += 1; e2.lines[1].amount_minor += 1;
const bad = R.leafHash(bin(byId[d.entry_ids[2]].salt), R.encodeEntry(e2));
t(!R.verifyInclusion(bad, 2, dl.length, d.proof_for_index_2.map(bin), bin(d.root)), 'tamper detectado');
t(hex(R.amendReasonHash(v.amend_reason_example.added_entry_ids)) === v.amend_reason_example.hash, 'amend');
console.log(`ok=${ok} fail=${fail}`);
if (fail) process.exit(1);
