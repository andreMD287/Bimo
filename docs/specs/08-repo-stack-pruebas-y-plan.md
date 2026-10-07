# Spec 08 — Repositorio, stack, entornos, pruebas y plan de construcción

**Estado:** v1.0 · **Depende de:** specs 01 a 07 · **Lo usan:** todo el equipo y Claude Code

Cierra el diseño detallado: dónde va cada cosa, con qué se construye, cómo se prueba y en qué orden se implementa el incremento 1.

---

## 1. Estructura del repositorio (monorepo)

```
/
├─ CLAUDE.md                     reglas para Claude Code (obligatorio leerlo)
├─ docs/
│  ├─ arquitectura/ARQUITECTURA.md
│  └─ specs/                     specs 01–08, vectores, referencia y README
├─ shared/
│  └─ validation-cases.json      casos de V-01..V-11 (spec 04) que corren Swift y TypeScript
├─ supabase/
│  └─ migrations/                SQL del spec 01, en orden
├─ core/                         bimo-core (TypeScript)
│  ├─ src/modules/<modulo>/      comercios, ledger, sync, cierre, stellar, verificacion, integraciones
│  ├─ src/api/                   rutas HTTP (spec 06)
│  ├─ src/workers/               sellador, indexador, ttl, conciliador, despliegue de cuentas
│  └─ openapi.yaml               generado y versionado (spec 06)
├─ contracts/                    Rust (spec 03)
│  ├─ p256-verifier/
│  ├─ registry/
│  ├─ account/                   smart account de OpenZeppelin, solo configuración
│  └─ deployments/               testnet.json, mainnet.json
├─ verifier/                     web estática de verificación + cli/verify.mjs (spec 05)
└─ ios/                          app SwiftUI
   ├─ Bimo.xcodeproj
   └─ Packages/                  BimoDomain, BimoStore, BimoSync, BimoSigner, BimoAPI
```

**Regla de módulos (ARQUITECTURA §4.3):** un módulo de `core` solo importa la interfaz pública (`index.ts`) de otro módulo y nunca consulta sus tablas. `ledger` no importa a nadie. Solo `stellar` e `integraciones` hablan con el exterior.

---

## 2. Stack y dependencias permitidas

Agregar una dependencia que no esté en esta lista requiere justificarla en el PR y actualizar esta tabla.

| Pieza | Elección | Dependencias permitidas |
|---|---|---|
| `core` | Node 22 LTS, TypeScript `strict` | `fastify`, `zod`, `@fastify/swagger`, `kysely` + `pg`, `@stellar/stellar-sdk`, `@noble/curves` y `@noble/hashes` (P-256 y low-S), `ulid`, `pino`, `jose` (JWT de Supabase); pruebas con `vitest` |
| Cola de trabajos | `outbox_messages` en Postgres con `FOR UPDATE SKIP LOCKED` | Ninguna (sin Redis) |
| Base de datos | Supabase (Postgres 15+, Auth) | `supabase` CLI para migraciones |
| Contratos | Rust, `soroban-sdk`, `stellar-contracts` (OpenZeppelin) | `stellar-cli` |
| App | iOS 18 o superior, Swift 6 con concurrencia estricta, SwiftUI con `@Observable` | `GRDB.swift`, `stellar-ios-mac-sdk`; del sistema: CryptoKit, LocalAuthentication, Network, BackgroundTasks |
| Web de verificación | Vite + React + TypeScript, estática | `@stellar/stellar-sdk` (solo RPC); hashes con WebCrypto |
| Hosting | Railway: dos servicios con la misma imagen (`api` y `worker`). Vercel para la web | — |

**ULID en Swift:** se implementa a mano en `BimoDomain` (unas 40 líneas, con prueba contra vectores), para no agregar una dependencia.

---

## 3. Entornos

| Entorno | Base de datos | Red Stellar | Simuladores | Uso |
|---|---|---|---|---|
| `local` | `supabase start` | testnet | on | Desarrollo |
| `staging` | Proyecto Supabase | testnet | on | Demo del bootcamp |
| `production` | Proyecto Supabase aparte | mainnet | **off** | Incremento 2 |

### 3.1 Variables de `core`

| Variable | Ejemplo / nota |
|---|---|
| `BIMO_ENV` | `local` · `staging` · `production` |
| `DATABASE_URL` | Conexión de Postgres (rol de servicio para workers; RLS con JWT para la API) |
| `SUPABASE_URL`, `SUPABASE_JWKS_URL` | Validación de JWT |
| `STELLAR_NETWORK` | `testnet`; carga `contracts/deployments/testnet.json` |
| `RELAYER_URL`, `RELAYER_API_KEY` | `EnviadorRelayer` |
| `ATTESTER_SECRET`, `DEPLOYER_SECRET`, `FALLBACK_SUBMITTER_SECRET` | Secretos de Railway en el incremento 1; en el incremento 2 pasan a un KMS |
| `BIMO_SIMULATORS` | `on` / `off`; **siempre `off` en `production`** (el arranque falla si no) |
| `VERIFIER_BASE_URL` | Base de los enlaces del spec 05 |

