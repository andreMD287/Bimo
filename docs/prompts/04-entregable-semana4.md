# Entregable 4 — Contexto común del equipo (MVP funcional)

> **Este archivo no se ejecuta solo.** Cada integrante corre su propio prompt, que empieza leyendo este:
> - André: `docs/prompts/04a-andre.md`
> - Lizeth: `docs/prompts/04b-lizeth.md`
> - Santiago: `docs/prompts/04c-santiago.md`
>
> Orden: **André primero** (en ~1 hora deja decidido el recorte, la documentación creada y las interfaces de los hooks congeladas, y avisa por el grupo). Después los tres trabajan en paralelo.

---

## Qué pide el entregable

Lo que declaramos en el Entregable 3 (**Opción A, contrato propio**), ya implementado e incorporado en el front:

1. **Contratos inteligentes escritos, desplegados en testnet y conectados al front.** Enlace público al explorador en la documentación (contratos y transacciones). Es obligatorio.
2. **El resto del back** que haga falta para que el producto sea funcional.
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

## Estado de partida (17 de octubre)

El repo tiene `frontend/` (10 pantallas con datos de ejemplo, publicado en Vercel), `docs/` (specs, arquitectura, semanas 1 a 3) y los prompts. **No existen todavía**: `contracts/`, `core/`, `shared/`, `supabase/`, `verifier/` ni CI. Quedan dos días, así que el entregable se corta a una **rebanada vertical** que funcione de verdad en vez de intentar todo el plan T01–T16.

## La rebanada vertical (el recorte)

La demo real es esta cadena:

**Hoy → Cerrar el día → Confirmar y sellar (transacción real en testnet) → "Sellado ✓ · Ver en el explorador" → Compartir → el verificador lee `bimo-registry` en testnet, recalcula la raíz con las ventas y muestra ✅; si se altera un monto, muestra ❌ de verdad.**

| Pieza | Entra | Se queda fuera (queda como pendiente documentado) |
|---|---|---|
| Contratos | `bimo-registry` (spec 03 §4, sin cambios de lógica) desplegado en testnet | `bimo-account` (smart account de OpenZeppelin); relayer |
| Firma del comercio | El comercio es una **cuenta Stellar normal (G, ed25519)** con llave en el dispositivo, financiada con Friendbot. El registry exige `merchant.require_auth()` y funciona igual con una cuenta G | Llave P-256, Face ID real y Keychain; `bimo-p256-verifier` solo si sobra tiempo |
| Atestador | Cuenta G de Bimo; co-firma desde el backend | KMS; multifirma 2 de 3 del admin (en testnet, el admin es una sola cuenta) |
| Backend (`core/`) | Un subconjunto mínimo del spec 06: registrar comercio, subir ventas, preparar y enviar el sello, crear enlace, API pública de verificación | Sincronización completa, indexador, workers, simuladores |
| Datos | Supabase (nube) con las tablas mínimas del spec 01 | Triggers y vistas que no se necesiten |
| Verificación | Recalcular la raíz con `shared` y compararla con `bimo-registry.get(...)` | Restauración de TTL |
| App | La misma `frontend/`, en **web (Vercel)** y, si el SDK de Stellar lo permite, en Expo Go | Development build, Tap to Pay |

**El recorte cambia los specs 03, 06 y 08.** Primero se actualizan los specs (commit `docs(specs): …` aprobado por André) y después el código, como manda `CLAUDE.md`.

### Niveles: qué se salva si el tiempo aprieta

André revisa el avance **el domingo a las 8:00 p. m.** y decide qué nivel se entrega.

- **Nivel 1, mínimo no negociable:** `bimo-registry` escrito, con pruebas, desplegado en testnet, con `contracts/deployments/testnet.json` y al menos una transacción de `seal` visible en el explorador. "Confirmar y sellar" del front envía un sello real y muestra el enlace. Video público, `MVPFunctional.md` completo y los tres con commit.
- **Nivel 2, objetivo:** backend con datos persistidos, el verificador recalcula la raíz de verdad (✅ / ❌ reales) y el CLI `verify.mjs` funciona.
- **Nivel 3, solo si sobra:** `bimo-p256-verifier` desplegado, qué más.

Todo lo que no entre queda en "Riesgos y pendientes", dicho con honestidad. Lo que declaramos en el Entregable 3 (smart account y relayer de OpenZeppelin) cambia con este recorte, y eso también se documenta en "Aprendizajes y ajustes".

## Reglas para todos

