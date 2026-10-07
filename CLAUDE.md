# CLAUDE.md — Reglas para trabajar en Bimo

Bimo es una app para pequeños comercios en Colombia: registra ventas sin internet, las sella cada día en Stellar y permite que un tercero verifique el historial sin confiar en nadie. Este archivo manda sobre cualquier costumbre o suposición.

## 1. Antes de escribir código

1. Lee `docs/specs/README.md` y **todos** los specs que cita la tarea (`docs/specs/08-…` §6 tiene la lista por tarea).
2. Si la tarea no está en el plan T01–T16, pregunta antes de empezar.

## 2. Los specs son la fuente de verdad

- **No inventes** tablas, columnas, enums, estados, transiciones, endpoints, campos JSON, códigos de error, funciones o eventos de contratos, ni formatos de bytes. Todo eso ya está en `docs/specs/`.
- Si algo falta, es ambiguo o se contradice: **detente y pregunta**, proponiendo el cambio al spec. Primero se cambia el spec y después el código, nunca al revés.
- Los nombres en el código son los mismos del spec (tablas, enums, códigos `V-xx`, `DB-xx`, transiciones `D-x`, `S-x`, `L-x`, `A-x`).
- `docs/specs/02-…` es intocable: ningún byte del formato canónico cambia. Usa `docs/specs/02-referencia.mjs` como referencia y valida siempre con `node docs/specs/02-check.mjs`.

## 3. Reglas del dominio que nunca se rompen

- Dinero: enteros en unidades mínimas (COP en centavos, USDC en 10⁻⁷). Nunca `float` ni `Double` para montos.
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
- Los casos de validación V-01..V-11 viven en `shared/validation-cases.json` y los usan Swift y TypeScript por igual.

## 6. Estilo

- TypeScript `strict`, sin `any`. Swift 6 con concurrencia estricta.
- Solo las dependencias permitidas en `docs/specs/08-…` §2. Para agregar una, justifícala y actualiza esa tabla en el mismo PR.
- Respeta los límites de módulos (spec 08 §1): un módulo solo usa la interfaz pública de otro.
- Textos de la app en español de Colombia, sin jerga técnica: nunca "wallet", "token", "XLM", "blockchain", "hash" ni "firma digital" (QA-04, spec 07 §6).

## 7. Commits y PRs

- Conventional Commits: `tipo(scope): descripción`, con tipos `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` o `revert`. Ejemplo: `feat(core): add push de sincronizacion`.
- Un PR por tarea (o parte de tarea). En la descripción: tarea `T0X`, specs implementados y criterios cubiertos.
