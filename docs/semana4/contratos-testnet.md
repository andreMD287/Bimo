# Contratos en testnet (evidencia A-05)

Red: Stellar testnet (protocolo 29). Todos los enlaces se abren sin iniciar sesión.

| Pieza | ID | Explorador |
|---|---|---|
| `bimo-registry` | `CDRMZRCZZFICPDROENVBP6VFDPB2FTZARW2A4XV7NERRM6BPSD45GZYB` | https://stellar.expert/explorer/testnet/contract/CDRMZRCZZFICPDROENVBP6VFDPB2FTZARW2A4XV7NERRM6BPSD45GZYB |
| `bimo-p256-verifier` | `CBMQY54X5BZEOF3TSCZC73MCKIC4SLDYDFNUVHQZ2PTGVTGZD7ILSBVL` | https://stellar.expert/explorer/testnet/contract/CBMQY54X5BZEOF3TSCZC73MCKIC4SLDYDFNUVHQZ2PTGVTGZD7ILSBVL |
| `bimo-account` (cuenta de prueba) | `CBR6LETMYTXQOSWIJGX5QSAZK7VESX62MBGX3P2LBHE5C5BTPKFZR74M` | https://stellar.expert/explorer/testnet/contract/CBR6LETMYTXQOSWIJGX5QSAZK7VESX62MBGX3P2LBHE5C5BTPKFZR74M |
| WASM de `bimo-account` | hash `b2e73d10…637d9c` | — |

## Transacciones

| Qué demuestra | Transacción |
|---|---|
| Despliegue de una `bimo-account` con una llave P-256 de software como único firmante | https://stellar.expert/explorer/testnet/tx/3e720a033feb623876772f78fa4435f4716c3d5020e2e55e255ec98f8d09b076 |
| `seal` del día de ejemplo del spec 02 (raíz `0859…c08b`, 5 asientos) con una cuenta G como comercio y el atestador | https://stellar.expert/explorer/testnet/tx/d948369cbe2611164b3165493ccf3205849ae718d2cfb83cd24403c9fce631a3 |
| `seal` del mismo día con la **smart account** como comercio: firma P-256 verificada por `bimo-p256-verifier` + atestador (credenciales `address_v2`) | https://stellar.expert/explorer/testnet/tx/02ac6da29fafbd6860d0ec14798154147bb52c0d6db9ca53ab1ec0936da26dee |
| Igual con credenciales `address` v1 (formato del spec 03 §5) | https://stellar.expert/explorer/testnet/tx/d70eb5927c34c53b931bc3f8654712c60ed26553a1dcc0f5d63fd14ac4f642f0 |

La cuenta que paga la comisión es `deployer`; no es firmante de la smart account.

## QA-02 (Bimo no puede sellar por un comercio)

Se intentó sellar con la smart account de prueba firmando el `AuthPayload` con una llave P-256 que **no** es la del comercio
(la única que tiene Bimo es la del atestador ed25519, que no es firmante). La red rechaza la transacción en la simulación:
`__check_auth` llama a `bimo-p256-verifier.verify` y la firma no verifica. Resultado: ❌ rechazada, como exige la prueba.

## Cuentas de Bimo

| Cuenta | Dirección | Estado |
|---|---|---|
| `admin` | `GBFEFCCRBOUD4UF5ACEM34ZJRJZTG6GZEGYB2JDXLMBXG4TRYM2FP2B6` | **Pendiente:** hoy tiene una sola llave (André). Falta convertirla a multifirma 2 de 3 con las llaves públicas de Santiago y Lizeth (`setOptions`, sin redesplegar contratos) |
| `attester` | `GCDRSXTAE34Q6BLZUIC3LIFN3326LI3R75BNH4DLGZJFCDQBOZQF7VQX` | Llave en el llavero local de `stellar keys`; irá a las variables de Railway |
| `deployer` | `GCSGJMK4653I7I5HKI7CIYKROGA5EOFEINSG43LIVSLVEIPOYRCXQCBE` | Ídem |
| `fallback-submitter` | `GCVKJX6WOVWBGPG6ANDUTHCIYF7S4QMKSSULQ4CB4DIJRURAGOU6P27C` | Ídem |

## Despliegue de cuentas con el código de `core` (A-08)

`pnpm --filter @bimo/core exec tsx scripts/e2e-testnet-account.ts` ejecuta el mismo código del worker (`StellarAccountDeployer` +
`EnviadorDirecto`): la cuenta `deployer` crea la `bimo-account`, `fallback-submitter` paga la comisión con un fee-bump, y se
comprueba leyendo la regla 0 directo de RPC que el único firmante es la llave del comercio (Bimo no es firmante).

| Qué | Enlace |
|---|---|
| Cuenta creada por el worker (`CCFVALFKXWRV7FREHNTCBGZYTGX5Q7THJZ7HVE6UQSXOZKGGDWQZFVLS`) | https://stellar.expert/explorer/testnet/contract/CCFVALFKXWRV7FREHNTCBGZYTGX5Q7THJZ7HVE6UQSXOZKGGDWQZFVLS |
| Transacción de despliegue (fee-bump) | https://stellar.expert/explorer/testnet/tx/03da953b5f154ca0f9dcd5f2ba78d59a8e25a5104800dd0243be019a7ba99b66 |

## Día de ejemplo del spec 02 sellado desde el código de `core` (A-12, spec 03 §10)

`BIMO_E2E_TESTNET=1 … pnpm --filter @bimo/core exec vitest run test/e2e-testnet.test.ts` corre el flujo completo con el
código real: el worker despliega la `bimo-account` del comercio de los vectores, se cierra el día, `core` simula
`seal_batch` y arma la preimagen, una llave P-256 de software (la del spec 03 §2) firma como lo hará el iPhone, `core`
verifica la firma, la normaliza a low-S y firma la entrada del atestador, y el worker envía la transacción con la doble
autorización. Después `get` devuelve el sello con la raíz del spec.

| Qué | Enlace |
|---|---|
| Cuenta del comercio del vector (`CDDYB3LCUTI7JEATRDAUI3CHYKAPH7UNGO6O4S4PHIONJVI2EMFIIX6W`) | https://stellar.expert/explorer/testnet/contract/CDDYB3LCUTI7JEATRDAUI3CHYKAPH7UNGO6O4S4PHIONJVI2EMFIIX6W |
| `seal_batch` del 6 de octubre de 2026: 5 asientos, raíz `08594093d062d8af0c1130c30ec1944acb254293eaf291b956d27ac68716c08b`, `origin_flags = 3` | https://stellar.expert/explorer/testnet/tx/5af5af5ecaefe5a824a3dfdae21c454651210d156099837afa3e57f39c514834 |

**QA-02:** la misma prueba intenta sellar otro día firmando con una llave P-256 que no es la del comercio (lo único que
Bimo podría fabricar): la red la rechaza en la simulación y el registro no guarda nada.
