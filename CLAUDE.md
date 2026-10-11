# CLAUDE.md — Reglas para trabajar en Bimo

Bimo es una app para pequeños comercios en Colombia: registra ventas sin internet, las sella cada día en Stellar y permite que un tercero verifique el historial sin confiar en nadie. Este archivo manda sobre cualquier costumbre o suposición.

## 1. Antes de escribir código

1. Lee `docs/specs/README.md` y **todos** los specs que cita la tarea (`docs/specs/08-…` §6 tiene la lista por tarea).
2. Si la tarea no está en el plan T01–T16 ni en el kanban, pregunta antes de empezar.

## 2. Los specs son la fuente de verdad

- **No inventes** tablas, columnas, enums, estados, transiciones, endpoints, campos JSON, códigos de error, funciones o eventos de contratos, ni formatos de bytes. Todo eso ya está en `docs/specs/`.
- Si algo falta, es ambiguo o se contradice: **detente y pregunta**, proponiendo el cambio al spec. Primero se cambia el spec y después el código, nunca al revés.
- Los nombres en el código son los mismos del spec (tablas, enums, códigos `V-xx`, `DB-xx`, transiciones `D-x`, `S-x`, `L-x`, `A-x`).
- `docs/specs/02-…` es intocable: ningún byte del formato canónico cambia. Usa `docs/specs/02-referencia.mjs` como referencia y valida siempre con `node docs/specs/02-check.mjs`.

## 3. Reglas del dominio que nunca se rompen

- Dinero: enteros en unidades mínimas (COP en centavos, USDC en 10⁻⁷). Nunca `float` ni `number` con decimales para montos.
- Tiempo: instantes en UTC con milisegundos. El día de negocio es la fecha en `America/Bogota` (UTC-5).
- Los asientos son de **solo adición**: nada se edita ni se borra; las correcciones son reversos.
- Desde la app solo se crean asientos `declarado`.
- La app nunca firma un hash que le manden hecho: valida la preimagen y calcula lo que firma (spec 03 §5).
- Bimo nunca es firmante de la cuenta de un comercio.

## 4. Seguridad y privacidad

- Ningún secreto en el repo, en los logs ni en la app.
- Los logs nunca incluyen montos, notas, tokens, firmas, claves ni datos personales (spec 06 §5).
- Nada personal ni ningún monto va a la cadena (C-06).

## 5. Pruebas

- Cada criterio de aceptación que toque la tarea tiene su prueba, con el ID en el nombre (por ejemplo `V-07 exige cliente en fiado`).
- No marques una tarea como terminada con pruebas en rojo ni con pruebas desactivadas.
- El formato canónico, el Merkle, los ULID y las reglas V-01..V-11 viven **solo** en el paquete `shared/`; la app, `core` y `verifier` lo importan y nunca los reimplementan.

## 6. Estilo

- TypeScript `strict`, sin `any`, en todo el monorepo. Rust solo en `contracts/`. Swift solo en módulos nativos del incremento 2.
- La app es React Native con Expo y debe seguir corriendo en Expo Go para el desarrollo diario (spec 08 §3.0). No agregues dependencias nativas que Expo Go no traiga sin acordarlo antes, porque obligan a recompilar el development build en el Mac.
- Solo las dependencias permitidas en `docs/specs/08-…` §2. Para agregar una, justifícala y actualiza esa tabla en el mismo PR.
- Respeta los límites de módulos (spec 08 §1): un módulo solo usa la interfaz pública de otro.
- Textos de la app en español de Colombia, sin jerga técnica: nunca "wallet", "token", "XLM", "blockchain", "hash" ni "firma digital" (QA-04, spec 07 §6).

## 7. Commits y PRs

- Conventional Commits: `tipo(scope): descripción`, con tipos `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` o `revert`. Ejemplo: `feat(core): add push de sincronizacion`.
- Un PR por issue (o parte de un issue). En la descripción: ID del issue, specs implementados y criterios cubiertos.
- `Closes #<número>` **solo** si el PR cumple todos los criterios de aceptación del issue. Si lo cumple en parte, usa `Refs #<número>`.

## 8. Kanban: mover las tarjetas según el trabajo

El backlog vive en GitHub Projects, proyecto `<NUMERO_PROYECTO>` del usuario `andreMD287`. **Mientras trabajes en un issue, mantén su tarjeta en la columna que corresponde**, con `gh` desde la terminal.

### Primera vez en una sesión

1. Comprueba que `gh auth status` incluya el permiso `project`. Si no, pide correr `gh auth refresh -s project` y espera.
2. Si arriba dice `<NUMERO_PROYECTO>`, búscalo con `gh project list --owner andreMD287`, confírmalo con la persona y reemplázalo en este archivo en un commit `docs: …`.
3. Lee las columnas reales del campo **Status**, porque los nombres pueden variar:
   ```
   gh project field-list <N> --owner andreMD287 --format json
   gh project view <N> --owner andreMD287 --format json --jq .id
   ```
   Guarda en memoria de la sesión el ID del proyecto, el ID del campo Status y el ID de cada opción.

### Cuándo mover

| Momento | Columna | Además |
|---|---|---|
| Empiezas a trabajar el issue (antes del primer commit) | **In Progress** | Asígnate el issue si no está asignado a la persona actual |
| Abres el PR | **In Review**, si existe; si no, se queda en In Progress | El PR enlaza el issue |
| El trabajo se bloquea (falta un spec, una dependencia u otra persona) | **Blocked**, si existe; si no, se queda en In Progress | Comenta en el issue qué lo bloquea y qué se necesita |
| El PR con `Closes #<número>` se fusiona | **Done** | Comprueba que el issue quedó cerrado |
| El PR solo avanza una parte (`Refs`) | Sigue en **In Progress** | Comenta en el issue qué quedó hecho y qué falta |

Si el proyecto no tiene alguna de esas columnas, usa la más cercana que exista y avisa una vez. **Nunca crees ni renombres columnas.**

### Cómo mover una tarjeta

```
# ID de la tarjeta del issue <número>
gh project item-list <N> --owner andreMD287 --limit 200 --format json \
  --jq '.items[] | select(.content.number == <número>) | .id'

# Moverla
gh project item-edit --id <ID_TARJETA> --project-id <ID_PROYECTO> \
  --field-id <ID_CAMPO_STATUS> --single-select-option-id <ID_OPCION>
```

Si el issue no está en el proyecto, agrégalo antes con `gh project item-add <N> --owner andreMD287 --url <url-del-issue>`.

### Reglas

- Mueve **solo** las tarjetas de los issues en los que estás trabajando en esta sesión.
- Una tarea que no corresponde a ningún issue (por ejemplo, las del entregable de la semana) no mueve tarjetas. Si cumple **todos** los criterios de un issue existente, dilo y pregunta antes de llevarlo a Done.
- Nunca muevas a **Done** algo cuyo PR no se haya fusionado o que no cumpla todos sus criterios.
- Después de cada movimiento, confirma en una línea: `#<número> <ID> → <columna>`.
