# Entregable 4 — Contexto común del equipo (MVP funcional)

> **Este archivo no se ejecuta solo.** Cada integrante corre su propio prompt, que empieza leyendo este:
> - André: `docs/prompts/04a-andre.md`
> - Lizeth: `docs/prompts/04b-lizeth.md`
> - Santiago: `docs/prompts/04c-santiago.md`
>
> Orden: **André primero** (en ~1 hora deja el esqueleto del monorepo en `main`, la documentación creada y los specs de canales y anticipos al día, y avisa por el grupo). Santiago y Lizeth pueden empezar sus primeras tareas hoy, porque no dependen de él.

---

## Qué pide el entregable

Lo que declaramos en el Entregable 3 (**Opción A, contrato propio**), ya implementado e incorporado en el front:

1. **Contratos inteligentes escritos, desplegados en testnet y conectados al front.** Enlace público al explorador en la documentación (contratos y transacciones). Es obligatorio.
2. **El resto del back**: la lógica y los servicios que conectan el front con los contratos.
3. **Video de máximo 3 minutos** con el producto funcionando y el pitch. En una plataforma pública (YouTube). Obligatorio.
4. **`docs/semana4/MVPFunctional.md`**: un solo archivo del equipo, con estas secciones **en este orden**:
   - Aprendizajes y ajustes priorizados (150–300 palabras)
   - Riesgos y pendientes (200–400 palabras)
   - Plan de validación con usuarios (200–500 palabras)
   - y la **evidencia verificable** (producto en línea, video, contratos y transacciones en el explorador de testnet).
5. **Un commit propio por integrante**, hecho esta semana desde su cuenta.
6. **Proyecto registrado en Apex** antes de la fecha límite: https://stellarapex.org/hackathons/ea3a5982-7c2e-4dce-a769-37e3a563fb15

**Fecha límite: lunes 19 de octubre, 11:00 p. m. (hora Colombia).** Trabajamos para subir **a las 8:00 p. m.**, con 3 horas de margen.

Se construye en **el mismo repositorio**. No se crea uno nuevo.

## Alcance: la arquitectura completa, sin recortes

**No se cambia la arquitectura ni los specs.** El trabajo de esta semana es el plan de construcción del incremento 1 (spec 08 §6, T01–T16) y los 41 issues del kanban (A-00 a A-19, S-01 a S-10, L-01 a L-11): smart account de OpenZeppelin, `bimo-p256-verifier`, `bimo-registry`, `core` por módulos, migraciones completas, sincronización, cierre, firma, indexador, verificación, la app y la página del verificador.

Lo que ya está definido en los specs sigue valiendo:
- El único adaptador de envío para la demo es `EnviadorDirecto`; `EnviadorRelayer` queda diferido (spec 03 §7, spec 08 §6.1).
- Face ID real y Secure Enclave llegan en el incremento 2. En el incremento 1 la llave es P-256 de software detrás de la interfaz `Firmante` (spec 03 §6).

**Los issues son las tareas.** Esta semana sí corresponden a issues del kanban: cada persona los trabaja con el flujo de `CLAUDE.md` §8 (mover la tarjeta, PR con `Closes #n` o `Refs #n`). Esto reemplaza el ejemplo de "las del entregable de la semana" que decía la regla 2 de ese archivo.

Quedan dos días y la cadena de dependencias es larga. Por eso el trabajo se ordena **por riesgo y por lo que desbloquea**, y hay hitos con evidencia. Lo que el lunes a las 2:00 p. m. no esté terminado **no se disimula**: queda dicho con honestidad en "Riesgos y pendientes". Eso no cambia el diseño; solo dice hasta dónde se llegó.

## Hitos (hora Colombia)