1. Lee `CLAUDE.md`, este archivo y los specs que cite tu prompt antes de tocar código.
2. Los specs son la fuente de verdad. **No inventes** tablas, endpoints, estados, funciones de contrato ni formatos. Si falta algo, detente y propón el cambio exacto al spec a André.
3. **Cada quien toca solo sus archivos** (tabla de abajo). Si necesitas cambiar un archivo de otra persona, pídeselo por el grupo.
4. **Las pantallas solo hablan con `src/hooks/`.** Nunca importan `src/mocks/`, `src/api/` ni `src/signer/` directamente.
5. **Nada de secretos en el repo.** Llaves de testnet en `.env` (en `.gitignore`) y un `.env.example` solo con los nombres. Los secretos del servidor (atestador) van solo en las variables del servicio. Nadie le pide sus llaves a otra persona.
6. Dinero en enteros en centavos. Día de negocio en Bogotá. Nada de montos ni datos personales dentro de la cadena: solo raíces, conteos y banderas (QA-06).
7. Español de Colombia y **sin jerga** en la app del dueño: nunca "wallet", "token", "XLM", "blockchain" ni "hash". El enlace al explorador sí puede decir "Ver en el explorador de Stellar".
8. Cada persona trabaja en su rama `feat/semana4-<nombre>` y abre un PR a `main`. André revisa y fusiona. Vercel vuelve a publicar con cada fusión.
9. Commits en Conventional Commits, **desde tu propia cuenta de GitHub**. Nadie hace commits a nombre de otra persona.
10. Kanban (`CLAUDE.md` §8): las tareas de esta semana no mueven tarjetas por sí solas. Si una tarea cumple **todos** los criterios de un issue existente (por ejemplo A-04 para el registry), dilo y pregunta antes de llevarlo a Done.

## Dueños de archivos

| Dueño | Archivos |
|---|---|
| **André** | `contracts/`, `core/`, `supabase/`, `frontend/src/hooks/`, `frontend/src/api/`, `frontend/src/signer/`, `frontend/src/mocks/`, `frontend/src/lib/`, `frontend/app/_layout.tsx`, `frontend/vercel.json`, `docs/specs/`, `contracts/deployments/`, y en la documentación: las secciones de aprendizajes, riesgos y la evidencia de contratos y producto |
| **Lizeth** | `frontend/src/ui/`; `frontend/app/(comercio)/` → `hoy.tsx`, `venta.tsx`, `movimientos.tsx`, `cierre.tsx`, `sellar.tsx`; `frontend/app/verificar/[token].tsx`; en la documentación: plan de validación, el enlace del video y su línea de participación |
| **Santiago** | `shared/`, `verifier/`, `.github/workflows/`, `README.md`, `.env.example` de la raíz; `frontend/app/index.tsx`, `canales.tsx`, `(comercio)/historial.tsx`, `(comercio)/compartir.tsx`; en la documentación: "Cómo verificar tú mismo" y su línea de participación |

## Interfaz entre las piezas

- **Hooks (contrato con el front).** André los congela en la Fase 0: mismos nombres, tipos nuevos y modo de funcionamiento marcado con `EXPO_PUBLIC_MODO=demo|testnet`. En `demo` todo sigue simulado (como hoy) y es el respaldo que nunca se rompe; en `testnet` los hooks de sello y verificación hablan con la red. Lizeth y Santiago programan contra los tipos; no esperan al backend.
- **`shared/` (contrato con el backend y el verificador).** Exporta, tal como el spec 02, el formato canónico, las hojas y la raíz Merkle. Nadie más reimplementa eso.
- **`contracts/deployments/testnet.json`** (spec 03 §9) es lo único que el front, el backend y el CLI necesitan saber de la red.

## Calendario (hora Colombia)

| Cuándo | Qué |
|---|---|
| **Sáb 17, noche** | André: Fase 0 completa (recorte aprobado, documento creado, hooks congelados) y avisa. Santiago: `shared` con la raíz Merkle pasando los vectores. Lizeth: guion del video y el plan de validación |
| **Dom 18, mediodía** | **Hito 1:** `bimo-registry` en testnet con una transacción de `seal` en el explorador (André) |
| **Dom 18, 8:00 p. m.** | PRs de los tres listos. André decide el nivel (1 o 2) |
| **Lun 19, mañana** | Integración, publicación en Vercel y ensayo del flujo completo de punta a punta |
| **Lun 19, 2:00 p. m.** | Grabación del video; subida a YouTube |
| **Lun 19, 5:00 p. m.** | `MVPFunctional.md` terminado y verificado con la lista de abajo |
| **Lun 19, 8:00 p. m.** | **Subida a Apex.** Margen hasta las 11:00 p. m. |

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

Enlaces del explorador de testnet (formato): `https://stellar.expert/explorer/testnet/contract/<ID>` y `https://stellar.expert/explorer/testnet/tx/<hash>`. Cualquier persona debe poder abrirlos sin iniciar sesión.

## Lista de verificación final (la corre André)

- [ ] `contracts/registry` compila y `cargo test` pasa.
- [ ] `contracts/deployments/testnet.json` tiene el ID del registry, y ese ID abre en el explorador.
- [ ] Hay al menos una transacción de `seal` en el explorador, enlazada en la documentación.
- [ ] En el enlace de Vercel, "Confirmar y sellar" en modo `testnet` envía un sello real y muestra el enlace al explorador.
- [ ] El verificador (`/verificar/demo`) lee la cadena; si el nivel es 2, recalcula y el ❌ por alteración es real.
- [ ] El video dura 3:00 o menos, es público y abre sin sesión. El enlace está en la documentación.
- [ ] `MVPFunctional.md` tiene las tres secciones en orden y dentro de los rangos de palabras, y la evidencia.
- [ ] Los tres tienen al menos un commit esta semana: `git log --since="2026-10-12" --format="%an <%ae>" | sort -u`.
- [ ] No hay secretos en el repo: `git log -p | grep -i "secret\|SA[A-Z0-9]\{50,\}"` sin resultados.
- [ ] Proyecto registrado en Apex, con el enlace de Vercel en **Website**, antes de las 11:00 p. m. del lunes.
