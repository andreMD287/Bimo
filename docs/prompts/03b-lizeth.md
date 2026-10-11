# Entregable 3 — Prompt de Lizeth

> **Empieza cuando André avise que el esqueleto está en `main`.**
> 1. `git checkout main && git pull`
> 2. `git checkout -b feat/semana3-lizeth`
> 3. En Claude Code, en la raíz del repo: `Lee docs/prompts/03b-lizeth.md y empieza.`

## Tu rol

Eres la diseñadora de la interfaz de Bimo. Te encargas de **cómo se ve y cómo se siente** la app: el sistema de diseño y las pantallas centrales del día a día del dueño, más la página que ve el banco al verificar.

Primero lee completos `CLAUDE.md`, `docs/prompts/03-entregable-semana3.md` (contexto común, dueños de archivos y reglas) y `docs/semana2/ProductBlueprint.md`. Luego los specs 04 §9 (qué muestra "Hoy"), 05 §1 y §4 (página del verificador) y 07 §6 (textos de cada estado).

Antes de cada bloque, muéstrame un plan corto y espera mi "ok".

## Qué archivos son tuyos

Solo puedes modificar estos. Si necesitas cambiar otro, avísale a su dueño:

- `frontend/src/ui/` (todo)
- `frontend/app/(comercio)/hoy.tsx`
- `frontend/app/(comercio)/venta.tsx`
- `frontend/app/(comercio)/movimientos.tsx`
- `frontend/app/(comercio)/cierre.tsx`
- `frontend/app/(comercio)/sellar.tsx`
- `frontend/app/verificar/[token].tsx`
- En `docs/semana3/Documentacion.md`: tu subsección de "Front construido" y tu línea en "Participación"

**Nunca importes `src/mocks/`.** Las pantallas solo usan los hooks de `src/hooks/`. Si te falta un dato, dime cuál y yo se lo pido a André.

## Bloque 1 — Sistema de diseño (hazlo primero y sube un commit)

Santiago usa tus componentes en sus pantallas, así que este bloque va primero. Haz push en cuanto esté y avisa por el grupo.

- **Tokens:** colores (una paleta cálida y confiable, alto contraste, legible bajo el sol de un local), tipografía, tamaños, espaciado y bordes.
- **Componentes:** rediseña los básicos que dejó André (pantalla, texto, botón, tarjeta, fila de lista, campo, teclado de monto) y agrega los que haga falta: chip de canal, insignia de estado del día, etiqueta "Simulación", aviso y montos grandes.
- **El marco de teléfono para web**, para que la app se vea bien en un computador.
- **Accesibilidad:** botones grandes (mínimo 44 px), texto legible, nada que dependa solo del color.

## Bloque 2 — Pantallas del día a día

En este orden, porque es el corazón del flujo:

1. **Hoy:** lo vendido hoy, por canal, lo disponible, lo pendiente de consignar con su fecha y las comisiones. El botón "Registrar venta" grande y siempre a mano.
2. **Registrar venta:** una venta en efectivo en **≤ 3 toques** (QA-04): monto, canal, listo. También dividir el pago, marcar anticipo y agregar nota. Muestra la comisión estimada y cuándo llega la plata.
3. **Cerrar el día:** efectivo contado y saldos; muestra las diferencias con claridad, sin asustar.
4. **Confirmar y sellar:** resumen en lenguaje humano ("Sellar lunes 6 de octubre: 34 ventas, $ 1.240.000"), botón "Confirmar con Face ID" (simulado) y los estados "Guardando tu cierre…" → "Sellado ✓". Si hay días pendientes, se confirman todos juntos.
5. **Movimientos del día:** lista de ventas; corregir una venta con un ajuste visible, sin borrarla.

## Bloque 3 — Página del verificador (`/verificar/demo`)

La ve un analista de banco en su computador; usa todo el ancho.

- Resumen del período y resultado por día: ✅ coincide, ⚪ sin sellar, ❌ no coincide (spec 05 §4.1).
- Totales por canal, contando **solo** los días que coinciden, y el "% verificado por terceros" (spec 05 §4.2).
- Sección "¿Cómo funciona?", en lenguaje simple. Aquí sí puede aparecer "Stellar".
- Un control "Simular alteración" que cambia un día a ❌, para mostrar qué pasa si alguien modifica los datos.

## Reglas de texto

Español de Colombia, sin jerga: nunca "wallet", "token", "XLM", "blockchain" ni "hash" en la app del dueño. Montos como `$ 20.000`. Los estados con los textos exactos del spec 07 §6.

## Al terminar

1. Revisa que todo se vea bien con `npx expo start --web` y en tu iPhone con Expo Go.
2. Escribe en `docs/semana3/Documentacion.md` **solo tus partes**:
   - la subsección "Pantallas del dueño: día a día" (pantallas 3 a 7) y "Página del verificador" (10): qué hace cada pantalla y con qué paso del Blueprint se conecta;
   - tu línea en "Participación": tu usuario de GitHub y tu aporte.
3. Haz commit **con tu cuenta** (por ejemplo `feat(frontend): add sistema de diseño y pantallas del día a día`), push y abre un PR a `main`. Avísale a André.

**Tiempo límite:** todo en el PR antes del domingo a las 7:00 a. m., para que André alcance a integrar.
