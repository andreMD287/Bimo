# Entregable 3 — Prompt de Santiago

> **Empieza cuando André avise que el esqueleto está en `main`.**
> 1. `git checkout main && git pull`
> 2. `git checkout -b feat/semana3-santiago`
> 3. En Claude Code, en la raíz del repo: `Lee docs/prompts/03c-santiago.md y empieza.`

## Tu rol

Te encargas de las pantallas de **configuración e historial** de la app y del `README.md` del repositorio. Son tareas acotadas: cada pantalla usa hooks que ya dejó André y componentes de `src/ui/`.

Primero lee completos `CLAUDE.md`, `docs/prompts/03-entregable-semana3.md` (contexto común, dueños de archivos y reglas) y `docs/semana2/ProductBlueprint.md` (pasos 1, 6 y 7 del flujo).

Antes de cada bloque, muéstrame un plan corto y espera mi "ok".

## Qué archivos son tuyos

Solo puedes modificar estos. Si necesitas cambiar otro, avísale a su dueño:

- `frontend/app/index.tsx`
- `frontend/app/canales.tsx`
- `frontend/app/(comercio)/historial.tsx`
- `frontend/app/(comercio)/compartir.tsx`
- `README.md` (raíz del repo)
- En `docs/semana3/Documentacion.md`: tu subsección de "Front construido" y tu línea en "Participación"

**Nunca importes `src/mocks/`.** Las pantallas solo usan los hooks de `src/hooks/`. **Usa los componentes de `src/ui/`**, que diseña Lizeth; no crees estilos propios. Si un componente no existe todavía, usa el más parecido y avísale a Lizeth. Si te falta un dato en un hook, avísale a André.

## Bloque 1 — Pantallas

1. **Bienvenida y registro** (`index.tsx`): nombre del negocio, correo y código de verificación (simulado; cualquier código de 6 dígitos sirve). Al terminar, lleva a "Configurar canales". Hook: `useComercio`.
2. **Configurar canales** (`canales.tsx`): efectivo, Bre-B, datáfonos y billeteras. Para cada canal, encenderlo o apagarlo, su comisión en porcentaje y en cuántos días consigna. Al terminar, lleva a "Hoy". Hook: `useCanales`.
3. **Historial de días** (`historial.tsx`): lista de días con su total vendido y su estado, con los textos exactos del spec 07 §6: "Abierto", "Cerrado · falta tu confirmación", "Sellado ✓", "Llegaron ventas después del cierre · confirma de nuevo". Hook: `useHistorial`.
4. **Compartir historial** (`compartir.tsx`): elegir el período y la vigencia (7, 30 o 90 días), generar el enlace (simulado), compartirlo con la hoja de compartir del sistema (en web, copiar al portapapeles) y la lista de enlaces creados con opción de revocar (spec 05 §2). El enlace de demo apunta a `/verificar/demo`. Hook: `useEnlaces`.

Reglas de texto: español de Colombia, sin jerga (nunca "wallet", "token", "XLM", "blockchain" ni "hash"). Montos como `$ 20.000`.

## Bloque 2 — README

El `README.md` de la raíz lleva **solo** estas cuatro secciones, nada más:

1. **Requisitos:** Node (versión) y npm o pnpm; Expo Go en el celular (opcional).
2. **Instalación:** los comandos, desde clonar el repo hasta instalar las dependencias de `frontend/`.
3. **Cómo correrlo:** web (`npx expo start --web`), celular (`npx expo start` y escanear el QR con Expo Go) y el enlace publicado en Vercel (pídeselo a André).
4. **Árbol de estructura:** el del enunciado (`docs/semana1`, `docs/semana2`, `docs/semana3/Documentacion.md`, `frontend/`, `README.md`), más una línea para `docs/arquitectura` y `docs/specs`.

Prueba tú mismo cada comando del README en un clon limpio antes de darlo por bueno.

## Al terminar

1. Revisa que tus pantallas funcionen con `npx expo start --web` y en tu iPhone con Expo Go.
2. Escribe en `docs/semana3/Documentacion.md` **solo tus partes**:
   - la subsección "Pantallas de configuración e historial" (pantallas 1, 2, 8 y 9): qué hace cada una y con qué paso del Blueprint se conecta;
   - tu línea en "Participación": tu usuario de GitHub y tu aporte.
3. Haz commit **con tu cuenta** (por ejemplo `feat(frontend): add pantallas de registro, canales, historial y compartir`), push y abre un PR a `main`. Avísale a André.

**Tiempo límite:** todo en el PR antes del domingo a las 7:00 a. m., para que André alcance a integrar.
