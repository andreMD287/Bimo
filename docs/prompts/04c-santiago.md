# Entregable 4 — Prompt de Santiago

> **Puedes empezar hoy con S-01 y S-02: no dependen de nadie.** El resto va saliendo a medida que André cierre sus issues.
> 1. `git checkout main && git pull`
> 2. En Claude Code, en la raíz del repo: `Lee docs/prompts/04c-santiago.md y empieza.`

## Tu rol

Tus issues son **S-01 a S-10** (`persona:santiago`): el paquete `shared`, la integración continua, las pruebas de base de datos, los simuladores y el worker de TTL de `core`, la lógica y el CLI de verificación, y el development build en tu Mac. Son tareas acotadas y bien definidas, pero **de ellas depende el resto**: `shared` lo usan el backend, la app y el verificador, y no pueden avanzar con el sello real sin él.

Primero lee completos `CLAUDE.md` y `docs/prompts/04-entregable-semana4.md` (contexto común, hitos, dueños de archivos y reglas). Antes de cada issue, lee el issue completo y los specs que cita.

Trabaja cada issue con el flujo de `CLAUDE.md` §8 y de `docs/prompts/02-arranque-andre.md` (sección "Cómo trabajar cada issue"): plan corto, espera mi "ok", mueve la tarjeta a In Progress, rama `feat/<ID>-<slug>`, PR con `Closes #n` o `Refs #n`, tarjeta a In Review. André fusiona. Necesitas `gh auth refresh -s project`.

## Qué archivos son tuyos

- `shared/` (todo)
- `verifier/` (todo)
- `.github/workflows/`
- Pruebas de base de datos (S-05); `core/src/workers/ttl*` y `core/src/api/dev*` (S-06 y S-07)
- `docs/dev-build.md`
- `README.md` y `.env.example` de la raíz
- En `docs/semana4/MVPFunctional.md`: "Cómo verificar tú mismo" y tu línea en "Participación"

Los demás archivos de `core/` son de André: si necesitas un cambio, pídelo por el grupo. Las pantallas de bienvenida, canales, historial y compartir **ya no son tuyas**: pasaron a Lizeth (L-02 y L-09).

## Orden de trabajo

