/**
 * Firma de un sello (spec 03 §5.3-§5.4): verificacion de la firma P-256 del dueno, normalizacion low-S,
 * `AuthPayload` de la smart account y entrada de autorizacion del atestador.
 *
 *   signature_payload = SHA-256( XDR(HashIdPreimage) )
 *   auth_digest       = SHA-256( signature_payload ‖ XDR(Vec<u32>[0]) )     -- regla de contexto 0 (OpenZeppelin)
 *   firma             = ECDSA-P256 sobre SHA-256(auth_digest), low-S
 */
import { createHash, randomBytes } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import { Address, Keypair, authorizeEntry, xdr } from '@stellar/stellar-sdk';

const sha256 = (...parts: Uint8Array[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};

/** XDR de `Vec<u32>[0]`: los IDs de las reglas de contexto que usa la firma (spec 03 §5.3). */
export const RULE_IDS_XDR = Buffer.from(xdr.ScVal.scvVec([xdr.ScVal.scvU32(0)]).toXDR());

/** `auth_digest` que firma el dueno (despues de aplicar SHA-256 una vez mas al firmar). */
export function authDigest(preimageXdr: Uint8Array): Buffer {
  return sha256(sha256(preimageXdr), RULE_IDS_XDR);
}

/** Comprueba la firma P-256 (r ‖ s) del dueno sobre la preimagen. Acepta cualquier `s`: se normaliza despues. */
export function verifyOwnerSignature(publicKey: Uint8Array, preimageXdr: Uint8Array, signature: Uint8Array): boolean {
  if (signature.length !== 64) return false;
  try {
    return p256.verify(signature, authDigest(preimageXdr), publicKey, { prehash: true, lowS: false });
  } catch {
    return false;
  }
}

/** Soroban exige `s ≤ n/2`: si `s > n/2`, reemplaza `s` por `n − s` (spec 03 §2). */
export function normalizeLowS(signature: Uint8Array): Buffer {
  const n = p256.Point.Fn.ORDER;
  const r = signature.slice(0, 32);
  const s = BigInt('0x' + Buffer.from(signature.slice(32)).toString('hex'));
  const low = s > n / 2n ? n - s : s;
  return Buffer.concat([r, Buffer.from(low.toString(16).padStart(64, '0'), 'hex')]);
}

/** `AuthPayload { context_rule_ids: [0], signers: { External(verificador, clave): firma } }` (spec 03 §5.4). */
export function authPayloadScVal(input: { verifierId: string; publicKey: Uint8Array; signature: Uint8Array }): xdr.ScVal {
  const sym = (s: string) => xdr.ScVal.scvSymbol(s);
  const entry = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(k), val: v });
  const signer = xdr.ScVal.scvVec([sym('External'), new Address(input.verifierId).toScVal(), xdr.ScVal.scvBytes(Buffer.from(input.publicKey))]);
  return xdr.ScVal.scvMap([
    entry('context_rule_ids', xdr.ScVal.scvVec([xdr.ScVal.scvU32(0)])),
    entry('signers', xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: signer, val: xdr.ScVal.scvBytes(Buffer.from(input.signature)) })])),
  ]);
}

export interface DecodedPreimage {
  nonce: bigint;
  signatureExpirationLedger: number;
  invocation: xdr.SorobanAuthorizedInvocation;
}

/** Decodifica `HashIdPreimage::SorobanAuthorization` (spec 03 §5.1). Lanza si es de otro tipo. */
export function decodePreimage(preimageXdr: Uint8Array): DecodedPreimage {
  const pre = xdr.HashIdPreimage.fromXDR(Buffer.from(preimageXdr));
  if (pre.type !== 'envelopeTypeSorobanAuthorization') throw new Error('la preimagen no es SorobanAuthorization');
  const b = (pre as unknown as { sorobanAuthorization: { nonce: bigint; signatureExpirationLedger: number; invocation: xdr.SorobanAuthorizedInvocation } }).sorobanAuthorization;
  return { nonce: BigInt(b.nonce), signatureExpirationLedger: b.signatureExpirationLedger, invocation: b.invocation };
}

/** Entrada de autorizacion de la smart account del comercio, con la firma del dueno (spec 03 §5.4). */
export function merchantAuthEntry(input: { merchantAddress: string; preimageXdr: Uint8Array; authPayload: xdr.ScVal }): xdr.SorobanAuthorizationEntry {
  const p = decodePreimage(input.preimageXdr);
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(input.merchantAddress).toScAddress(),
        nonce: p.nonce,
        signatureExpirationLedger: p.signatureExpirationLedger,
        signature: input.authPayload,
      }),
    ),
    rootInvocation: p.invocation,
  });
}

/** Entrada del atestador de Bimo (ed25519), firmada: la misma invocacion y vigencia que la del comercio. */
export async function signAttesterEntry(input: { preimageXdr: Uint8Array; attester: Keypair; networkPassphrase: string }): Promise<Buffer> {
  const p = decodePreimage(input.preimageXdr);
  const unsigned = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(input.attester.publicKey()).toScAddress(),
        nonce: BigInt('0x' + randomBytes(7).toString('hex')),
        signatureExpirationLedger: p.signatureExpirationLedger,
        signature: xdr.ScVal.scvVec([]),
      }),
    ),
    rootInvocation: p.invocation,
  });
  const signed = await authorizeEntry(unsigned, input.attester, p.signatureExpirationLedger, input.networkPassphrase);
  return Buffer.from(signed.toXDR());
}

/** Implementacion real del `SealSigner` de cierre: verifica y normaliza con P-256 y firma la entrada del atestador. */
export function createSealSigner(opts: { attester: Keypair; networkPassphrase: string }) {
  return {
    verify: (publicKey: Buffer, preimageXdr: Buffer, signature: Buffer) => verifyOwnerSignature(publicKey, preimageXdr, signature),
    normalize: (signature: Buffer) => normalizeLowS(signature),
    signAttester: (preimageXdr: Buffer) => signAttesterEntry({ preimageXdr, attester: opts.attester, networkPassphrase: opts.networkPassphrase }),
  };
}
