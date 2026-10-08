# Superprompt 1 — Crear el kanban del incremento 1

> **Antes de pegarlo**, reemplaza los tres valores de la sección "Datos". Luego, en Claude Code (en la raíz del repo), escribe: `Lee docs/prompts/01-kanban.md y ejecútalo.`

---

## Datos

- Repositorio: `andreMD287/Bimo`
- Dueño del proyecto de GitHub: `andreMD287`
- Número del proyecto (está en la URL `github.com/users/andreMD287/projects/<N>`): `<NUMERO_PROYECTO>`
- Usuario de GitHub de André: `andreMD287`
- Usuario de GitHub de Santiago: `<USUARIO_SANTIAGO>`
- Usuario de GitHub de Lizeth: `<USUARIO_LIZETH>`

Si algún valor sigue entre `< >`, **pregúntamelo antes de crear nada**.

---

## Tu rol

Eres el líder técnico de Bimo y vas a convertir el diseño en un tablero de trabajo para tres personas. No escribes código de producto en esta tarea: solo creas issues bien definidos en GitHub y los agregas al proyecto.

## Reglas

1. Lee primero `CLAUDE.md`, `docs/specs/README.md`, `docs/arquitectura/ARQUITECTURA.md` y los specs 01 a 08 completos. Cada issue debe apoyarse en ellos.
2. **No inventes alcance.** Todo lo que pongas en un issue (tablas, endpoints, estados, reglas, criterios) debe salir de un spec, citado con su número y sección (por ejemplo "spec 04 §5.2", "DB-04", "V-07", "D-6").
3. Si encuentras una contradicción o un hueco en los specs mientras armas los issues, **no lo resuelvas en silencio**: anótalo y muéstramelo al final en una sección "Huecos encontrados".
4. Usa `gh` CLI. Antes de empezar, comprueba `gh auth status`. Si falta el permiso de proyectos, dime que corra `gh auth refresh -s project` y espera.
5. Sé idempotente: si ya existe un issue cuyo título empieza con el mismo ID (por ejemplo `A-04 ·`), no lo dupliques.
6. Todo en español.

## Reparto del trabajo

- **André** hace la mayor parte: todo el backend difícil, los contratos y la lógica de la app (sin UI).
- **Santiago** tiene tareas más cortas y acotadas, casi todas con una implementación de referencia o un spec muy cerrado.
- **Lizeth** hace **toda** la interfaz: pantallas de la app y de la web de verificación, el sistema de diseño, los textos y la prueba con comercios.

**Frontera entre la UI y la lógica en la app:** André expone la lógica como hooks y servicios en `app/src/` (`store`, `sync`, `signer`, `api` y un `app/src/hooks/` con los hooks que consumen las pantallas). Lizeth construye las pantallas en `app/app/` y los componentes en `app/src/ui/`. Mientras un hook no exista, Lizeth trabaja con datos de ejemplo en `app/src/fixtures/` que respetan los tipos de `shared`. Cada issue de Lizeth dice qué hook va a consumir y cada issue de André dice qué hooks entrega.

## Las tareas

Crea **exactamente** estos issues. La columna "T" indica a qué tarea del spec 08 §6 pertenece cada uno; ponla en el cuerpo del issue.

### André (`persona:andre`)