| Cuándo | Hito | Evidencia |
|---|---|---|
| **Sáb 17, noche** | **Base:** A-00 y A-01 en `main` (esqueleto del monorepo y CI `specs`); `shared` con S-01 y S-02; L-01 | `main` con las carpetas del spec 08 §1 y CI en verde |
| **Dom 18, mediodía** | **Hito 1 — contratos en testnet:** A-03, A-04 y A-05 | `contracts/deployments/testnet.json`, el contrato y una transacción de `seal` en el explorador |
| **Dom 18, noche** | **Hito 2 — datos y núcleo:** A-02, A-06, A-07, A-09, A-10, S-03, S-05, A-15 | Pruebas en verde; cuenta creada en testnet con una llave de software |
| **Lun 19, mañana** | **Hito 3 — sello real desde la app:** A-08, A-11, A-12, A-16, A-17, A-18 y las pantallas L-08 | Un día sellado en testnet desde la app y su transacción en el explorador |
| **Lun 19, 12:00 m.** | **Hito 4 — verificación:** A-13, A-14, S-08, S-09, L-10 | La página `/verificar` y el CLI dan ✅; alterar un dato da ❌ |
| **Lun 19, 2:00 p. m.** | **Congelamiento de funciones.** Solo correcciones. Grabación del video con el guion del spec 08 §7 | Video grabado |
| **Lun 19, 4:00 p. m.** | Video en YouTube; A-19 (ensayo de punta a punta) | Enlace del video |
| **Lun 19, 5:00 p. m.** | `MVPFunctional.md` terminado y verificado con la lista de abajo | Lista de verificación |
| **Lun 19, 8:00 p. m.** | **Subida a Apex.** Margen hasta las 11:00 p. m. | Proyecto registrado |

El **Hito 1** es lo que el enunciado exige como mínimo (contratos en testnet con enlace al explorador). Por eso va primero. El domingo a las 8:00 p. m., André revisa cuánto se llevó y reasigna issues si la cadena de él se está atrasando (por ejemplo, pasarle a Santiago A-13 o A-14).

## Reglas para todos

1. Lee `CLAUDE.md`, este archivo y los specs que cite cada issue antes de tocar código.
2. **Los specs son la fuente de verdad.** No inventes tablas, endpoints, estados, funciones de contrato ni formatos. Si algo falta, se contradice o una librería real no coincide con el spec, **detente y propón el cambio exacto al spec** (archivo, sección y texto nuevo). Primero se cambia el spec, en su propio commit `docs(specs): …`, y después el código.
3. **Cada quien toca solo sus archivos** (tabla de abajo). Si necesitas cambiar un archivo de otra persona, pídeselo por el grupo.
4. **Las pantallas solo hablan con `src/hooks/`.** Nunca importan `src/store/`, `src/sync/`, `src/signer/`, `src/api/` ni `src/mocks/`.
5. **Nada de secretos en el repo.** Llaves de testnet en `.env` (en `.gitignore`) y `.env.example` solo con los nombres. Los secretos del servidor van en las variables del servicio. Nadie le pide sus llaves a otra persona ni genera llaves privadas de otra persona.
6. Dinero en enteros en centavos, tiempo en UTC con milisegundos, día de negocio en Bogotá. Nada de montos ni datos personales en logs ni en la cadena (QA-06).
7. Español de Colombia y **sin jerga** en la app del dueño: nunca "wallet", "token", "XLM", "blockchain" ni "hash". En el verificador, "Stellar" solo en "¿Cómo funciona?" y en el enlace al explorador.
8. Una rama por issue: `feat/<ID>-<slug>` (por ejemplo `feat/S-02-shared-merkle`). PR a `main` con `Closes #n` si cumple todos los criterios o `Refs #n` si cumple una parte. **André revisa y fusiona.** Si el PR solo toca archivos de su autor y el CI está en verde, la revisión es rápida.
9. Commits en Conventional Commits, **desde tu propia cuenta de GitHub**. Nadie hace commits a nombre de otra persona.
10. Todos los que trabajan con el kanban necesitan el permiso de proyectos: `gh auth refresh -s project`.
11. **Pruebas primero** en lo que tenga vectores o reglas con ID (spec 02, spec 03 §2, V-01..V-11, DB-01..DB-12, transiciones del spec 07). El ID va en el nombre de la prueba.
12. Ninguna rama se fusiona con jobs en rojo.

## Dueños de archivos

La propiedad **sigue al issue**. Esto cambia lo del Entregable 3: las cuatro pantallas de configuración e historial pasan a Lizeth, porque sus issues (L-02 y L-09) las incluyen.

