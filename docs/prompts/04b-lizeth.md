# Entregable 4 — Prompt de Lizeth

> **Empieza cuando André avise que la Fase 0 está en `main`** (hooks con la interfaz nueva). Lo del video y el plan de validación puedes adelantarlo desde hoy.
> 1. `git checkout main && git pull`
> 2. `git checkout -b feat/semana4-lizeth`
> 3. En Claude Code, en la raíz del repo: `Lee docs/prompts/04b-lizeth.md y empieza.`

## Tu rol

Eres la diseñadora de la interfaz de Bimo. Este entregable tiene tres trabajos tuyos: que **lo que ahora es real se vea y se sienta real** en las pantallas del sello y del verificador, el **plan de validación con usuarios** y el **video**.

Primero lee completos `CLAUDE.md`, `docs/prompts/04-entregable-semana4.md` (contexto común, dueños de archivos, recorte y calendario), `docs/semana1/The problem(1).md` y `docs/semana2/ProductBlueprint.md`. Luego los specs 07 §6 (textos de cada estado) y 05 §4 (verificador).

Antes de cada bloque, muéstrame un plan corto y espera mi "ok".

## Qué archivos son tuyos

Solo puedes modificar estos. Si necesitas cambiar otro, avísale a su dueño:

- `frontend/src/ui/` (todo)
- `frontend/app/(comercio)/hoy.tsx`, `venta.tsx`, `movimientos.tsx`, `cierre.tsx` y `sellar.tsx`
- `frontend/app/verificar/[token].tsx`
- En `docs/semana4/MVPFunctional.md`: **Plan de validación con usuarios**, el enlace del **video** y tu línea de participación

**Nunca importes `src/mocks/`, `src/api/` ni `src/signer/`.** Las pantallas solo usan los hooks de `src/hooks/`. Si te falta un dato, dime cuál y yo se lo pido a André.

## Bloque 1 — Confirmar y sellar con una transacción real (`sellar.tsx`)

Programa contra la interfaz de `useSello` que dejó André en la Fase 0 (no esperes al backend: en modo `demo` los valores son simulados).

1. **Fases con textos claros:** "Preparando tu cierre…" → confirmar (Face ID sigue simulado: conserva la etiqueta "Simulación" solo ahí) → "Guardando tu cierre…" → "Sellado ✓". Usa los textos exactos del spec 07 §6.
2. **Enlace al explorador:** cuando haya `urlExplorador`, un botón o enlace "Ver en el explorador de Stellar". Que se entienda que es la prueba pública de que el cierre quedó guardado.
3. **Errores sin asustar:** si `error` trae algo (sin red, el sello venció, se rechazó), un aviso claro con qué hacer, en lenguaje simple, y un botón para reintentar.
4. **Etiqueta según el modo:** donde `modo === 'testnet'` el sello es real, así que no debe decir "Simulación". En `demo` sí.

## Bloque 2 — Verificador con lectura real (`verificar/[token].tsx`)

La ve un analista de banco en su computador; usa todo el ancho.

1. **Estados de lectura** (`estadoLectura`): "Leyendo el historial…", resultado y "No pudimos conectar, intenta de nuevo", sin pantallas en blanco.
2. **Por día:** ✅ / ⚪ / ❌ como hoy, más el enlace "Ver el sello en el explorador" cuando haya `urlExplorador`. Si hay `raizEnCadena`, muéstrala en pequeño y en "Detalles", no en la vista principal.
3. **El ❌ debe explicarse bien:** "Los datos de este día no coinciden con lo que se guardó en Stellar". Ese es el momento fuerte del video.
4. **"¿Cómo funciona?"** puede decir "Stellar" y ahora puede decir que el sello es una transacción pública que cualquiera abre. Sigue sin jerga: nada de "hash" ni "blockchain" en la app del dueño.

## Bloque 3 — Plan de validación con usuarios (en `MVPFunctional.md`)

200–500 palabras, con estas cuatro partes (así lo pide el enunciado):

1. **A quiénes:** el usuario del Problem Brief (`docs/semana1`), con el perfil concreto de comercio y cuántos.
2. **Con qué métodos:** entrevistas, prueba con el producto (tarea guiada: registrar una venta en efectivo en ≤ 3 toques, cerrar y sellar, compartir), y métricas (tiempo, toques, errores, ¿entendió qué significa "Sellado"?).
3. **Qué hipótesis:** por ejemplo, "un dueño registra una venta en ≤ 5 s", "entiende para qué sirve el sello", "compartiría el enlace con un banco".
4. **Con qué criterio sabrán que se cumplen:** umbrales concretos (por ejemplo, "4 de 5 comercios completan la tarea sin ayuda").

Tiene que sonar a lo que de verdad van a hacer, no a un texto genérico. Si alcanzas a probar algo con una persona real antes del lunes, cuéntalo en una línea.

## Bloque 4 — El video (máximo 3 minutos)

Un solo video con el **producto funcionando** y el **pitch**. Obligatorio, público (YouTube) y con el enlace en la documentación.

1. **Guion (hoy o mañana):** escríbelo con tiempos.
   - 0:00–0:30 — el problema del comerciante y qué es Bimo, en dos frases claras.
   - 0:30–2:30 — la demo real: registrar una venta → "Hoy" → cerrar el día → confirmar y sellar → abrir el enlace al explorador → compartir → abrir el verificador y ver ✅ → alterar un dato y ver ❌.
   - 2:30–3:00 — cierre: "Ni nosotros podemos cambiar tu historial, y cualquiera puede comprobarlo", y a dónde ir a verlo.
2. **Grabación: lunes a las 2:00 p. m.,** cuando André confirme que el flujo funciona de punta a punta en Vercel. Ensaya el flujo antes con el modo `demo` para que no se te pase ningún paso. Deja una toma de respaldo con el modo `demo` por si la red falla.
3. **Subida:** YouTube, en modo público. Comprueba que abre sin iniciar sesión y dura **3:00 o menos**. Pon el enlace en `MVPFunctional.md`.
4. **Bono de redes (opcional):** si lo publican en redes etiquetando a la organización, agrega también el enlace de la publicación.

## Al terminar

1. Revisa que todo se vea bien con `npx expo start --web`, en modo `demo` y en modo `testnet` (cuando André lo tenga).
2. Escribe en `docs/semana4/MVPFunctional.md` **solo tus partes**: plan de validación, enlace del video (y de la publicación) y tu línea en "Participación" con tu usuario de GitHub y tu aporte.
3. Haz commit **con tu cuenta** (por ejemplo `feat(frontend): add estados reales del sello y del verificador`), push y abre un PR a `main`. Avísale a André.

**Tiempos:** PR de las pantallas antes del domingo a las 8:00 p. m. Video grabado el lunes a las 2:00 p. m. y subido a las 4:00 p. m.
