# Entregable 3 — Contexto común del equipo (frontend)

> **Este archivo no se ejecuta solo.** Cada integrante corre su propio prompt, que empieza leyendo este:
> - André: `docs/prompts/03a-andre.md`
> - Lizeth: `docs/prompts/03b-lizeth.md`
> - Santiago: `docs/prompts/03c-santiago.md`
>
> Orden: **André primero** (deja listo el esqueleto en unas 2–3 horas y avisa por el grupo). Después Lizeth y Santiago trabajan en paralelo.

---

## Qué pide el entregable

1. El **front** con el flujo principal del MVP del Product Blueprint (`docs/semana2/ProductBlueprint.md`), en `frontend/`. Debe poder ejecutarse y verse.
2. La **decisión técnica de contratos** (opción A o B), justificada.
3. `docs/semana3/Documentacion.md` con cuatro secciones fijas.
4. `README.md` en la raíz **solo** con requisitos, instalación, cómo correrlo y el árbol de estructura.
5. **Un commit propio por integrante**, hecho desde su propia cuenta.

**Fecha límite:** domingo 11 de octubre. El enunciado dice 8:00 p. m. en un lado y 10:00 a. m. en otro: **todo listo antes de las 10:00 a. m.**

No se escriben contratos esta semana.

## La idea clave

Bimo es una app móvil hecha con Expo (ADR-03), y **Expo también exporta a web**. El front se construye una sola vez en `frontend/`: en el iPhone corre con Expo Go, y en cualquier navegador se ve publicado en Vercel. Ese enlace va a Apex.

No es desechable: las pantallas se quedan para la app real. Solo cambiará la capa de datos.

## Reglas para todos

1. Lee `CLAUDE.md`, este archivo y `docs/semana2/ProductBlueprint.md` antes de tocar código.
2. El flujo sale del **Blueprint**. Los datos, cálculos y textos de estado salen de los specs: 01 §4.2 y §6 (cuentas y asientos), 04 §9 (cálculos de "Hoy"), 05 §1 y §4 (verificador) y 07 §6 (textos de estado).
3. **Sin backend.** Todo funciona con datos de ejemplo en memoria.
4. **Sin módulos que solo existan en nativo** (`expo-secure-store`, `expo-sqlite`, `expo-local-authentication`): rompen la versión web. Face ID y el sello en Stellar se **simulan**, y la UI lo dice con una etiqueta discreta "Simulación".
5. Dinero en **enteros en centavos**, mostrado como `$ 20.000`. El "hoy" es la fecha en Bogotá.
6. Español de Colombia, **sin jerga** en la app del dueño: nunca "wallet", "token", "XLM", "blockchain" ni "hash". En el verificador, "Stellar" solo en la sección "¿Cómo funciona?".
7. **Cada quien toca solo sus archivos** (tabla de abajo). Si necesitas cambiar un archivo de otra persona, pídeselo por el grupo.
8. Cada persona trabaja en su rama `feat/semana3-<nombre>` y abre un PR a `main`. André revisa y fusiona.
9. Commits en Conventional Commits (`feat(frontend): …`, `docs: …`), **desde tu propia cuenta de GitHub**.

## Arquitectura del front

```
frontend/
├─ app/                        pantallas (expo-router); el archivo de cada pantalla es de su dueño
│  ├─ _layout.tsx              navegación (André)
│  ├─ index.tsx                bienvenida y registro (Santiago)
│  ├─ canales.tsx              configurar canales (Santiago)
│  ├─ (comercio)/hoy.tsx       Hoy (Lizeth)
│  ├─ (comercio)/venta.tsx     registrar venta (Lizeth)
│  ├─ (comercio)/movimientos.tsx  movimientos del día (Lizeth)
│  ├─ (comercio)/cierre.tsx    cerrar el día (Lizeth)
│  ├─ (comercio)/sellar.tsx    confirmar y sellar (Lizeth)
│  ├─ (comercio)/historial.tsx historial de días (Santiago)
│  ├─ (comercio)/compartir.tsx compartir historial (Santiago)
│  └─ verificar/[token].tsx    página del verificador (Lizeth)
├─ src/
│  ├─ ui/                      sistema de diseño (Lizeth); André deja componentes básicos para arrancar
│  ├─ hooks/                   la frontera con los datos (André)
│  ├─ mocks/                   datos de ejemplo en memoria (André)
│  └─ lib/                     dinero, fechas y cálculos de "Hoy" (André)
```