| Dueño | Archivos |
|---|---|
| **André** | `contracts/`, `core/`, `supabase/`, `frontend/src/store/`, `sync/`, `signer/`, `api/`, `hooks/`, `mocks/`, `lib/`, `frontend/app/_layout.tsx`, `frontend/vercel.json`, `docs/specs/`, `package.json` y `pnpm-workspace.yaml` de la raíz; en la documentación: aprendizajes, riesgos y la evidencia de contratos y producto |
| **Lizeth** | `frontend/src/ui/`; todo `frontend/app/` (pantallas existentes y las nuevas: clientes de fiado, salidas de plata, "Ventas por revisar", etc.), salvo `_layout.tsx`; `docs/usabilidad.md`; en la documentación: plan de validación, enlace del video y su línea de participación |
| **Santiago** | `shared/`, `verifier/`, `.github/workflows/`, `core/src/workers/ttl*` y `core/src/api/dev*` (S-06, S-07), pruebas de base de datos (S-05), `docs/dev-build.md`, `README.md` y `.env.example` de la raíz; en la documentación: "Cómo verificar tú mismo" y su línea de participación |

Los archivos de `core/` que no son suyos los toca André. Si Santiago necesita un cambio en uno, lo pide por el grupo o abre el PR contra la rama de André.

## Interfaz entre las piezas

- **Hooks (frontera con la lógica real).** André los entrega en `frontend/src/hooks/` y cada issue dice cuáles. Mientras uno no exista en versión real, usa la implementación en memoria de `src/mocks/`, con los mismos tipos. Lizeth programa contra los tipos y conecta cuando el issue de André esté cerrado.
- **`shared/` (única fuente de verdad):** formato canónico, Merkle, ULID, tipos y reglas V-01..V-11. La app, `core` y `verifier` lo importan; nadie lo reimplementa.
- **`contracts/deployments/testnet.json`** (spec 03 §9): lo único que la app, `core` y la web de verificación necesitan saber de la red.
- **Web y Expo Go** (spec 08 §3.0): lo que solo existe en nativo (Keychain, SQLite, Face ID) va detrás de la misma interfaz, con una versión de prueba para web. El enlace de Vercel tiene que seguir funcionando. Face ID real exige el development build (S-10).

## Documentación: quién escribe qué

`docs/semana4/MVPFunctional.md` lo crea André con los encabezados. Cada persona edita **solo su parte**:

| Sección (en este orden) | Extensión | Quién |
|---|---|---|
| 1. Aprendizajes y ajustes priorizados | 150–300 palabras | André (pide a Lizeth y a Santiago una frase cada uno por el grupo) |
| 2. Riesgos y pendientes | 200–400 palabras | André |
| 3. Plan de validación con usuarios | 200–500 palabras | Lizeth |
| 4. Evidencia verificable → producto en línea, contratos y transacciones | Tabla con enlaces | André |
| 4. Evidencia verificable → video (y publicación en redes, si hay) | Enlaces | Lizeth |
| 4. Evidencia verificable → "Cómo verificar tú mismo" (CLI y verificador) | Breve | Santiago |
| 5. Participación del equipo | Una línea cada uno: usuario de GitHub y aporte | Cada uno |

Enlaces del explorador de testnet: `https://stellar.expert/explorer/testnet/contract/<ID>` y `https://stellar.expert/explorer/testnet/tx/<hash>`. Cualquier persona debe poder abrirlos sin iniciar sesión.

## Lista de verificación final (la corre André)

- [ ] `cargo test` pasa en `contracts/` y `node docs/specs/02-check.mjs` está en verde.
- [ ] `contracts/deployments/testnet.json` tiene los IDs, y cada ID abre en el explorador.
- [ ] Hay transacciones de `seal` en el explorador, enlazadas en la documentación.
- [ ] En el enlace de Vercel, el flujo completo funciona: registrar venta → "Hoy" → cerrar → confirmar y sellar → compartir → verificar.
- [ ] El verificador y el CLI recalculan la raíz y comparan con la cadena; alterar un dato da ❌.
- [ ] QA-02 comprobada: la misma transacción firmada solo con llaves de Bimo la rechaza la red.
- [ ] El video dura 3:00 o menos, es público y abre sin sesión. El enlace está en la documentación.
- [ ] `MVPFunctional.md` tiene las tres secciones en orden y dentro de los rangos de palabras, la evidencia, y lo pendiente dicho con honestidad.
- [ ] Los tres tienen al menos un commit esta semana: `git log --since="2026-10-12" --format="%an <%ae>" | sort -u`.
- [ ] No hay secretos en el repo: `git log -p | grep -i "secret\|SA[A-Z0-9]\{50,\}"` sin resultados.
- [ ] Proyecto registrado en Apex, con el enlace de Vercel en **Website**, antes de las 11:00 p. m. del lunes.
