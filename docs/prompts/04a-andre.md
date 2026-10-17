# Entregable 4 — Prompt de André

> En Claude Code, en la raíz del repo: `Haz git pull de main. Luego lee docs/prompts/04a-andre.md y empieza.` (El `04-entregable-semana4.md` es contexto: no lo ejecutes por separado.)

## Tu rol

Eres el desarrollador principal de Bimo junto a André. En este entregable tu trabajo es dejar **funcionando de verdad** la rebanada vertical: contrato propio en testnet, backend mínimo y el front conectado. Primero **desbloqueas al equipo** (Fase 0) y después construyes en orden de riesgo. Tienes dos días, así que cada fase tiene un punto donde se corta.

Primero lee completos `CLAUDE.md`, `docs/prompts/04-entregable-semana4.md` (contexto común, recorte, niveles, dueños de archivos y calendario) y `docs/semana2/ProductBlueprint.md`. Luego los specs: 03 §4, §7, §8, §9 y §10, 02 completo, 05 §3 y §4, 06 §3.1, §3.4, §3.5 y §3.6, y 08 §2 y §3.

Trabajo en Windows. Verifica qué hay instalado (Node, npm, Git, `gh`, Rust, `stellar-cli`) y dime qué falta, con el comando para instalarlo; no instales nada del sistema sin preguntar. Antes de cada fase, muéstrame un plan corto y espera mi "ok". Si el spec no alcanza, o la librería real no coincide con el spec, **para y propón el cambio exacto al spec** (archivo, sección y texto nuevo).

## Fase 0 — Desbloquear al equipo (meta: 1 hora, y push a `main`)

Rama `feat/semana4-andre`. Al terminar, fusiona a `main` y dime qué mensaje mandar al grupo.

1. **El recorte.** Redacta como cambios a los specs lo que decide la sección "La rebanada vertical" del contexto común: en el spec 03, que en el MVP el comercio puede ser una cuenta G (ed25519) y `bimo-account` y `bimo-p256-verifier` quedan para después; en el spec 06, el subconjunto de endpoints; en el spec 08, el plan recortado. Muéstrame los textos y **espera mi aprobación**; luego un commit `docs(specs): recorte del MVP de la semana 4`.
2. **Documentación.** Crea `docs/semana4/MVPFunctional.md` con los encabezados en el orden del contexto común y un marcador `<!-- Escribe aquí: <persona> -->` en cada parte.
3. **Interfaz de los hooks.** Congela los tipos nuevos, con valores simulados por ahora:
   - `useSello`: agrega `txHash | null`, `urlExplorador | null`, `error` (`null` o `{ codigo, texto }` con los textos del spec 07 §6) y `modo` (`'demo' | 'testnet'`). La fase gana `'preparando'` y `'enviando'` entre `'confirmando'` y `'sellado'`.
   - `useVerificacion`: agrega `estadoLectura` (`'leyendo' | 'listo' | 'error_red'`), y por día `urlExplorador | null` y `raizEnCadena | null`.
   - `useEnlaces`: sin cambios de forma.
   - Variable `EXPO_PUBLIC_MODO=demo|testnet`; **`demo` es el valor por defecto** y se comporta como hoy.
   Documenta los cambios en el comentario inicial de cada hook. Lizeth y Santiago programan contra esto.
4. **Monorepo mínimo.** Propón la forma de que `shared/` (de Santiago) lo consuman `core/`, `verifier/` y `frontend/` sin romper `npx expo export --platform web` ni Metro. Prueba la opción antes de proponerla y espera mi decisión. Crea las carpetas vacías con `package.json` solo si ayuda a desbloquear a Santiago.

## Fase 1 — `bimo-registry` (el contrato)

Ruta `contracts/registry/`. Spec 03 §4 **sin cambios de lógica**: tipos, funciones, errores y eventos exactos.

1. Pruebas primero, con el ID del criterio en el nombre (spec 03 §10, sección Registry): sin autorización del comercio o del atestador falla; segundo `seal` del día → `AlreadySealed`; enmienda con `prev_version` viejo → `VersionConflict`; lotes de 15, vacío o con fecha repetida fallan sin guardar; `set_attester` conserva el atestador de los sellos viejos; el contrato compilado no expone actualización de código ni borrado.
2. Implementa hasta que pase. `soroban-sdk` y `stellar-contracts` en versiones compatibles, fijadas en `Cargo.lock`. Revisa el código fuente de la versión que fijes; si el spec no coincide, para y pregúntame.
3. `stellar contract build` (adapta a Windows lo que asuma otro sistema) y `cargo test` en verde.
4. **Opcional, solo después del Hito 1:** `contracts/p256-verifier/` con los vectores exactos del spec 03 §2 (nivel 3).

## Fase 2 — Testnet (Hito 1: domingo al mediodía)

1. Con `stellar keys generate` (en mi máquina, nunca en el repo) crea las cuentas de testnet: `admin`, `attester` y `deployer`, y financia con Friendbot. Dime cuáles son públicas para el JSON. En testnet el admin es una sola cuenta: anótalo en "Riesgos y pendientes".
2. Despliega `bimo-registry` con `__constructor(admin, attester)`. Escribe `contracts/deployments/testnet.json` con el formato del spec 03 §9 (solo lo que exista; no inventes IDs).
3. **Primera transacción real:** un `seal` con el día de ejemplo del spec 02 (raíz `0859…c08b`), firmado por una cuenta de comercio de prueba y por el atestador. Comprueba que `get` lo devuelve.
4. Prueba QA-02: la misma transacción firmada solo con llaves de Bimo la rechaza la red. Guarda el resultado.
5. Anota en `docs/semana4/MVPFunctional.md`, sección de evidencia: enlaces del explorador al contrato y a cada transacción. Avísame para avisar al grupo.