**Las pantallas solo hablan con `src/hooks/`.** Nunca importan `src/mocks/` directamente. Si una pantalla necesita un dato que ningún hook da, se le pide a André.

**En web:** el flujo del dueño se muestra dentro de un marco de teléfono centrado (unos 390–430 px). La página del verificador usa todo el ancho.

## Datos de ejemplo

Comercio **"Tienda Doña Marta"**, con 7 días de historia: 5 días sellados, ayer cerrado con "falta tu confirmación", y hoy abierto con unas 12 ventas (efectivo, Bre-B, datáfono y billetera, incluida una dividida y un anticipo). Los canales tienen comisión y días de consignación, para que "pendiente de consignar" muestre fechas.

## Pantallas y dueños

| # | Pantalla | Paso del Blueprint | Dueño | Qué muestra o hace |
|---|---|---|---|---|
| 1 | Bienvenida y registro | 1 | Santiago | Nombre del negocio; correo y código (simulado) |
| 2 | Configurar canales | 1 | Santiago | Efectivo, Bre-B, datáfonos, billeteras; comisión (%) y días de consignación |
| 3 | **Hoy** (inicio) | 4 | Lizeth | Vendido hoy, por canal, disponible, pendiente de consignar con fecha, comisiones; botón "Registrar venta" |
| 4 | **Registrar venta** | 2, 3 | Lizeth | Teclado de monto y canal; efectivo en ≤ 3 toques (QA-04); dividir el pago; anticipo; nota; comisión estimada y cuándo llega la plata |
| 5 | Movimientos del día | 2, 6 | Lizeth | Lista; corregir con un ajuste visible, sin borrar |
| 6 | **Cerrar el día** | 5 | Lizeth | Efectivo contado y saldos; diferencias para revisar |
| 7 | **Confirmar y sellar** | 6 | Lizeth | Resumen ("Sellar lunes 6 de octubre: 34 ventas, $ 1.240.000"); "Confirmar con Face ID" simulado; "Guardando tu cierre…" → "Sellado ✓" |
| 8 | Historial de días | 6 | Santiago | Cada día con su estado (abierto, falta confirmación, sellado, requiere enmienda) |
| 9 | Compartir historial | 7 | Santiago | Período y vigencia; generar enlace (simulado); lista con opción de revocar |
| 10 | **Página del verificador** (`/verificar/demo`) | 7 | Lizeth | Resultado por día (✅ / ⚪ / ❌), totales por canal solo de días que coinciden, "% verificado por terceros", "¿Cómo funciona?"; control "Simular alteración" que cambia un día a ❌ |

## Documentación: quién escribe qué

`docs/semana3/Documentacion.md` lo crea André con los encabezados. Cada persona edita **solo su parte**, para evitar conflictos:

| Sección | Extensión | Quién |
|---|---|---|
| 1. Front construido → introducción, enlace, cómo verlo en el celular, arquitectura y por qué es app móvil que corre en web | 400–2000 palabras en total | André |
| 1. Front construido → subsección "Pantallas del dueño: día a día" (pantallas 3 a 7) y "Página del verificador" (10) | | Lizeth |
| 1. Front construido → subsección "Pantallas de configuración e historial" (1, 2, 8 y 9) | | Santiago |
| 2. Decisión técnica (opción A) | 200–500 palabras | André |
| 3. Participación del equipo | Breve | Cada uno escribe su propia línea: usuario de GitHub y aporte |
| 4. Bloqueos y siguiente paso | Breve | André |

El `README.md` lo escribe Santiago.

## Lista de verificación final (la corre André)

- [ ] `frontend/` corre con `npx expo start --web` y en Expo Go.
- [ ] El enlace de Vercel abre la bienvenida, "Hoy" y `/verificar/demo`.
- [ ] El flujo completo funciona: registrar venta → "Hoy" → cerrar → confirmar y sellar → compartir → verificar.
- [ ] `Documentacion.md` tiene las cuatro secciones, en orden y dentro de los rangos de palabras.
- [ ] La decisión técnica dice "Opción A" y por qué.
- [ ] El README solo tiene requisitos, instalación, cómo correrlo y el árbol.
- [ ] Los tres tienen al menos un commit esta semana: `git log --since="2026-10-05" --format="%an" | sort -u`.
- [ ] Repo subido a Apex, con el enlace de Vercel en el campo **Website**.