| ID | T | Título | Depende de | Etiquetas extra |
|---|---|---|---|---|
| A-01 | T01 | Esqueleto del monorepo (workspaces con pnpm, carpetas del spec 08 §1, tsconfig base) y CI con el job `specs` | — | infra |
| A-02 | T02 | Migraciones de Supabase: enums, tablas, índices, triggers DB-01..DB-12, vista `account_balances` y RLS | A-01 | db |
| A-03 | T04 | Contrato `bimo-p256-verifier` con pruebas usando los vectores del spec 03 §2 | A-01 | contratos, riesgo-alto |
| A-04 | T04 | Contrato `bimo-registry` con todas las pruebas del spec 03 §10 | A-01 | contratos, riesgo-alto |
| A-05 | T05 | Despliegue en testnet, cuentas de Bimo (admin 2 de 3, attester, deployer, fallback) y `contracts/deployments/testnet.json` | A-03, A-04 | contratos, riesgo-alto |
| A-06 | T06 | `core`: esqueleto Fastify, configuración por entorno (spec 08 §3.1), validación de JWT, `X-Device-Id`, modelo de errores y logs sin datos sensibles (spec 06 §1, §2, §5) | A-01, A-02 | core |
| A-07 | T06 | `core`: `POST /merchants`, reto, `POST /devices` (verificación P-256) y `GET /merchants/me` | A-06, S-01 | core |
| A-08 | T06 | `core`: worker de despliegue de `bimo-account` (transiciones A-1..A-5) y puerto `Enviador` con sus dos adaptadores (spec 03 §7) | A-05, A-07 | core, contratos, riesgo-alto |
| A-09 | T07 | `core`: `POST /sync/push` (spec 04 §5) con las reglas de `shared`, sales, idempotencia y medición del reloj | A-06, S-03 | core |
| A-10 | T07 | `core`: `GET /sync/pull` y feed `merchant_changes` (DB-11, spec 04 §8) | A-09 | core |
| A-11 | T08 | `core`: cierre del día y solicitudes de firma (D-1..D-3, D-9, D-10, S-1, S-3, S-4), con raíz Merkle por día usando `shared` | A-10, S-02 | core |
| A-12 | T08 | `core`: recepción de la firma, normalización low-S, `AuthPayload`, firma del atestador, envío y confirmación (S-2, L-1..L-6, D-4..D-8) | A-11, A-08 | core, contratos, riesgo-alto |
| A-13 | T09 | `core`: indexador de eventos (ADR-11) y conciliador | A-12 | core |
| A-14 | T10 | `core`: enlaces de verificación (spec 06 §3.5) y API pública con restauración (spec 05 §3, spec 06 §3.6) | A-12 | core |
| A-15 | T12 | App: proyecto Expo con `expo-router`, base local `expo-sqlite` (spec 04 §2) y hooks base para las pantallas | A-01, S-01 | app |
| A-16 | T13 | App: `Firmante` (llave P-256 con `@noble/curves` y `expo-secure-store`, spec 03 §6), sesión por correo y hooks de onboarding con verificación del firmante por RPC | A-07, A-15 | app, riesgo-alto |
| A-17 | T14 | App: módulo `sync` (outbox, push, pull, disparadores de spec 04 §3.1, reloj) y hooks de "Hoy" con los cálculos de spec 04 §9 | A-10, A-15 | app |
| A-18 | T14, T15 | App: hooks de cierre (con `missing_entries`) y de firma (pull completo, validación de la preimagen de spec 03 §5.2, cálculo de `auth_digest`, firma) | A-11, A-12, A-16, A-17 | app, riesgo-alto |
| A-19 | T16 | Integración de punta a punta y ensayo del guion de la demo (spec 08 §7) | A-13, A-14, A-18, L-08, L-10 | infra |

### Santiago (`persona:santiago`)

| ID | T | Título | Depende de | Etiquetas extra |
|---|---|---|---|---|
| S-01 | T03 | `shared`: paquete base, ULID (generar y validar) y tipos del dominio con los enums del spec 01 | A-01 | shared |
| S-02 | T03 | `shared`: portar el formato canónico y el Merkle desde `docs/specs/02-referencia.mjs` a TypeScript, con pruebas contra `02-vectores.json` | S-01 | shared |
| S-03 | T03 | `shared`: `validation-cases.json` (al menos un caso válido y uno inválido por cada regla V-01..V-11) e implementación de las reglas | S-01 | shared |
| S-04 | T01 | CI: jobs `shared`, `core`, `contracts`, `verifier` y `app` del spec 08 §5 | A-01 | infra |
| S-05 | T02 | Pruebas de base de datos: DB-01..DB-12 y los 10 ejemplos del spec 01 §6 contra las migraciones | A-02 | db |
| S-06 | T09 | `core`: simuladores `/dev/*` (spec 06 §3.7) que entran por el `inbox` | A-09 | core |
| S-07 | T09 | `core`: worker de TTL (spec 03 §4.5) | A-08 | core |
| S-08 | T11 | `verifier`: lógica de verificación en el navegador (lectura de Stellar RPC, recálculo, resultado por día, totales; spec 05 §4) expuesta como hooks para la UI | S-02, A-14 | web |
| S-09 | T11 | `verifier/cli/verify.mjs` (spec 05 §5) | S-08 | web |
| S-10 | T16 | Development build en su Mac: compilarlo e instalarlo en el iPhone de André, renovarlo cada 7 días y documentar los pasos en `docs/dev-build.md` (spec 08 §3.0) | A-16 | app, infra |

### Lizeth (`persona:lizeth`)

