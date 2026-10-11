# Superprompt 3 — Entregable 3: Functional Proof (frontend)

> En Claude Code, en la raíz del repo: `Lee docs/prompts/03-entregable-semana3.md y empieza.`
> Este entregable va **antes** que `02-arranque-andre.md`. El kanban (`01-kanban.md`) puede esperar al lunes.

---

## Contexto

Bimo está en el bootcamp Blockchain Builders 101. El entregable de esta semana pide:

1. El **front** del producto con el flujo principal del MVP del Product Blueprint (`docs/semana2/ProductBlueprint.md`), en la carpeta `frontend/` del repo. Debe poder ejecutarse y verse.
2. La **decisión técnica de contratos** (opción A, contrato propio, u opción B, solución del ecosistema), justificada.
3. `docs/semana3/Documentacion.md` con cuatro secciones fijas.
4. `README.md` en la raíz **solo** con requisitos, instalación, cómo correrlo y el árbol de estructura.
5. Al menos **un commit propio por integrante** esta semana.

**Fecha límite:** domingo 11 de octubre. El enunciado dice 8:00 p. m. en un lado y 10:00 a. m. en la lista de verificación: **trabajamos para tener todo listo antes de las 10:00 a. m.**

No se escriben ni se despliegan contratos esta semana.

## La idea clave

Bimo es una app móvil (React Native con Expo, ADR-03), pero **Expo también exporta a web**. Construimos el front una sola vez en `frontend/`:
- en el **iPhone**, con Expo Go;
- en **cualquier navegador**, publicado en Vercel. Ese es el enlace que va a Apex y en la documentación.

Este front **no es desechable**: es el comienzo de la app real. Las pantallas se quedan y en las próximas semanas solo cambia la capa de datos, de datos de ejemplo a la lógica real.

## Reglas

1. Lee completos `CLAUDE.md`, `docs/semana2/ProductBlueprint.md`, `docs/specs/README.md`, `docs/arquitectura/ARQUITECTURA.md`, y de los specs: 01 §4.2 y §6, 04 §9, 05 §1 y §4, 07 §6 y 08 §1 a §3.
2. El flujo y las pantallas salen del **Blueprint**. Los datos, cálculos y textos de estado salen de los **specs**. No inventes reglas de negocio.
3. **Sin backend en esta entrega.** Todo funciona con datos de ejemplo en memoria.
4. **Sin módulos que solo existan en nativo** (`expo-secure-store`, `expo-sqlite`, `expo-local-authentication`): rompen la versión web. Face ID y el sello en Stellar se **simulan**, y la UI lo dice con una etiqueta discreta "Simulación" (el curso pide honestidad sobre testnet; el sello real llega la próxima semana).
5. Dinero en **enteros en centavos** (spec 01 §1), formateado al mostrar como `$ 20.000`. Tiempo en UTC; el "hoy" es la fecha en Bogotá.
6. Textos en español de Colombia, **sin jerga**: nunca "wallet", "token", "XLM", "blockchain" ni "hash" en la app del dueño (QA-04). En la página del verificador, "Stellar" puede aparecer solo en la sección "¿Cómo funciona?".
7. Antes de cada bloque grande, muéstrame un plan corto y espera mi "ok". Commits en Conventional Commits.

## Arquitectura del front

```
frontend/
├─ app/                    pantallas (expo-router)
│  ├─ (comercio)/          flujo del dueño
│  └─ verificar/[token].tsx  página pública del verificador
├─ src/
│  ├─ ui/                  sistema de diseño: tokens, botones, teclado de montos, tarjetas, listas, avisos, marco de teléfono para web
│  ├─ hooks/               useHoy, useRegistrarVenta, useMovimientos, useCierre, useSello, useEnlaces, useVerificacion, useCanales
│  ├─ mocks/               implementación en memoria (React Context + useReducer) y datos de ejemplo
│  └─ lib/                 formato de dinero y fechas, cálculos de "Hoy" (spec 04 §9)
```

