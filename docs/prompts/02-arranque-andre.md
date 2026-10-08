# Superprompt 2 — Arranque del desarrollo (tareas de André)

> Úsalo **después** de crear el kanban con `docs/prompts/01-kanban.md`. En Claude Code, en la raíz del repo: `Lee docs/prompts/02-arranque-andre.md y empieza.`

---

## Tu rol

Eres el desarrollador principal de Bimo, junto a André. Vas a implementar sus issues (`persona:andre`) uno por uno, con calidad de producción, siguiendo los specs al pie de la letra. Santiago y Lizeth trabajan en paralelo en sus propios issues, así que lo primero es desbloquearlos.

## Reglas que no se negocian

1. **`CLAUDE.md` manda.** Léelo completo antes de cualquier cosa, y vuelve a él cada vez que dudes.
2. **Los specs son la fuente de verdad.** Antes de cada issue, lee completos los specs que cita y las secciones relacionadas del índice `docs/specs/README.md`. No inventes tablas, campos, endpoints, estados, errores, funciones de contrato ni formatos.
3. **Si el spec no alcanza, te detienes.** Si falta algo, es ambiguo, se contradice o la realidad de una librería no coincide con lo que dice el spec, **para y pregúntame**. Proponme el cambio exacto al spec (archivo, sección y texto nuevo) y no sigas con esa parte hasta que lo apruebe. Primero se actualiza el spec, en su propio commit `docs(specs): …`, y después el código.
4. **Pruebas primero en lo crítico.** En todo lo que tenga vectores (spec 02, spec 03 §2) o reglas con ID, escribe primero la prueba con el ID en el nombre y luego el código.
5. **Nada de secretos en el repo.** Las llaves de testnet van en archivos `.env` que están en `.gitignore`. Crea un `.env.example` con los nombres de las variables (spec 08 §3.1) y sin valores.
6. **Commits en Conventional Commits** (`feat(core): …`, `test(contracts): …`, `docs(specs): …`). Commits pequeños y con sentido.

## Entorno

Trabajo en **Windows**. Antes de empezar, verifica qué hay instalado y dime qué falta, con el comando para instalarlo. **No instales nada del sistema sin preguntarme.**

| Herramienta | Para qué |
|---|---|
| Git y `gh` CLI con sesión iniciada | Ramas, PRs, issues |
| Node 22 LTS y pnpm | Monorepo, `shared`, `core`, `verifier`, `app` |
| Rust estable y `stellar-cli` | Contratos (usa `stellar contract build`; si pide un target de WASM, dime cuál) |
| Docker Desktop **o** un proyecto de Supabase en la nube para desarrollo | Base de datos. Si no hay Docker, propónme usar un proyecto en la nube y espera mi decisión |
| Expo Go en mi iPhone | La app (desde el issue A-15) |

Si un comando de un spec o de una herramienta asume macOS o Linux, adáptalo a Windows (PowerShell o Git Bash) y avísame.

## Cómo trabajar cada issue

1. **Elige el siguiente issue** con `gh issue list --label persona:andre --state open`, siguiendo el orden de la sección siguiente. Solo empieza uno cuyas dependencias estén cerradas. Si una dependencia es de Santiago y no está lista, dime cuál y propón con qué seguir mientras tanto.
2. **Lee el issue completo** y todos los specs que cita.
3. **Muéstrame un plan corto** (archivos a crear o tocar, pruebas que vas a escribir, riesgos) y **espera mi "ok"**.
4. Crea una rama `feat/<ID>-<slug>` (por ejemplo `feat/A-04-registry`).
5. Implementa, con pruebas que lleven en el nombre el ID de la regla que cubren.
6. Corre **todas** las verificaciones locales: typecheck, lint, pruebas, `node docs/specs/02-check.mjs` y `cargo test` si aplica. No sigas con nada en rojo.
7. Haz push y abre el PR con `gh pr create`. En la descripción: ID del issue, specs implementados, criterios de aceptación cubiertos (marcados) y `Closes #<número>`.
8. **Resume** qué hiciste, qué quedó pendiente y si encontraste algo que merezca cambiar un spec. Espera mi "sigue" antes del próximo issue.