## Fase 3 — Backend mínimo (`core/`)

Node 22 y TypeScript `strict`. Solo las dependencias del spec 08 §2. Propón dónde desplegarlo (Railway, como el spec, o Vercel si no hay cuenta) y espera mi decisión.

1. **Base de datos:** un proyecto de Supabase en la nube, con **solo** las tablas mínimas del spec 01 que necesites (comercio, asientos con líneas, días, enlaces de verificación), copiadas literalmente. Migraciones en `supabase/migrations/`. Prueba el caso del spec 01 §11 (`2026-10-07T04:30:00Z` → `2026-10-06`).
2. **Endpoints del spec 06**, solo: registrar comercio (§3.1), subir ventas (subconjunto de §3.2), cerrar el día y preparar el sello (§3.3 y §3.4), enviar el sello firmado (§3.4), crear enlace (§3.5) y la API pública de verificación (§3.6). Usa la raíz Merkle de `shared/`, que construye Santiago; mientras no esté, no la reimplementes: avísame.
3. **Flujo del sello con cuenta G:** el backend arma y simula `seal` con el comercio como firmante, firma la autorización del atestador y devuelve el sobre para que el comercio firme; luego lo envía y espera la confirmación. Elige entre la fuente de la transacción y las entradas de autorización **con la API real del SDK** y dime la decisión con los dos caminos. Normaliza errores del contrato a los códigos del spec 03 §4.3.
4. Secretos solo como variables de entorno del servicio. `.env.example` con los nombres, sin valores. Si `BIMO_ENV=production`, los simuladores y el modo demo están apagados.
5. Pruebas con `vitest` que lleven el ID de la regla en el nombre. Sin montos ni datos personales en logs ni en la cadena.

## Fase 4 — Conectar el front

1. `frontend/src/signer/`: interfaz `Firmante` y una implementación de **software con llave ed25519** (la del comercio). En web, `localStorage`; en nativo, `expo-secure-store`. Si el SDK de Stellar no corre en Expo Go sin dependencias nativas que Expo Go no traiga, **la prioridad es la web**: avísame y seguimos solo con web.
2. `frontend/src/api/`: cliente de la API de `core/` (URL de `EXPO_PUBLIC_API_URL`).
3. Reescribe `useSello` y `useVerificacion` (y lo mínimo de `useCierre`, `useEnlaces` y `useComercio`) para el modo `testnet`, respetando la interfaz congelada. En modo `demo` se mantiene la simulación de hoy, y es el respaldo si algo falla.
4. En el verificador, el control "Simular alteración" pasa a alterar una **copia local** de un asiento antes de recalcular, de modo que el ❌ sea real (nivel 2).
5. Variables en Vercel: solo `EXPO_PUBLIC_MODO` y `EXPO_PUBLIC_API_URL`; **nunca** secretos. Dime los pasos y yo inicio sesión; no pidas ni guardes credenciales.

## Fase 5 — Documentación, integración y entrega

1. En `docs/semana4/MVPFunctional.md`, solo tus partes: **Aprendizajes y ajustes** (150–300 palabras; incluye qué cambió respecto a lo declarado en el Entregable 3 y por qué), **Riesgos y pendientes** (200–400; con honestidad: admin de una sola firma, llave de software en el dispositivo, comercio con cuenta G, relayer, TTL, Tap to Pay) y la tabla de evidencia de producto, contratos y transacciones.
2. Revisa los PRs de Lizeth y Santiago: que solo toquen sus archivos, que usen los hooks y que no rompan la web. Si una pantalla necesita un dato que ningún hook da, agrégalo tú.
3. **Domingo 8:00 p. m.:** dime en qué nivel estamos (1 o 2) y qué se corta.
4. **Lunes por la mañana:** ensayo del flujo completo en el enlace de Vercel, en modo `testnet`, de punta a punta. Dime qué falla.
5. Corre la lista de verificación final del contexto común, con el comando de commits por autor y la búsqueda de secretos.
6. Recuérdame registrar el proyecto en Apex antes de las 8:00 p. m. del lunes, con el enlace de Vercel en **Website**.

## Puntos donde es fácil equivocarse

| Dónde | Qué cuidar |
|---|---|
| Registry | No hay función de actualización de código ni de borrado (ADR-15); agrega la prueba que lo compruebe |
| Firma con cuenta G | `merchant.require_auth()` se cumple con la firma del comercio sobre la entrada de autorización o sobre la transacción, según quién sea la fuente. Decídelo con el SDK real, no por intuición |
| `@stellar/stellar-sdk` en web y Expo Go | Puede necesitar polyfills (`Buffer`, `crypto.getRandomValues`). Pruébalo primero en web |
| Fees y cuentas | La cuenta del comercio necesita XLM de testnet (Friendbot). Es una limitación del MVP; anótala |
| Fecha | Que no sea futura en Bogotá (lo valida `core`, no el contrato) |
| Datos en cadena | Solo raíces, conteos y banderas. Nada de montos ni datos personales |
| Modo `demo` | Nunca se rompe: es lo que se muestra si la red falla durante el video |
| Secretos | Ninguno en el repo ni en Vercel; el atestador solo en el servicio de `core` |

## Al terminar cada fase

Resume qué hiciste, qué quedó pendiente y si algo merece cambiar un spec. Yo reviso y fusiono los PRs.
