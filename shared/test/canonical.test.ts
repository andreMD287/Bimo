import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  amendReasonHash,
  auditPath,
  businessDate,
  encodeEntry,
  leafHash,
  merkleRoot,
  originFlags,
  verifyInclusion,
  type Entry,
} from '../src';

interface VectorEntry {
  name: string;
  entry: Entry;
  business_date: number;
  salt: string;
  canonical_hex: string;
  leaf_hash: string;
}
const v = JSON.parse(readFileSync(new URL('../../docs/specs/02-vectores.json', import.meta.url), 'utf8')) as {
  entries: VectorEntry[];
  trees: Array<{ size: number; leaves: string[]; root: string }>;
  proofs: Array<{ tree_size: number; leaf_index: number; leaf: string; audit_path: string[]; root: string }>;
  day_example: { entry_ids: string[]; root: string; proof_for_index_2: string[] };
  amend_reason_example: { added_entry_ids: string[]; hash: string };
};

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bin = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const byId = new Map(v.entries.map((e) => [e.entry.id, e]));

describe('spec 02 §10: formato canonico y Merkle contra 02-vectores.json', () => {
  for (const x of v.entries) {
    it(`spec02 bytes canonicos y hoja de ${x.name}`, () => {
      const bytes = encodeEntry(x.entry);
      expect(hex(bytes)).toBe(x.canonical_hex);
      expect(hex(leafHash(bin(x.salt), bytes))).toBe(x.leaf_hash);
      expect(businessDate(Date.parse(x.entry.occurred_at as string))).toBe(x.business_date);
    });
  }

  it('spec02 el vector venta_efectivo: hoja 8ac45b15...', () => {
    expect(v.entries[0]?.leaf_hash).toBe('8ac45b15f46df37c11c066642359e29310ad1270b217fbf9382a68a42a1e9015');
  });

  for (const tr of v.trees) {
    it(`spec02 raiz del arbol de ${tr.size} hojas`, () => {
      expect(hex(merkleRoot(tr.leaves.map(bin)))).toBe(tr.root);
    });
  }

  it('spec02 el dia vacio tiene raiz SHA-256 de la cadena vacia', () => {
    expect(hex(merkleRoot([]))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  for (const p of v.proofs) {
    it(`spec02 prueba de inclusion ${p.leaf_index}/${p.tree_size}`, () => {
      const leaves = (v.trees.find((t) => t.size === p.tree_size) as { leaves: string[] }).leaves.map(bin);
      expect(auditPath(p.leaf_index, leaves).map(hex)).toEqual(p.audit_path);
      expect(verifyInclusion(bin(p.leaf), p.leaf_index, p.tree_size, p.audit_path.map(bin), bin(p.root))).toBe(true);
    });
  }

  it('spec02 raiz del dia de ejemplo 0859...c08b y su prueba', () => {
    const d = v.day_example;
    const leaves = d.entry_ids.map((id) => bin((byId.get(id) as VectorEntry).leaf_hash));
    expect(hex(merkleRoot(leaves))).toBe(d.root);
    expect(verifyInclusion(leaves[2] as Uint8Array, 2, leaves.length, d.proof_for_index_2.map(bin), bin(d.root))).toBe(true);
  });

  it('spec02 cambiar 1 centavo, un canal, el orden de las lineas o la sal cambia la raiz del dia', () => {
    const d = v.day_example;
    const rootWith = (mutate: (e: VectorEntry) => { entry: Entry; salt: string }) => {
      const leaves = d.entry_ids.map((id, i) => {
        const base = byId.get(id) as VectorEntry;
        const m = i === 1 ? mutate(structuredClone(base)) : { entry: base.entry, salt: base.salt };
        return leafHash(bin(m.salt), encodeEntry(m.entry));
      });
      return hex(merkleRoot(leaves));
    };
    expect(rootWith((e) => ({ entry: e.entry, salt: e.salt }))).toBe(d.root);
    expect(
      rootWith((e) => {
        const l = e.entry.lines[0]!;
        l.amount_minor = Number(l.amount_minor) + 1;
        return { entry: e.entry, salt: e.salt };
      }),
    ).not.toBe(d.root);
    expect(
      rootWith((e) => {
        e.entry.lines[0]!.channel = 'breb';
        return { entry: e.entry, salt: e.salt };
      }),
    ).not.toBe(d.root);
    expect(
      rootWith((e) => {
        // mismo contenido de lineas, intercambiadas de lugar: cambia el orden canonico
        const [a, b, ...rest] = e.entry.lines;
        e.entry.lines = [{ ...b!, line_no: 1 }, { ...a!, line_no: 2 }, ...rest];
        return { entry: e.entry, salt: e.salt };
      }),
    ).not.toBe(d.root);
    expect(rootWith((e) => ({ entry: e.entry, salt: '00' + e.salt.slice(2) }))).not.toBe(d.root);
  });

  it('spec02 una prueba alterada o con leaf_index/tree_size incorrectos es rechazada', () => {
    const p = v.proofs[0]!;
    const path = p.audit_path.map(bin);
    const leaf = bin(p.leaf);
    const root = bin(p.root);
    expect(verifyInclusion(leaf, p.leaf_index, p.tree_size, path, root)).toBe(true);
    const tampered = path.map((x) => Uint8Array.from(x));
    tampered[0]![0] = (tampered[0]![0]! + 1) & 255;
    expect(verifyInclusion(leaf, p.leaf_index, p.tree_size, tampered, root)).toBe(false);
    expect(verifyInclusion(leaf, p.leaf_index + 1, p.tree_size, path, root)).toBe(false);
    // RFC 9162 no liga el tamano a la raiz: lo que debe fallar son tamanos con otra forma de arbol
    expect(verifyInclusion(leaf, p.leaf_index, 3, path, root)).toBe(false);
    expect(verifyInclusion(leaf, p.leaf_index, 100, path, root)).toBe(false);
    expect(verifyInclusion(leaf, p.tree_size, p.tree_size, path, root)).toBe(false);
    expect(verifyInclusion(leaf, -1, p.tree_size, path, root)).toBe(false);
    expect(verifyInclusion(leaf, p.leaf_index, p.tree_size, path.slice(1), root)).toBe(false);
  });

  it('spec02 el hash de la enmienda coincide con el vector y ordena los ids', () => {
    expect(hex(amendReasonHash(v.amend_reason_example.added_entry_ids))).toBe(v.amend_reason_example.hash);
    expect(hex(amendReasonHash(['B', 'A']))).toBe(hex(amendReasonHash(['A', 'B'])));
  });

  it('spec02 un texto que no esta en NFC se normaliza antes de codificar', () => {
    const base = structuredClone(v.entries[2]!.entry);
    const nfc = structuredClone(base);
    nfc.external_source = 'café';
    const nfd = structuredClone(base);
    nfd.external_source = 'café';
    expect(hex(encodeEntry(nfd))).toBe(hex(encodeEntry(nfc)));
  });

  it('spec02 originFlags: bits 0..3 y los demas en cero', () => {
    expect(originFlags([{ origin: 'declarado' }])).toBe(1);
    expect(originFlags([{ origin: 'declarado' }, { origin: 'verificado' }])).toBe(3);
    expect(originFlags([{ origin: 'on_chain' }, { origin: 'declarado', clock_suspect: true }])).toBe(1 | 4 | 8);
    expect(originFlags([])).toBe(0);
  });
});