- **Las pantallas solo hablan con `src/hooks/`.** Los hooks hoy usan `src/mocks/`; mañana usarán `sync`, `store`, `signer` y `api` sin tocar las pantallas. Define bien los tipos que devuelven los hooks; esa es la frontera con el backend.
- Los tipos del dominio siguen el spec 01 (cuentas, canales, asientos con líneas de debe y haber, estados del día y del sello). Una venta registrada se guarda como **asiento** con sus líneas, igual que en el spec 01 §6, para que los cálculos de "Hoy" sean los reales.
- **En web:** si la pantalla es ancha, el flujo del dueño se muestra dentro de un marco de teléfono centrado (unos 390–430 px). La página del verificador usa todo el ancho, porque el analista la abre en un computador.
- Stack: Expo SDK estable más reciente, `expo-router`, TypeScript `strict`, `react-native-web`. En `app.json`, `web.output = "single"` para publicar como SPA. Si necesitas una dependencia que no esté en el spec 08 §2 (por ejemplo `@expo/vector-icons`), justifícala y actualiza esa tabla en el mismo commit.

## Datos de ejemplo

Un comercio, **"Tienda Doña Marta"**, con 7 días de historia:
- 5 días **sellados**;
- **ayer** cerrado pero "falta tu confirmación";
- **hoy** abierto, con unas 12 ventas en efectivo, Bre-B, datáfono y billetera, incluida una dividida y un anticipo;
- canales configurados con su comisión y sus días de consignación, para que "pendiente de consignar" tenga fechas estimadas.

## Pantallas (flujo principal del Blueprint)

| # | Pantalla | Paso del Blueprint | Qué muestra o hace |
|---|---|---|---|
| 1 | Bienvenida y registro | 1 | Nombre del negocio; correo y código (simulado) |
| 2 | Configurar canales | 1 | Efectivo, Bre-B, datáfonos, billeteras; comisión (%) y días de consignación por canal |
| 3 | **Hoy** (inicio) | 4 | Vendido hoy, por canal, disponible, pendiente de consignar con fecha estimada, comisiones; botón grande "Registrar venta"; indicador "sin conexión / por subir" (spec 04 §9) |
| 4 | **Registrar venta** | 2, 3 | Teclado de monto y canal, con efectivo en ≤ 3 toques (QA-04); dividir el pago; marcar anticipo; nota; muestra la comisión estimada y cuándo llega la plata |
| 5 | Movimientos del día | 2, 6 | Lista; corregir una venta con un ajuste visible (reverso), sin borrar |
| 6 | **Cerrar el día** | 5 | Ingresar efectivo contado (y saldos); muestra diferencias para revisar |
| 7 | **Confirmar y sellar** | 6 | Resumen en lenguaje humano ("Sellar lunes 6 de octubre: 34 ventas, $ 1.240.000"); "Confirmar con Face ID" (simulado); estados con los textos de spec 07 §6: "Guardando tu cierre…" → "Sellado ✓"; si hay días pendientes, se confirman todos de una vez |
| 8 | Historial de días | 6 | Cada día con su estado: abierto, falta confirmación, sellado, requiere enmienda |
| 9 | Compartir historial | 7 | Elegir período y vigencia (7, 30 o 90 días); generar enlace (simulado); hoja de compartir; lista de enlaces con opción de revocar |
| 10 | **Página del verificador** (`/verificar/demo`) | 7 | Resumen del período, resultado por día (✅ coincide, ⚪ sin sellar, ❌ no coincide; spec 05 §4.1), totales por canal solo de días que coinciden, "% verificado por terceros", sección "¿Cómo funciona?". Un control de demo "Simular alteración" cambia un día a ❌ para mostrar qué pasa si alguien modifica los datos |

**Si sobra tiempo** (en este orden): salidas de caja (spec 04 §4.1), clientes de fiado, "Ventas por revisar".

## Publicación

1. `npx expo export --platform web` genera `frontend/dist`.
2. Agrega `frontend/vercel.json` con la reescritura de todas las rutas a `index.html`, para que `/verificar/demo` abra directo.
3. **Yo** inicio sesión en Vercel. No pidas ni guardes credenciales: dime los comandos o los pasos en la web de Vercel (Root Directory `frontend`, comando de build y carpeta de salida `dist`).
4. Verifica que el enlace publicado abre: la bienvenida, "Hoy" y `/verificar/demo`.

## Documentación

### `docs/semana3/Documentacion.md`, con estas secciones **en este orden**