| Orden | Issue | Cuándo | Notas |
|---|---|---|---|
| 1 | **S-01** `shared`: paquete base, ULID y tipos | Hoy | TypeScript `strict`, sin dependencias de Node ni de React Native. Solo `@noble/hashes` y `ulid`; pruebas con `vitest`. Los enums del spec 01. Si André aún no dejó el esqueleto del monorepo (A-01), arma el paquete con su propio `package.json` y se adapta después |
| 2 | **S-02** `shared`: formato canónico y Merkle | Hoy, es lo más urgente | Porta `docs/specs/02-referencia.mjs` a TypeScript: **ni un byte distinto**. Pruebas con `docs/specs/02-vectores.json` y el ID de cada vector en el nombre. `node docs/specs/02-check.mjs` sigue en verde. El día de ejemplo da la raíz `0859…c08b`. Avisa por el grupo cuando esté en `main`: André lo usa en A-11 |
| 3 | **S-03** `shared`: casos de validación y reglas V-01..V-11 | Hoy o mañana temprano | `shared/validation-cases.json` con **al menos un caso válido y uno inválido por regla**, con la forma `{ name, entry, expected: "ok" \| <código> }` del spec 08 §4, e implementación de las reglas del spec 04. André lo usa en A-09 |
| 4 | **S-04** CI | Hoy o mañana | Jobs del spec 08 §5: `specs`, `shared`, `core`, `contracts`, `verifier` y `frontend` (typecheck, lint, `jest-expo`). Corren en Ubuntu, sin macOS. Si A-01 ya creó el job `specs`, agrega los demás; cada job se activa cuando existe su carpeta. Ninguna rama se fusiona con jobs en rojo |
| 5 | **S-05** Pruebas de base de datos | Después de A-02 | DB-01..DB-12 y los ejemplos del spec 01 §6 contra las migraciones, con un Postgres real. El caso `2026-10-07T04:30:00Z` → `2026-10-06`. Cada prueba con su ID en el nombre |
| 6 | **S-06** Simuladores `/dev/*` | Después de A-09 | Spec 06 §3.7. Entran por el `inbox`, como un pago Bre-B verificado y una venta con Tap to Pay simulada. **Apagados siempre en `production`** (`BIMO_SIMULATORS=off`; el arranque falla si no) |
| 7 | **S-07** Worker de TTL | Después de A-08 | Spec 03 §4.5: llama `extend_ttl` sobre los días por expirar y extiende la instancia y el código del registry, del verificador y de cada `bimo-account` |
| 8 | **S-08** Lógica de verificación | Después de A-14 | Hooks para la página `/verificar` (spec 05 §4): lee Stellar RPC, recalcula la raíz con `shared`, da el resultado por día (✅ / ⚪ / ❌) y los totales por canal solo de los días que coinciden. Lizeth consume esto en L-10: avísale cuáles son los tipos |
| 9 | **S-09** CLI `verifier/cli/verify.mjs` | Después de S-08 | Spec 05 §5. Un tercero comprueba un historial sin la app. Empieza con un modo `--fixture` que lee un JSON de ejemplo y no necesita red; con pruebas, incluida una que altera un monto y espera ❌. Luego usa la red real y la API pública. No inventes endpoints: si falta alguno, pídeselo a André |
| 10 | **S-10** Development build en tu Mac | Cuando A-16 esté en `main` | Compílalo con `npx expo run:ios --device` y tu Apple ID gratuito, e instálalo en el iPhone de André (spec 08 §3.0). Documenta los pasos en `docs/dev-build.md`. La firma gratuita vence a los 7 días. Es lo que permite Face ID real; hasta entonces la app corre en Expo Go y en web. Si no alcanza antes del congelamiento del lunes a las 2:00 p. m., queda dicho en "Riesgos y pendientes" |

## Además

- **README.md** de la raíz: mantén lo del Entregable 3 y agrega `contracts/`, `core/`, `shared/` y `verifier/` al árbol, cómo correr las pruebas de cada uno y las variables del `.env.example` (solo nombres, nunca valores; pídele a André la lista). Prueba cada comando en un clon limpio antes de darlo por bueno.
- **Cómo verificar tú mismo** (en `MVPFunctional.md`): tres o cuatro comandos que cualquier persona pueda copiar y correr desde un clon limpio, y qué debe ver. Lo escribes cuando S-09 esté listo y lo pruebas en un clon limpio.

## Reglas que no se negocian

1. **No inventes** nada fuera de los specs. Si falta algo o se contradice, detente y propón el cambio exacto al spec a André.
2. **Pruebas primero** en lo que tiene vectores o reglas con ID.
3. Sin secretos en el repo; `.env` en `.gitignore`.
4. Si un issue de André del que dependes no está listo, no lo adelantes tú en sus archivos: avísale y sigue con otro de tu lista.

## Al terminar cada issue

1. Resume qué hiciste y qué quedó pendiente.
2. Cada PR sale **con tu cuenta**. Avísale a André cuando abras uno, y por el grupo cuando cierres algo que alguien está esperando (S-02, S-03 y S-08 son los que más desbloquean).
3. Al final, escribe en `docs/semana4/MVPFunctional.md` **solo tus partes**: "Cómo verificar tú mismo" y tu línea en "Participación" con tu usuario de GitHub y tu aporte.

**Tiempos:** S-01 y S-02 en `main` el sábado en la noche. S-03, S-04 y S-05 el domingo. S-06 a S-09 antes del lunes a las 12:00 m. S-10 antes del lunes a las 2:00 p. m., si es posible.
