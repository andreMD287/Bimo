import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyPackage } from '../src';
import type { OnChainSeal, VerificationPackage } from '../src/types';

const vec = JSON.parse(readFileSync(new URL('../../docs/specs/02-vectores.json', import.meta.url), 'utf8')) as {
  entries: Array<{ entry: any; salt: string }>;
  day_example: { entry_ids: string[]; root: string };
};

class MockReader {
  constructor(private seals: OnChainSeal[]) {}
  async getSeals(_registryId: string, _merchantAddress: string, _date: number): Promise<OnChainSeal[]> {
    return this.seals;
  }
}

describe('verifier/cli/verify.mjs logic & verification', () => {
  it('verifica un paquete de fixture correctamente', async () => {
    // Usamos el ejemplo del vector 02
    const entries = vec.day_example.entry_ids.map(id => {
      const found = vec.entries.find(e => e.entry.id === id);
      return { entry: found!.entry, salt: found!.salt, clock_suspect: false };
    });

    const pkg: VerificationPackage = {
      format: 'bimo-verification-v1',
      merchant: { merchant_id: entries[0].entry.merchant_id, business_name: 'Comercio Test', stellar_address: 'CBR6LETMYTXQOSWIJGX5QSAZK7VESX62MBGX3P2LBHE5C5BTPKFZR74M' },
      network: { network_passphrase: 'Test SDF Network ; September 2015', rpc_url: 'https://rpc', registry_ids: ['CDRMZRCZZFICPDROENVBP6VFDPB2FTZARW2A4XV7NERRM6BPSD45GZYB'] },
      link: { date_from: '2026-10-06', date_to: '2026-10-06', expires_at: '2027-01-01T00:00:00.000Z' },
      days: [{ date: 20261006, status: 'sellado', entries, seals: [{ version: 1, tx_hash: 'abc', added_entry_ids: [] }] }]
    };

    // Calculamos el root correcto
    const { merkleRoot, leafHash, encodeEntry, originFlags } = await import('@bimo/shared');
    const root = merkleRoot(entries.map(e => leafHash(Buffer.from(e.salt, 'hex'), encodeEntry(e.entry))));

    const reader = new MockReader([{ version: 1, root, entryCount: entries.length, originFlags: originFlags(entries.map(e => ({ origin: e.entry.origin }))), reasonHash: null }]);

    const trusted = [{ networkPassphrase: pkg.network.network_passphrase, registryIds: pkg.network.registry_ids }];
    const res = await verifyPackage(pkg, { reader, trusted });

    expect(res.trusted).toBe(true);
    expect(res.days[0].result).toBe('coincide');
  });

  it('detecta alteracion de un monto (da no coincide)', async () => {
    const entries = vec.day_example.entry_ids.map(id => {
      const found = vec.entries.find(e => e.entry.id === id);
      return { entry: found!.entry, salt: found!.salt, clock_suspect: false };
    });

    // Alteramos un monto
    entries[0].entry.lines[0].amount_minor = Number(entries[0].entry.lines[0].amount_minor) + 999;

    const pkg: VerificationPackage = {
      format: 'bimo-verification-v1',
      merchant: { merchant_id: entries[0].entry.merchant_id, business_name: 'Comercio Test', stellar_address: 'CBR6LETMYTXQOSWIJGX5QSAZK7VESX62MBGX3P2LBHE5C5BTPKFZR74M' },
      network: { network_passphrase: 'Test SDF Network ; September 2015', rpc_url: 'https://rpc', registry_ids: ['CDRMZRCZZFICPDROENVBP6VFDPB2LBHE5C5BTPKFZR74M'] },
      link: { date_from: '2026-10-06', date_to: '2026-10-06', expires_at: '2027-01-01T00:00:00.000Z' },
      days: [{ date: 20261006, status: 'sellado', entries, seals: [{ version: 1, tx_hash: 'abc', added_entry_ids: [] }] }]
    };

    const reader = new MockReader([{ version: 1, root: Buffer.alloc(32), entryCount: entries.length, originFlags: 0, reasonHash: null }]);

    const trusted = [{ networkPassphrase: pkg.network.network_passphrase, registryIds: pkg.network.registry_ids }];
    const res = await verifyPackage(pkg, { reader, trusted });

    expect(res.trusted).toBe(true);
    expect(res.days[0].result).toBe('no_coincide');
  });
});