Ningún secreto va en el repositorio, en logs ni en la app. La app solo conoce la URL de la API y el `deployments/<red>.json` público.

---

## 4. Estrategia de pruebas

| Nivel | Qué cubre | Dónde corre |
|---|---|---|
| Vectores | Spec 02 (formato y Merkle) y spec 03 §2 (firmas P-256) | `node docs/specs/02-check.mjs`; las pruebas de `core`, `verifier` y `contracts` cargan los mismos archivos |
| Casos de validación compartidos | V-01 a V-11 con `shared/validation-cases.json`: `{ name, entry, expected: "ok" \| <código> }` | Vitest en `core`, XCTest en `BimoDomain` |
| Base de datos | DB-01 a DB-12 contra un Postgres real con las migraciones | Vitest + Supabase local |
| Máquinas de estado | Cada transición de spec 07 y las prohibidas | Vitest |
| Contratos | Spec 03 §10 con `soroban-sdk` testutils | `cargo test` |
| Integración en testnet | Crear cuenta → vender → cerrar → firmar → sellar → verificar, con llave de software | Script `core/scripts/e2e-testnet.ts`, manual o nocturno |
| App | Base local, outbox, sync con un servidor de prueba, firmante de software | XCTest en simulador |
| Manual | QA-04 (usabilidad) con 5 comercios reales | Lizeth |

**Convención:** cada prueba incluye en su nombre el ID de la regla o escenario que cubre (por ejemplo `DB-04 rechaza asiento descuadrado`, `D-6 enmienda tras confirmar`). Así la trazabilidad (ARQUITECTURA §8) sale de buscar el ID.

### 4.1 Escenarios de calidad → pruebas

| Escenario | Prueba que lo demuestra |
|---|---|
| QA-01 Integridad | Alterar un asiento en la BD y verificar con la web y con el script: "No coincide" |
| QA-02 Seguridad | En testnet, enviar `seal_batch` firmado solo con llaves de Bimo: la red lo rechaza |
| QA-03 Offline | 500 ventas en modo avión durante 72 h; al volver la red, todas llegan sin duplicados |
| QA-04 Usabilidad | Prueba con 5 comercios; venta en efectivo en ≤ 3 toques y ≤ 5 s |
| QA-05 Integrabilidad | Los simuladores y los adaptadores reales implementan el mismo puerto; las pruebas del dominio no cambian |
| QA-06 Privacidad | Revisión del estado de `bimo-registry` en testnet: solo raíces, conteos y banderas |
| QA-07 Costo | Medir fees de 30 sellos en testnet y extrapolar |
| QA-08 Escala | Script que cierra 1.000 comercios simulados en 10 min contra testnet |
| QA-09 Verificación | 31 días × 100 asientos verificados en < 5 s |
| QA-10 Cambio de red | Desplegar en un entorno nuevo solo cambiando `STELLAR_NETWORK` y el JSON |

---

## 5. Integración continua (GitHub Actions)

| Job | Cuándo | Pasos |
|---|---|---|
| `specs` | Siempre | `node docs/specs/02-check.mjs` |
| `core` | Cambios en `core/`, `supabase/`, `shared/` o `docs/specs/` | typecheck, lint, Postgres de servicio con migraciones, `vitest` |
| `contracts` | Cambios en `contracts/` | `cargo test`, compilar WASM, comprobar que la interfaz de `registry` y `p256-verifier` no tiene funciones fuera del spec 03 |
| `verifier` | Cambios en `verifier/` o `docs/specs/` | build y pruebas con vectores |
| `ios` | Manual (`workflow_dispatch`) o en PRs con la etiqueta `ios` | `xcodebuild test` en macOS (los minutos de macOS son limitados en repos privados) |

Una rama no se fusiona a `main` con jobs en rojo.

---

## 6. Plan de construcción del incremento 1

Cada tarea es una sesión (o pocas) de Claude Code. **Instrucción base para cada una:** "Implementa la tarea T0X de `docs/specs/08-…` siguiendo los specs indicados y `CLAUDE.md`. No inventes nada fuera de los specs; si falta algo, detente y pregunta."

