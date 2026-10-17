# Entregable 4 — Prompt de André

> En Claude Code, en la raíz del repo: `Haz git pull de main. Luego lee docs/prompts/04a-andre.md y empieza.` (El `04-entregable-semana4.md` es contexto: no lo ejecutes por separado.)

## Tu rol

Eres el desarrollador principal de Bimo junto a André. Vas a implementar sus issues (`persona:andre`, A-00 a A-19) con calidad de producción y **siguiendo los specs al pie de la letra, sin recortar la arquitectura**. Este prompt **se apoya en `docs/prompts/02-arranque-andre.md`**: ahí están las reglas que no se negocian, el entorno, cómo trabajar cada issue (plan, "ok", kanban, PR, resumen) y la tabla de puntos donde es fácil equivocarse. **Léelo completo y síguelo.** Lo que cambia para esta semana está abajo.

Primero lee completos `CLAUDE.md`, `docs/prompts/02-arranque-andre.md`, `docs/prompts/04-entregable-semana4.md` (contexto común, hitos, dueños de archivos y lista final) y `docs/semana2/ProductBlueprint.md`. Luego, antes de cada issue, los specs que cita.

Trabajo en Windows: verifica el entorno como dice el 02 y no instales nada del sistema sin preguntar.

## Qué cambia respecto al prompt 02

1. **Hay fecha límite:** lunes 19 de octubre, 11:00 p. m.; subimos a las 8:00 p. m. Hoy es sábado 17. El orden de abajo busca primero la **evidencia obligatoria** (contratos en testnet) y después la cadena crítica.
2. **Los hitos del contexto común mandan.** Avísame al llegar a cada uno.
3. **Santiago y Lizeth ya están trabajando en paralelo** (S-01, S-02, S-04, L-01 desde hoy). Desbloquearlos es parte de tu trabajo: cuando cierres un issue que alguien espera, dime qué mensaje mandar al grupo.
4. **Debes producir evidencia y documentación** (Fase final), además del código.
5. **El domingo a las 8:00 p. m.** me dices cuánto llevamos y qué issues conviene reasignarle a Santiago para no atrasar la cadena (por ejemplo A-13 o A-14).
6. **Cada issue termina con prueba.** Si algo queda a medias, lo marcas en el issue como pendiente y no lo maquillas.

## Orden de trabajo

Respeta las dependencias del kanban. Lo que cambia respecto al 02 es que los contratos van antes que las migraciones, porque son la evidencia obligatoria y son independientes de la base de datos.

| Orden | Issue | Notas |
|---|---|---|
| 0 | **A-00** Specs: canales y anticipos | Propón el texto de los cambios a los specs 01, 02, 04 y 06 y **espera mi aprobación**. Sin esto el backend no puede modelar lo que el front ya muestra. Si el issue no existe, créalo |
| 1 | **A-01** Esqueleto del monorepo y CI `specs` | Hazlo **mínimo y rápido** (1 hora): desbloquea a Santiago y a Lizeth. Integra el `frontend/` que existe. Propón la forma de que `shared/` lo consuman `core`, `verifier` y `frontend` sin romper Metro ni `npx expo export --platform web`; **pruébala antes de proponerla** |
| 2 | **A-04** `bimo-registry` | Riesgo alto. Todas las pruebas del spec 03 §10 |
| 3 | **A-03** `bimo-p256-verifier` | Riesgo alto. Vectores exactos del spec 03 §2; decide con ellos, no por intuición |
| 4 | **A-05** Despliegue en testnet | **Hito 1.** Cuentas `admin`, `attester`, `deployer` y `fallback`. Pídeme las llaves públicas de Santiago y Lizeth para el admin 2 de 3: ellos las generan con `stellar keys generate`. Prueba QA-02 y guarda el resultado |
| 5 | **A-02** Migraciones de Supabase | Triggers DB-01..DB-12; prueba el caso del spec 01 §11. Si no hay Docker, propón un proyecto de Supabase en la nube y espera mi decisión |
| 6 | A-06 → A-07 | Base de `core`, registro de comercio, reto y dispositivo |
| 7 | **A-15** | La base local detrás de los hooks; desbloquea a Lizeth con datos reales |
| 8 | A-09 → A-10 | Sincronización (push y pull) |
| 9 | **A-08** | Worker de despliegue de `bimo-account` y puerto `Enviador` con `EnviadorDirecto` (el único para la demo; `EnviadorRelayer` diferido) |
| 10 | A-11 → **A-12** | Cierre y sellado; **Hito 3** junto con A-16 a A-18 |
| 11 | A-16 → A-17 → **A-18** | `Firmante`, sync y firma en la app. En Expo Go la llave va sin biometría; en web, detrás de la misma interfaz |
| 12 | **A-14**, A-13 | Enlaces y API pública de verificación; indexador. **Hito 4** |
| 13 | **A-19** | Ensayo de punta a punta con el guion del spec 08 §7 |

Cada issue entrega los hooks que dice el kanban; avísame para avisar a Lizeth cuáles quedaron listos.

## Fase final — Documentación, integración y entrega

1. **Documentación.** Crea `docs/semana4/MVPFunctional.md` **al empezar** (después de A-01) con los encabezados del contexto común y un marcador `<!-- Escribe aquí: <persona> -->` por parte, para que los otros escriban sin conflictos. Al final, solo tus partes:
   - **Aprendizajes y ajustes priorizados** (150–300 palabras): qué aprendiste y qué cambias, ordenado por impacto y esfuerzo; qué se ajusta antes del cierre y qué queda pendiente.
   - **Riesgos y pendientes** (200–400 palabras): con honestidad, sin esconder lo que no se terminó.
   - **Evidencia de producto, contratos y transacciones:** enlace de Vercel y, por cada contrato, el enlace al explorador y los de sus transacciones (`seal`, la prueba de QA-02, el despliegue de una `bimo-account`).
2. **Integración.** Revisa los PRs de Lizeth y Santiago: que solo toquen sus archivos, que usen los hooks y que no rompan la web. Si una pantalla necesita un dato que ningún hook da, agrégalo tú.
3. **Vercel.** Dime los pasos y las variables de entorno públicas (URL de la API, red); **nunca** secretos. Yo inicio sesión; no pidas ni guardes credenciales. `core` va en Railway con sus variables como secretos del servicio (spec 08 §3.1).
4. **Lunes 2:00 p. m.:** congelamiento de funciones. Solo correcciones hasta subir.
5. Corre la lista de verificación final del contexto común, con el comando de commits por autor y la búsqueda de secretos, y dime qué falta.
6. Recuérdame registrar el proyecto en Apex antes de las 8:00 p. m. del lunes, con el enlace de Vercel en **Website**.

## Al terminar cada sesión

Deja el resumen del 02: issues cerrados y PRs abiertos con la columna de cada tarjeta, cambios propuestos o hechos a los specs, lo que desbloqueaste para Santiago y Lizeth, y el siguiente issue recomendado con lo que necesitas de mí.

Empieza verificando el entorno y leyendo `CLAUDE.md`.
