# Entregable 4 — Prompt de Lizeth

> **Puedes empezar hoy con L-01 y el guion del video.** Lo demás se conecta a los hooks reales a medida que André los cierre.
> 1. `git checkout main && git pull`
> 2. En Claude Code, en la raíz del repo: `Lee docs/prompts/04b-lizeth.md y empieza.`

## Tu rol

Eres la diseñadora de la interfaz de Bimo. Tus issues son **L-01 a L-11** (`persona:lizeth`): el sistema de diseño, todas las pantallas del dueño, la página del verificador y la prueba de usabilidad. Además escribes el **plan de validación con usuarios** y llevas el **video**.

Primero lee completos `CLAUDE.md`, `docs/prompts/04-entregable-semana4.md` (contexto común, hitos, dueños de archivos y reglas), `docs/semana1/The problem(1).md` y `docs/semana2/ProductBlueprint.md`. Antes de cada issue, lee el issue completo y los specs que cita (por ejemplo 04 §9, 05 §1 y §4, 07 §6).

Trabaja cada issue con el flujo de `CLAUDE.md` §8 y de `docs/prompts/02-arranque-andre.md` (sección "Cómo trabajar cada issue"): plan corto, espera mi "ok", mueve la tarjeta a In Progress, rama `feat/<ID>-<slug>`, PR con `Closes #n` o `Refs #n`, tarjeta a In Review. Yo fusiono. Necesitas `gh auth refresh -s project`.

## Qué archivos son tuyos

- `frontend/src/ui/` (todo)
- **Todo `frontend/app/`**: las pantallas del Entregable 3 y las nuevas, **salvo `_layout.tsx`** (de André). Desde esta semana las pantallas de bienvenida, canales, historial y compartir también son tuyas (L-02 y L-09); Santiago ya no las toca
- `docs/usabilidad.md`
- En `docs/semana4/MVPFunctional.md`: **Plan de validación con usuarios**, el enlace del **video** y tu línea de participación

**Nunca importes** `src/store/`, `src/sync/`, `src/signer/`, `src/api/` ni `src/mocks/`. Las pantallas solo usan los hooks de `src/hooks/`. Mientras un hook real no exista, el hook usa los datos en memoria con los mismos tipos: programa contra los tipos. Si te falta un dato, dime cuál y yo se lo pido a André. Si una pantalla nueva necesita registrarse en `_layout.tsx`, también por mí.

## Orden de trabajo

El orden busca tener lo central del flujo listo para que André conecte los hooks reales, y que lo que depende de otros llegue cuando ellos terminen.

| Orden | Issue | Hook que consume (lo entrega) | Notas |
|---|---|---|---|
| 1 | **L-01** Sistema de diseño | — | Empieza hoy. Los demás usan tus componentes. Haz push en cuanto esté y avisa por el grupo. Tokens, componentes (pantalla, texto, botón, tarjeta, fila de lista, campo, teclado de monto, chip de canal, insignia de estado del día, etiqueta "Simulación", aviso), marco de teléfono para web y accesibilidad (botones de 44 px o más, nada que dependa solo del color) |
| 2 | **L-03** Registrar venta | `useRegistrarVenta` (A-17) | Efectivo en **≤ 3 toques** (QA-04). Monto, canal, pago dividido, anticipo, fiado con cliente y nota; comisión estimada y cuándo llega la plata |
| 3 | **L-04** "Hoy" | `useHoy` (A-17) | Datos del spec 04 §9, indicador de ventas por subir y aviso de reloj (spec 04 §7) |
| 4 | **L-07** Cierre del día | `useCierre` (A-18) | Conteo de efectivo, diferencia sin asustar y días sin cerrar |
| 5 | **L-08** Pantalla de firma | `useSello` (A-18) | Resumen en lenguaje humano ("Sellar lunes 6 de octubre: 34 ventas, $ 1.240.000"), Face ID, estados del sello y errores (vencida, reemplazada) con los textos exactos del spec 07 §6. Lo que sea simulado (Face ID en web y Expo Go) lleva la etiqueta "Simulación"; lo que sea real, no. Cuando haya transacción, enlace "Ver en el explorador de Stellar" |
| 6 | **L-02** Onboarding | `useComercio`, `useCanales` (A-16) | Bienvenida, correo y código, nombre del negocio, configurar canales y "Preparando tu cuenta…" con los textos del spec 07 §6 |
| 7 | **L-10** Página `/verificar` | `useVerificacion` (S-08) | La ve un analista de banco; usa todo el ancho. Resultado por día (✅ / ⚪ / ❌), resumen del período, totales por canal solo de días que coinciden, "% verificado por terceros", estados de lectura y de error de red, y "¿Cómo funciona?" en lenguaje simple. El ❌ se explica bien: "Los datos de este día no coinciden con lo que se guardó en Stellar" |
| 8 | **L-09** Compartir y "Ventas por revisar" | `useEnlaces` (A-14) | Crear enlace, hoja de compartir (en web, copiar), lista y revocar; el enlace abre `/verificar/<token>` |
| 9 | **L-05** Clientes de fiado | hooks de A-17 | Lista, detalle con saldo y abonos |
| 10 | **L-06** Salidas de plata y correcciones | hooks de A-17 | Gasto o retiro; corregir una venta con un reverso visible, sin borrar |
| 11 | **L-11** Prueba de usabilidad | — | Ver abajo |

