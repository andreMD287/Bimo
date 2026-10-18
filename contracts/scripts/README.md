# Scripts de prueba en testnet

Scripts de referencia que usamos para la evidencia de A-05 (no son código de producción; `core` hace lo mismo en A-12).
Requieren `npm i @stellar/stellar-sdk @noble/curves @noble/hashes` en esta carpeta y las llaves de testnet en el
llavero de `stellar keys` (nunca en el repo).

- `seal-account.mjs`: sella un día con una `bimo-account` como comercio (firma P-256 de software + atestador).
  Último argumento `v2` (credenciales `address_v2`, lo que devuelve hoy la simulación) o `v1` (spec 03 §5).
- `seal-merchant-g.mjs`: sella un día con una cuenta G como comercio.

Hallazgos (protocolo 29 en testnet): la simulación devuelve credenciales `address_v2`, cuyo preimage es
`SorobanAuthorizationWithAddress`. Las credenciales v1 siguen aceptadas y el flujo del spec 03 §5 funciona con las dos.
Con `@noble/curves` v2, `p256.sign(auth_digest, priv)` (prehash por defecto) firma `SHA-256(auth_digest)`, que es lo que verifica el contrato.