| ID | Tarea | Specs | Depende de | Listo cuando |
|---|---|---|---|---|
| T01 | Esqueleto del monorepo, `CLAUDE.md`, CI vacía con el job `specs` | 08 | — | CI en verde |
| T02 | Migraciones de Supabase | 01 | T01 | Criterios del spec 01 en verde |
| T03 | Librería canónica y Merkle en `core` (portando `02-referencia.mjs`) + `shared/validation-cases.json` + validaciones V-01..V-11 en TS | 02, 04 | T01 | Vectores y casos en verde |
| T04 | Contratos `p256-verifier` y `registry` con pruebas | 03 | T01 | Criterios de contratos del spec 03 en verde |
| T05 | Despliegue en testnet, cuentas de Bimo (admin 2 de 3, attester, deployer) y `deployments/testnet.json` | 03 | T04 | Contratos desplegados y JSON en el repo |
| T06 | `core`: autenticación, `POST /merchants`, reto y `POST /devices`, worker de despliegue de `bimo-account` | 03, 06, 07 (§4) | T02, T05 | Cuenta en testnet creada con una llave de software |
| T07 | `core`: push y pull | 04, 06 | T02, T03 | Criterios del spec 04 del lado servidor |
| T08 | `core`: cierre, solicitudes de firma, envío, confirmación, enmiendas | 03, 06, 07 | T06, T07 | Transiciones del spec 07 en verde; día de ejemplo sellado en testnet |
| T09 | `core`: indexador, worker de TTL, conciliador, simuladores `/dev/*` | 03, 06, 07 | T08 | Eventos indexados; simuladores crean asientos verificados |
| T10 | `core`: enlaces y API pública de verificación | 05, 06 | T08 | Paquete del spec 05 correcto |
| T11 | Web de verificación + `cli/verify.mjs` | 05 | T10 | Criterios del spec 05 |
| T12 | iOS: `BimoDomain` (modelos, ULID, V-01..V-11 con los casos compartidos) y `BimoStore` (GRDB) | 01, 04 | T03 | Casos compartidos en verde en Swift |
| T13 | iOS: `BimoSigner` (Secure Enclave y software), onboarding y verificación del firmante por RPC | 03 §6 | T06, T12 | Cuenta creada desde el simulador |
| T14 | iOS: registrar venta, "Hoy", clientes de fiado, sync y cierre | 04, 07 | T07, T12 | Criterios del spec 04 del lado app |
| T15 | iOS: pantalla de firma (validación de la preimagen, Face ID), enlaces y "Ventas por revisar" | 03 §5, 05, 07 §6 | T08, T13, T14 | Flujo completo desde el iPhone |
| T16 | Ensayo de la demo (sección 7) y ajustes | todos | T09, T11, T15 | Demo completa sin intervención manual |

**Reparto sugerido (ARQUITECTURA §4.3):** André T04, T05, T06, T08, T13, T15; Santiago T02, T03, T07, T09, T10; Lizeth T11 y la UI de T12 a T15 (flujos, textos sin jerga). T01 lo hace André primero.

**Rutas en paralelo:** después de T01, las líneas *contratos* (T04→T05), *base de datos y núcleo* (T02, T03→T07) y *app* (T12) avanzan al mismo tiempo.

---

## 7. Guion de la demo del bootcamp (simulación)

1. Abrir la app en el simulador: crear el comercio "Tienda Doña Marta". La cuenta en Stellar se prepara sola.
2. Registrar 3 ventas (efectivo, Bre-B dividida y fiado a Doña Rosa) en **modo avión**. "Hoy" las muestra al instante.
3. Quitar el modo avión: se sincronizan.
4. Con los simuladores: llega un pago Bre-B "verificado" y una venta con Tap to Pay simulada.
5. Cerrar el día, contar el efectivo y confirmar con Face ID (en el simulador, *Features → Face ID → Matching Face*).
6. Mostrar el sello en un explorador de testnet.
7. Crear un enlace de verificación y abrirlo en el portátil: "Coincide ✅", totales por canal y "40 % verificado por terceros".
8. En vivo: cambiar un monto directamente en la base de datos y recargar la página: "No coincide ❌".
9. Cerrar con el mensaje: "Ni nosotros podemos cambiar tu historial, y cualquiera puede comprobarlo".

---

## 8. Criterios de aceptación del diseño completo

- [ ] Cada caso de uso del incremento 1 (CU-01 a CU-05) se puede recorrer de punta a punta citando solo secciones de los specs, sin pasos sin dueño.
- [ ] Toda tabla, endpoint, estado, función de contrato y formato que aparece en un spec está definido en exactamente un spec, y los demás lo referencian.
- [ ] Toda tarea T01–T16 tiene specs, dependencias y criterio de terminado.