| ID | T | Título | Depende de | Etiquetas extra |
|---|---|---|---|---|
| L-01 | T12 | Sistema de diseño en `app/src/ui/`: colores, tipografía, espaciado, teclado numérico para montos, botones, tarjetas, listas y avisos | A-15 | app, ui |
| L-02 | T13 | Pantallas de onboarding: bienvenida, correo y código, nombre del negocio, "Preparando tu cuenta…" (textos de spec 07 §6) | L-01 | app, ui |
| L-03 | T14 | Registrar venta en ≤ 3 toques (QA-04): monto, canal, pago dividido, fiado con cliente y nota | L-01 | app, ui |
| L-04 | T14 | Pantalla "Hoy" con los datos de spec 04 §9, indicador de ventas por subir y aviso de reloj (spec 04 §7) | L-01 | app, ui |
| L-05 | T14 | Clientes de fiado: lista, detalle con saldo y registro de abonos | L-03 | app, ui |
| L-06 | T14 | Salidas de plata (gasto o retiro) y corrección de una venta (reverso) | L-03 | app, ui |
| L-07 | T14 | Cierre del día: conteo de efectivo, diferencia, días sin cerrar | L-04 | app, ui |
| L-08 | T15 | Pantalla de firma: resumen en lenguaje humano, Face ID, estados del sello y errores (vencida, reemplazada) con los textos de spec 07 §6 | L-07 | app, ui |
| L-09 | T15 | Compartir historial (crear enlace, hoja de compartir, lista y revocar) y "Ventas por revisar" | L-01 | app, ui |
| L-10 | T11 | UI de la web de verificación: resultado por día, resumen del período, sección "¿Cómo funciona?", responsive (spec 05 §4.1, §4.2) | S-08 | web, ui |
| L-11 | — | Prueba de usabilidad con 5 comercios (QA-04): guion, registro y hallazgos en `docs/usabilidad.md` | L-03, L-04, L-07 | ui |

Las tareas de Lizeth arrancan con datos de ejemplo. Sus dependencias son de diseño, no de lógica: la conexión con los hooks reales se hace cuando el issue de André correspondiente esté cerrado. Escribe en cada issue de Lizeth qué issue de André entrega el hook que va a usar.

## Cuerpo de cada issue

Usa esta plantilla. Llena cada sección **leyendo los specs**: los criterios de aceptación salen de las secciones "Criterios de aceptación" de cada spec, filtrados a lo que toca este issue.

```
**Persona:** André | Santiago | Lizeth · **Tarea del plan:** T0X · **Estimado:** S (≤ 1 día) | M (2–3 días) | L (4–5 días)

## Objetivo
Una o dos frases.

## Specs a seguir
- Spec NN §x.y — qué se toma de ahí (con enlace a https://github.com/andreMD287/Bimo/blob/main/docs/specs/<archivo>)

## Incluye
- Lista concreta de lo que se construye (endpoints, tablas, pantallas, hooks…)

## No incluye
- Lo que es de otro issue (con su ID), para evitar solapamientos

## Entrega a otros / Consume de otros
- Hooks, tipos o endpoints que este issue entrega o necesita, con el ID del otro issue

## Depende de
- [ ] #<número> (ID)

## Criterios de aceptación
- [ ] Cada uno verificable, citando el ID de la regla (DB-xx, V-xx, D-x, QA-xx…)
- [ ] Pruebas con el ID en el nombre; CI en verde

## Instrucción para Claude Code
> Implementa el issue <ID> siguiendo `CLAUDE.md` y los specs citados. No inventes nada fuera de los specs; si falta algo, detente y pregunta.
```

Pon el estimado según tu criterio después de leer el spec, y respeta el reparto: las de Santiago deben salir mayoritariamente S o M.

## Pasos

1. Comprueba `gh auth status` y que los valores de "Datos" estén completos.
2. Lee los documentos de la regla 1.
3. Crea las etiquetas si no existen: `inc-1`, `persona:andre`, `persona:santiago`, `persona:lizeth`, `infra`, `db`, `contratos`, `core`, `shared`, `app`, `ui`, `web` y `riesgo-alto`, cada una con color y descripción.
4. Crea el milestone `Incremento 1` si no existe.
5. Crea los issues **en orden de dependencias**, para que cada "Depende de" pueda apuntar al número real del issue. Título: `<ID> · <título>`. Asigna a la persona, agrega las etiquetas (`inc-1`, la de persona y las extra) y el milestone.
6. Agrega cada issue al proyecto con `gh project item-add`.
7. Al final, muéstrame:
   - una tabla con ID, número de issue, persona, estimado y dependencias;
   - la carga total estimada por persona;
   - la ruta crítica (la cadena de dependencias más larga hasta A-19);
   - la sección "Huecos encontrados", si hay alguno.

No hagas commits en esta tarea.