Cuando cierres una pantalla con datos de ejemplo, déjala lista y dime qué issue de André falta para conectarla. Cuando André avise que el hook real está en `main`, conecta y vuelve a probar.

## Reglas de texto

Español de Colombia, sin jerga: nunca "wallet", "token", "XLM", "blockchain" ni "hash" en la app del dueño. Montos como `$ 20.000`. Los estados con los textos exactos del spec 07 §6.

## Plan de validación con usuarios (en `MVPFunctional.md`)

200–500 palabras, con las cuatro partes que pide el enunciado:

1. **A quiénes:** el usuario del Problem Brief (`docs/semana1`), con perfil concreto y cuántos.
2. **Con qué métodos:** entrevistas, prueba con el producto (tarea guiada: registrar una venta en efectivo en ≤ 3 toques, cerrar y sellar, compartir) y métricas (tiempo, toques, errores, si entendió qué significa "Sellado").
3. **Qué hipótesis:** por ejemplo, "un dueño registra una venta en ≤ 5 s", "entiende para qué sirve el sello", "compartiría el enlace con un banco".
4. **Con qué criterio sabrán que se cumplen:** umbrales concretos (por ejemplo, "4 de 5 comercios completan la tarea sin ayuda").

Tiene que sonar a lo que de verdad van a hacer, no a un texto genérico.

## L-11 — Prueba de usabilidad

Escribe el guion y el formato de registro en `docs/usabilidad.md` hoy. Corre la prueba con las personas reales que alcances antes del lunes a las 12:00 m. Con cada una, anota tiempo, toques y errores. **Registra solo lo que de verdad se hizo**: si solo se alcanzó con 2 o 3 personas, dilo así en el documento y en "Riesgos y pendientes". No inventes resultados.

## El video (máximo 3 minutos)

Un solo video con el **producto funcionando** y el **pitch**. Obligatorio, público (YouTube) y con el enlace en la documentación.

1. **Guion (hoy o mañana)**, con tiempos. Basado en el guion de la demo del spec 08 §7:
   - 0:00–0:30 — el problema del comerciante y qué es Bimo, en dos frases claras.
   - 0:30–2:30 — la demo real: registrar ventas, "Hoy", cerrar el día, confirmar y sellar, abrir el enlace al explorador, compartir, abrir el verificador y ver ✅, alterar un dato y ver ❌.
   - 2:30–3:00 — cierre: "Ni nosotros podemos cambiar tu historial, y cualquiera puede comprobarlo", y a dónde ir.
2. **Grabación: lunes a las 2:00 p. m.**, cuando André confirme el congelamiento de funciones. Ensaya el flujo antes y deja una toma de respaldo.
3. **Subida:** YouTube, en modo público; comprueba que abre sin iniciar sesión y dura **3:00 o menos**. Pon el enlace en `MVPFunctional.md`.
4. **Bono de redes (opcional):** si lo publican en redes etiquetando a la organización, agrega también el enlace de la publicación.

## Al terminar

1. Revisa todo con `npx expo start --web`, y en tu iPhone con Expo Go cuando aplique.
2. Escribe en `docs/semana4/MVPFunctional.md` **solo tus partes**: plan de validación, enlace del video (y de la publicación) y tu línea en "Participación" con tu usuario de GitHub y tu aporte.
3. Cada PR sale **con tu cuenta**. Avísale a André cuando abras uno.

**Tiempos:** L-01 hoy. Las pantallas centrales (L-03, L-04, L-07, L-08) en PR antes del domingo a las 8:00 p. m. El resto, antes del lunes a las 12:00 m. Video grabado el lunes a las 2:00 p. m. y subido a las 4:00 p. m.
