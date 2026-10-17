# Entregable 4 — Prompt de Santiago

> **Puedes empezar hoy con el Bloque 1: no depende de nadie.** El Bloque 2 usa lo que André deje en `main`.
> 1. `git checkout main && git pull`
> 2. `git checkout -b feat/semana4-santiago`
> 3. En Claude Code, en la raíz del repo: `Lee docs/prompts/04c-santiago.md y empieza.`

## Tu rol

Te encargas de las piezas acotadas y bien definidas que desbloquean el resto: el paquete **`shared`** (el formato canónico y la raíz Merkle, con vectores exactos), la **verificación por línea de comandos**, la **integración continua** y el **README**. Lo que haces es la base sobre la que el backend y el verificador comprueban que los datos coinciden con lo guardado en la red.

Primero lee completos `CLAUDE.md`, `docs/prompts/04-entregable-semana4.md` (contexto común, recorte, dueños de archivos y calendario). Luego los specs: 02 completo, 05 §4 y §5, 08 §4 y §5.

Antes de cada bloque, muéstrame un plan corto y espera mi "ok".

## Qué archivos son tuyos

Solo puedes modificar estos. Si necesitas cambiar otro, avísale a su dueño:

- `shared/` (todo)
- `verifier/` (todo)
- `.github/workflows/`
- `README.md` y `.env.example` de la raíz
- `frontend/app/index.tsx`, `canales.tsx`, `(comercio)/historial.tsx` y `(comercio)/compartir.tsx`
- En `docs/semana4/MVPFunctional.md`: "Cómo verificar tú mismo" y tu línea en "Participación"

**Nunca importes `src/mocks/` en las pantallas**: solo usan los hooks de `src/hooks/`, y los componentes de `src/ui/` que diseña Lizeth.

## Bloque 1 — `shared`: formato canónico y Merkle (hoy; es lo más urgente)

André necesita esto para el backend y el verificador, y no puede avanzar con el sello real sin él. Hazlo primero y avisa por el grupo cuando esté en `main`.

1. **Paquete base** en `shared/`: TypeScript `strict`, sin dependencias de Node ni de React Native (spec 08 §2). Solo `@noble/hashes` y `ulid`; pruebas con `vitest`. Los tipos mínimos del dominio con los enums del spec 01 que necesite el formato canónico.
2. **Portar `docs/specs/02-referencia.mjs` a TypeScript:** `encodeEntry`, `leafHash`, `nodeHash`, `merkleRoot`, `auditPath`, `verifyInclusion`, `amendReasonHash` y `businessDate`. Tal cual el spec: **no cambies ni un byte** del formato, y no agregues funciones que el spec no tenga.
3. **Pruebas con los vectores de `docs/specs/02-vectores.json`.** Cada prueba lleva en el nombre el ID del vector. Todos pasan, y `node docs/specs/02-check.mjs` sigue en verde. El día de ejemplo debe dar la raíz `0859…c08b`.
4. Un archivo `shared/README.md` corto con cómo importarlo y cómo correr las pruebas.

## Bloque 2 — Verificación por línea de comandos (`verifier/cli/verify.mjs`)

Que un tercero pueda comprobar un historial sin la app. Spec 05 §5.

1. **Primero sin red.** Un modo `--fixture` que lee un JSON de ejemplo (ventas de un día y la respuesta simulada de `bimo-registry.get`) y compara. Imprime por día ✅ coincide, ⚪ sin sellar o ❌ no coincide, y sale con código 0 si todo coincide. Con pruebas, incluida una que altera un monto y espera ❌.
2. **Después con la red real**, cuando André avise que `contracts/deployments/testnet.json` y la API pública de verificación están listos: lee el ID del registry del JSON, consulta `get(merchant, date)` en el RPC de testnet, pide las ventas a la API pública (spec 06 §3.6), recalcula la raíz con `shared` y compara. No inventes endpoints; si falta alguno, pídele a André.
3. **Cómo verificar tú mismo** (en `MVPFunctional.md`): tres o cuatro comandos que cualquier persona pueda copiar y correr desde un clon limpio, y qué debe ver. Pruébalos tú en un clon limpio antes de dar el texto por bueno.

## Bloque 3 — Integración continua (`.github/workflows/`)

Spec 08 §5. Empieza con lo que ya existe y suma jobs a medida que haya código:

1. `specs`: `node docs/specs/02-check.mjs`.
2. `shared`: typecheck y `vitest`.
3. `frontend`: typecheck.
4. `contracts`: `cargo test`, **cuando André suba `contracts/`** (el domingo, más o menos).

Una rama no se fusiona con jobs en rojo. Los jobs corren en Ubuntu.

## Bloque 4 — Tus pantallas y el README

1. **Pantallas** (`index.tsx`, `canales.tsx`, `historial.tsx`, `compartir.tsx`): siguen usando sus hooks. Si André cambia un tipo, ajusta lo que haga falta. En `compartir.tsx`, el enlace generado debe abrir la página del verificador real (`/verificar/<token>`).
2. **README.md** de la raíz: mantén lo del Entregable 3 y agrega, en pocas líneas, `contracts/`, `core/`, `shared/` y `verifier/` en el árbol, cómo correr las pruebas de `shared` y de los contratos, y cómo cambiar entre modo `demo` y `testnet` (`EXPO_PUBLIC_MODO`). Pídele a André los nombres de las variables para el `.env.example` de la raíz; solo los nombres, nunca valores.

## Al terminar

1. Revisa que `shared` y el CLI funcionen en un clon limpio, y que tus pantallas sigan funcionando con `npx expo start --web`.
2. Escribe en `docs/semana4/MVPFunctional.md` **solo tus partes**: "Cómo verificar tú mismo" y tu línea en "Participación" con tu usuario de GitHub y tu aporte.
3. Haz commit **con tu cuenta** (por ejemplo `feat(shared): add formato canónico y Merkle con vectores del spec 02`), push y abre un PR a `main`. Avísale a André. Si quieres, abre un PR chico solo con `shared` primero, para desbloquearlo antes.

**Tiempos:** `shared` en `main` el sábado en la noche. El resto, en PR antes del domingo a las 8:00 p. m.