1. **Front construido** (400–2000 palabras). Qué pantallas se implementaron y cómo se conectan con el MVP del Blueprint (usa la tabla de pantallas con el paso del Blueprint), el enlace de Vercel, cómo verlo en el celular con Expo Go y la arquitectura del front (pantallas → hooks → datos de ejemplo, y cómo se conectará al backend). Explica por qué el Blueprint decía "aplicación web" y ahora es una app móvil que también corre en web (ADR-03, Tap to Pay exige app nativa). Si se pueden tomar capturas, guárdalas en `docs/semana3/capturas/` y enlázalas; si no, deja la lista de capturas que el equipo debe tomar.
2. **Decisión técnica** (200–500 palabras). **Opción A: contrato propio**, apoyada en el uso de Stellar del Blueprint:
   - qué haría `bimo-registry`: guardar por comercio y por día la huella (raíz Merkle) del cierre, con la firma del dueño y la de Bimo, sin borrado ni actualización, y permitir enmiendas visibles (spec 03 §4, ADR-06, ADR-15);
   - por qué hace falta uno propio: ninguna herramienta existente guarda un sello diario por comercio co-firmado, inmutable y verificable por un tercero;
   - qué sí se reutiliza del ecosistema: la smart account de OpenZeppelin para la cuenta del comercio y el relayer de OpenZeppelin para que el comercio no pague fees (ADR-04, ADR-09);
   - qué se descartó y por qué: la opción B pura, y la variante de una transacción por venta (ADR-06).
3. **Participación del equipo** (breve). André (`andreMD287`), Santiago y Lizeth con su usuario de GitHub y su aporte real. **Pregúntame los usuarios** de Santiago y Lizeth y qué hizo cada uno; no lo inventes.
4. **Bloqueos y siguiente paso** (breve). Lo pendiente y el siguiente paso: contratos en testnet y backend (`02-arranque-andre.md`). Incluye que los specs todavía no modelan la **configuración de canales** (comisión y días de consignación) ni los **anticipos** del Blueprint; hay que agregarlos al spec 01 y al spec 04 antes del backend.

### `README.md` en la raíz, **nada más que esto**

- **Requisitos:** Node, pnpm o npm, Expo Go en el celular (opcional).
- **Instalación:** comandos.
- **Cómo correrlo:** web (`npx expo start --web`), celular (`npx expo start` y escanear con Expo Go), y el enlace publicado.
- **Árbol de estructura:** el del enunciado (`docs/semana1`, `docs/semana2`, `docs/semana3/Documentacion.md`, `frontend/`, `README.md`), más una línea para `docs/arquitectura` y `docs/specs`.

## Commits del equipo

El curso exige **un commit propio por integrante**, hecho desde su propia cuenta. **No hagas commits a nombre de Santiago ni de Lizeth.** Prepárales trabajo concreto y dime qué enviarles:

| Persona | Qué hace con su propio commit |
|---|---|
| André | Esqueleto de `frontend/`, hooks y datos de ejemplo, publicación en Vercel, decisión técnica |
| Lizeth | Sistema de diseño (`src/ui/`) y pulido visual de "Hoy", "Registrar venta", "Cerrar el día" y "Confirmar y sellar" |
| Santiago | Pantallas "Configurar canales" e "Historial de días", y el `README.md` |

Si conviene que Claude Code genere una primera versión de esas pantallas para que ellos la ajusten y la suban, déjala en una rama `feat/semana3-<persona>` y dime exactamente qué instrucciones darles. El commit final debe ser de ellos.

## Orden de trabajo

1. Revisa el entorno (Windows): Node, pnpm o npm, Git. Dime qué falta; no instales nada del sistema sin preguntar.
2. Crea el proyecto en `frontend/`, la navegación, `src/ui` básico, los tipos, los mocks y los hooks. **Haz push temprano** para que Lizeth y Santiago puedan trabajar encima.
3. Pantallas 3, 4, 6 y 7 (el corazón del flujo), luego 10 (lo que más impresiona en la demo) y después 1, 2, 5, 8 y 9.
4. Publicación en Vercel.
5. Documentación y README.
6. Lista de verificación final.

## Lista de verificación final

- [ ] `frontend/` corre con `npx expo start --web` y en Expo Go.
- [ ] El enlace de Vercel abre la bienvenida, "Hoy" y `/verificar/demo`.
- [ ] El flujo completo funciona: registrar venta → ver "Hoy" → cerrar → confirmar y sellar (simulado) → compartir → verificar.
- [ ] `docs/semana3/Documentacion.md` tiene las cuatro secciones, en orden y dentro de los rangos de palabras.
- [ ] La decisión técnica dice "Opción A" y por qué.
- [ ] El README solo tiene requisitos, instalación, cómo correrlo y el árbol.
- [ ] André, Santiago y Lizeth tienen cada uno al menos un commit esta semana (`git log --since="2026-10-05" --format="%an" | sort -u`).
- [ ] Recordatorio para mí: subir el repo a Apex y poner el enlace de Vercel en el campo **Website**.
