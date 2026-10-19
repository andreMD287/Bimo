// Recorrido de punta a punta contra el entorno local (Supabase local + bimo-core + Stellar testnet), sin pantalla.
// Uso: pnpm --filter @bimo/core exec tsx ../frontend/scripts/smoke-local.ts  (con core y worker corriendo)
import { configureRandom } from '@bimo/shared';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { asientoVenta } from '../src/mocks/contabilidad';
import { fechaBogota, ahoraISO } from '../src/lib/fechas';
import { memoryKv } from '../src/kv';
import { createRuntime } from '../src/runtime/runtime';
import { cargarFirmante } from '../src/signer';
import { MemoryStore } from '../src/store/memory';

configureRandom((n) => new Uint8Array(randomBytes(n)));
const dep = JSON.parse(readFileSync(new URL('../../contracts/deployments/testnet.json', import.meta.url), 'utf8'));
const SUPA = process.env.SUPA ?? 'http://127.0.0.1:54321';
const API = process.env.API ?? 'http://127.0.0.1:8787';
const INBUCKET = process.env.INBUCKET ?? 'http://127.0.0.1:54324';
const ANON = process.env.ANON ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const kv = memoryKv();
const rt = createRuntime({
  config: { apiUrl: API, supabaseUrl: SUPA, anonKey: ANON, deployments: { network_passphrase: dep.network_passphrase, rpc_url: dep.rpc_url, registry_ids: dep.registry_ids } },
  kv, store: new MemoryStore(), signer: cargarFirmante(kv, (n) => new Uint8Array(randomBytes(n))),
});
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const email = `marta${Date.now()}@bimo.test`;
await rt.sendCode(email);
log(`codigo enviado a ${email}`);
let code = '';
for (let i = 0; i < 20 && !code; i++) {
  await sleep(1000);
  const found = (await (await fetch(`${INBUCKET}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages?: Array<{ ID: string }> };
  if (found.messages?.[0]) {
    const msg = (await (await fetch(`${INBUCKET}/api/v1/message/${found.messages[0].ID}`)).json()) as { Text: string; HTML: string };
    code = /([0-9]{6})/.exec(`${msg.Text} ${msg.HTML}`)?.[1] ?? '';
  }
}
if (!code) throw new Error('no llego el codigo');
log(`codigo ${code}`);
await rt.register({ email, code, businessName: 'Tienda Doña Marta' });
log('comercio y dispositivo registrados');
let acc = rt.account();
for (let i = 0; i < 60 && acc?.account_status !== 'ready'; i++) { await sleep(2000); acc = await rt.refreshAccount(); }
log(`cuenta: ${acc?.account_status} ${acc?.stellar_address}`);
if (acc?.account_status !== 'ready') throw new Error('la cuenta no quedo lista');

const canal = { id: 'x', channel: 'efectivo', enabled: true } as never;
const hoy = fechaBogota(ahoraISO());
for (const monto of [1_500_000, 2_300_000, 800_000]) rt.store.addEntry(asientoVenta(ahoraISO(), [{ canal, monto_minor: monto }], null), null, 'local');
log('3 ventas guardadas en el celular');
rt.store.transaction(() => { rt.store.upsertDay(hoy, { status: 'cerrado', counted_cash_minor: 4_600_000, closed_at: ahoraISO() }); rt.store.enqueueClose(hoy); });
const rep = await rt.sync();
log(`sync: ${JSON.stringify(rep)}`);
const r = await rt.signPending({ onPhase: (p) => log(`firma: ${p}`), timeoutMs: 180_000 });
log(`sellado: ${r.sealedDates}`);
const link = await rt.createLink({ date_from: hoy, date_to: hoy, expires_in_days: 7 });
log(`enlace: ${link.url}`);
const token = link.url.split('#t=')[1] as string;
const v = await rt.verify(token);
log(`verificacion: ${JSON.stringify(v.result).slice(0, 400)}`);