## Orden de trabajo

El orden busca dos cosas: desbloquear rápido a Santiago y a Lizeth, y enfrentar temprano lo más riesgoso (etiqueta `riesgo-alto`).

| Orden | Issue | Por qué va aquí |
|---|---|---|
| 1 | **A-01** Esqueleto del monorepo y CI `specs` | Desbloquea a todo el equipo. Hazlo mínimo y rápido: workspaces de pnpm con `shared`, `core`, `verifier` y `app` vacíos pero compilando, `contracts/` como workspace de Cargo, `.gitignore`, `.env.example` y el workflow con el job `specs` |
| 2 | **A-02** Migraciones de Supabase | Desbloquea S-05 y todo `core` |
| 3 | **A-03** `bimo-p256-verifier` | Riesgo alto. Tiene vectores exactos en spec 03 §2 |
| 4 | **A-04** `bimo-registry` | Riesgo alto. Todas las pruebas del spec 03 §10 |
| 5 | **A-05** Despliegue en testnet | Valida en la red real que firmas y contratos funcionan |
| 6 | A-06 → A-07 → A-08 | Base de `core` y creación de cuentas |
| 7 | A-15 | Desbloquea la integración de Lizeth con hooks reales |
| 8 | A-09 → A-10 → A-11 → A-12 | Sincronización, cierre y sellado |
| 9 | A-16 → A-17 → A-18 | Lógica de la app |
| 10 | A-13, A-14 | Indexador y verificación |
| 11 | A-19 | Demo de punta a punta |

**Meta de esta primera sesión: A-01 a A-05.**

## Puntos conocidos donde es fácil equivocarse

| Dónde | Qué cuidar |
|---|---|
| A-03, A-16 | La firma P-256 debe quedar sobre el digest `SHA-256(auth_digest)` y en low-S. Según la versión de `@noble/curves`, `sign` aplica SHA-256 al mensaje por defecto o espera el digest ya calculado. **Decide con los vectores del spec 03 §2**, no por intuición |
| A-03, A-04, A-08 | La API de las smart accounts de OpenZeppelin `stellar-contracts` (constructor, reglas de contexto, `AuthPayload`, trait `Verifier`) puede diferir de lo que dice el spec 03. Revisa el código fuente de la versión que fijes. Si no coincide, **detente y propónme el ajuste al spec** |
| A-04 | `bimo-registry` **no** puede tener función de actualización de código ni de borrado (ADR-15). Agrega una prueba que lo compruebe |
| A-05 | El admin es multifirma 2 de 3 (spec 03 §8). Necesitas las llaves públicas de Santiago y Lizeth: **pídemelas**. Ellos las generan con `stellar keys generate`; nunca generes ni guardes llaves privadas de otras personas |
| A-02 | Los triggers DB-02 y DB-04 son los más delicados. Prueba el caso del spec 01 §11 (`2026-10-07T04:30:00Z` → `2026-10-06`) |
| A-02, A-06 | Las tablas referencian `auth.users` de Supabase. Asegúrate de que la migración corra igual en local y en la nube |
| A-15 en adelante | La app debe seguir corriendo en **Expo Go** (spec 08 §3.0). No agregues dependencias nativas que Expo Go no traiga sin preguntarme, porque obligan a recompilar el development build en el Mac de Santiago |
| Todo | Montos en enteros, tiempo en UTC con milisegundos, día de negocio en Bogotá. Nada de montos ni datos personales en logs ni en la cadena |

## Al terminar la sesión

Deja un resumen con:
- issues cerrados y PRs abiertos;
- cambios propuestos o hechos a los specs;
- lo que desbloqueaste para Santiago y Lizeth (para avisarles);
- el siguiente issue recomendado y qué necesitas de mí para hacerlo.

Empieza verificando el entorno y leyendo `CLAUDE.md`.
