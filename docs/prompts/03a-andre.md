# Entregable 3 — Prompt de André

> En Claude Code, en la raíz del repo: `Lee docs/prompts/03a-andre.md y empieza.`

## Tu rol

Eres el desarrollador principal de Bimo junto a André. En este entregable tu trabajo es **desbloquear al equipo**: dejar el esqueleto del front con los hooks y los datos de ejemplo, para que Lizeth y Santiago construyan sus pantallas encima. Después publicas en Vercel, escribes tu parte de la documentación e integras los PRs.

Primero lee completos `CLAUDE.md`, `docs/prompts/03-entregable-semana3.md` (contexto común, dueños de archivos y reglas) y `docs/semana2/ProductBlueprint.md`, y las secciones de specs que cita el contexto común.

Trabajo en Windows. Revisa que estén Node, npm o pnpm y Git; dime qué falta y no instales nada del sistema sin preguntar. Antes de cada fase, muéstrame un plan corto y espera mi "ok".

## Fase 1 — Esqueleto (meta: 2–3 horas, y push a `main`)

Rama `feat/semana3-andre`. Cuando termines esta fase, fusiona a `main` y dime qué mensaje mandar al grupo.

1. Proyecto Expo (SDK estable más reciente) en `frontend/`, con `expo-router` y TypeScript `strict`. En `app.json`, `web.output = "single"`. Debe abrir con `npx expo start --web` y en Expo Go.
2. `app/_layout.tsx` con la navegación del flujo y el **marco de teléfono** para pantallas anchas en web (la ruta `verificar/*` va sin marco).
3. **Todas las pantallas de la tabla del contexto común creadas como archivos**, con un título y el texto "En construcción". Así cada dueño solo edita su archivo, y nadie toca la navegación.
4. `src/lib/`: formato de dinero (centavos → `$ 20.000`), fechas en Bogotá y los cálculos de "Hoy" del spec 04 §9.
5. `src/mocks/`: estado en memoria con React Context + `useReducer`, y los datos de ejemplo de "Tienda Doña Marta" que describe el contexto común. Las ventas se guardan como **asientos con líneas** (spec 01 §6). Incluye los canales con comisión y días de consignación, y los anticipos, aunque los specs todavía no los tienen (queda anotado en Bloqueos).
6. `src/hooks/`, con tipos claros: `useComercio`, `useCanales`, `useHoy`, `useRegistrarVenta`, `useMovimientos`, `useCierre`, `useSello`, `useHistorial`, `useEnlaces` y `useVerificacion`. Documenta en un comentario al inicio de cada hook qué devuelve y qué acciones ofrece. **Esta es la frontera con el backend real.**
7. `src/ui/` con componentes básicos y sin estilo elaborado (pantalla, texto, botón, tarjeta, fila de lista, campo, teclado de monto). Lizeth los rediseña después; no inviertas tiempo en lo visual.
8. `frontend/vercel.json` con la reescritura de todas las rutas a `index.html`.
9. `docs/semana3/Documentacion.md` con los cuatro encabezados del enunciado y las subsecciones de la tabla "Documentación: quién escribe qué", cada una con un marcador `<!-- Escribe aquí: <persona> -->`.

## Fase 2 — Publicación

1. `npx expo export --platform web` genera `frontend/dist`.
2. Dime los pasos para publicar en Vercel (Root Directory `frontend`, comando de build y carpeta de salida `dist`). **Yo inicio sesión**; no pidas ni guardes credenciales.
3. Comprueba que abren la bienvenida, "Hoy" y `/verificar/demo`. Cada vez que se fusione un PR, Vercel debe volver a publicar.

## Fase 3 — Tu parte de la documentación

En `docs/semana3/Documentacion.md`, solo tus secciones:

- **Front construido**: introducción, enlace de Vercel, cómo verlo en el celular con Expo Go, arquitectura (pantallas → hooks → datos de ejemplo, y cómo se conectará al backend), y por qué el Blueprint decía "aplicación web" y ahora es una app móvil que también corre en web (ADR-03: Tap to Pay exige app nativa).
- **Decisión técnica** (200–500 palabras): **Opción A, contrato propio.**
  - Qué haría `bimo-registry`: guardar por comercio y por día la huella del cierre, con la firma del dueño y la de Bimo, sin borrado ni actualización, con enmiendas visibles (spec 03 §4, ADR-06, ADR-15).
  - Por qué hace falta uno propio: ninguna herramienta existente guarda un sello diario por comercio co-firmado, inmutable y verificable por un tercero.
  - Qué se reutiliza del ecosistema: la smart account y el relayer de OpenZeppelin (ADR-04, ADR-09).
  - Qué se descartó: la opción B pura y una transacción por venta (ADR-06).
- **Participación**: tu línea (`andreMD287` y tu aporte).
- **Bloqueos y siguiente paso**: contratos en testnet y backend (`docs/prompts/02-arranque-andre.md`); y que los specs 01 y 04 todavía no modelan la configuración de canales ni los anticipos del Blueprint (tarea A-00).

## Fase 4 — Integración

1. Revisa los PRs de Lizeth y Santiago: que solo toquen sus archivos, que usen los hooks (nunca `src/mocks/` directo) y que no rompan la web.
2. Si una pantalla necesita un dato que ningún hook da, agrégalo tú al hook.
3. Corre la lista de verificación final del contexto común y dime qué falta.
4. Recuérdame subir el repo a Apex con el enlace de Vercel en **Website**.
