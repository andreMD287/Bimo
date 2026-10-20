# Prueba de usabilidad — QA-04

**Issue:** L-11 (#46) · **Responsable:** Lizeth Rico (`ricoththth`) · **Specs:** spec 08 §4 y §4.1, ARQUITECTURA QA-04

## 1. Qué queremos comprobar

QA-04 (ARQUITECTURA): un dueño de negocio sin conocimientos técnicos registra una venta en efectivo en hora pico, con una mano ocupada, en **≤ 3 toques y ≤ 5 s**, y **ninguna pantalla** le muestra "wallet", "token", "XLM", "blockchain" ni "hash". La meta del spec 08 §4.1 es medirlo con **5 comercios reales**.

Además aprovechamos la sesión para observar el resto del flujo del Blueprint: ver "Hoy", cerrar el día, confirmar y sellar, y compartir el historial.

## 2. Cómo se cuentan los toques y el tiempo

- **Toques:** se cuentan los toques fuera del teclado de monto, desde la pantalla "Hoy" hasta ver "Venta guardada". Las teclas del monto no cuentan, porque dependen del valor (no es lo mismo $ 2.000 que $ 125.500). En el flujo diseñado, una venta en efectivo son **2 toques**: "Registrar venta" y "Guardar venta", porque efectivo ya viene elegido.
- **Tiempo:** desde que la persona toca "Registrar venta" hasta que aparece "Venta guardada". Se mide con el cronómetro del celular de quien observa, o en la grabación de pantalla si la persona acepta grabar.
- **Error:** cualquier toque que no lleva a la meta (canal equivocado, tecla de más que tiene que borrar, volver atrás, quedarse buscando más de 5 s).
- **Ayuda:** cada vez que la persona pregunta o el observador tiene que intervenir.

## 3. A quién y cómo

- **Participantes:** 5 dueños de negocios pequeños de Bogotá que cobren por al menos dos canales (efectivo y Bre-B, Nequi o datáfono): tiendas de barrio, una papelería o miscelánea, y salones de belleza o manicuristas independientes (las historias H7 y H8 salen de ese perfil). Sin conocimientos de cripto.
- **Dónde:** en su propio local, en una hora tranquila, para no afectar su venta.
- **Con qué:** la app en el celular del observador, con Expo Go o con el enlace de Vercel abierto en el navegador del celular. Datos de ejemplo de "Tienda Doña Marta", para que nadie tenga que poner datos reales de su negocio.
- **Duración:** 20 minutos por persona.
- **Consentimiento:** se explica que probamos la app, no a la persona; que no se guardan nombres, montos reales ni datos del negocio; y que puede parar cuando quiera. Solo se anota el tipo de negocio y los canales que usa.

## 4. Guion de la sesión

**Antes (2 min).** "Gracias por ayudarnos. Estamos probando una app para llevar las ventas de un negocio. No hay respuestas buenas ni malas: si algo no se entiende, es culpa de la app. Piense en voz alta: diga lo que busca y lo que espera que pase."

Preguntas de entrada:
1. ¿Por qué medios le pagan? (efectivo, Bre-B, Nequi, Daviplata, datáfono…)
2. ¿Cómo sabe hoy cuánto vendió en el día? ¿Cuánto tiempo le toma?
3. ¿Alguna vez un banco o un prestamista le ha pedido demostrar sus ventas? ¿Cómo lo hizo?

**Tareas (12 min).** Se lee cada tarea en voz alta y no se ayuda salvo que la persona lo pida.

| # | Tarea que se le lee | Qué medimos |
|---|---|---|
| T1 | "Un cliente le acaba de pagar $ 8.500 en efectivo. Regístrelo." (con la otra mano sosteniendo algo, por ejemplo una bolsa) | Toques, tiempo, errores. **Es la medida de QA-04** |
| T2 | "Ahora una clienta le paga $ 40.000: $ 20.000 en efectivo y el resto por Nequi. Regístrelo como una sola venta." | Toques, tiempo, si encuentra "dividir el pago" |
| T3 | "Dígame cuánto ha vendido hoy y cuánta plata le falta que le llegue del datáfono." | Si lo encuentra en "Hoy" sin ayuda y en cuánto tiempo |
| T4 | "Ya va a cerrar. Contó $ 412.000 en la caja. Cierre el día." | Si entiende la diferencia y la explicación, sin asustarse |
| T5 | "Confirme el cierre." (pantalla "Confirmar y sellar") | Si confirma sin ayuda |
| T6 | "Un banco le pide ver sus ventas del último mes. ¿Cómo se las mostraría?" | Si llega a "Compartir historial" y crea el enlace |

**Después (5 min).**
1. Con sus palabras: ¿qué significa que el día quedó "Sellado ✓"?
2. ¿Le mandaría ese enlace a un banco? ¿Por qué sí o por qué no?
3. ¿Hubo alguna palabra que no entendió?
4. Del 1 al 5, ¿qué tan fácil fue registrar una venta?
5. ¿La usaría en su negocio? ¿Qué le falta?

## 5. Formato de registro

Una fila por persona y por tarea. Se llena durante la sesión; las citas van textuales.

| Sesión | Fecha | Tipo de negocio | Canales que usa | Tarea | Completó sin ayuda (sí/no) | Toques | Tiempo (s) | Errores | Palabras que no entendió | Cita textual |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | | | | T1 | | | | | | |
| P1 | | | | T2 | | | | | | |
| … | | | | | | | | | | |

Respuestas a las preguntas de cierre:

| Sesión | ¿Qué es "Sellado ✓"? (resumen) | ¿Lo compartiría con un banco? | Facilidad (1–5) | ¿Lo usaría? / Qué le falta |
|---|---|---|---|---|
| P1 | | | | |

## 6. Criterios de éxito

| Hipótesis | Se cumple si |
|---|---|
| QA-04: una venta en efectivo toma ≤ 3 toques y ≤ 5 s | En T1, al menos 4 de 5 personas lo logran sin ayuda, y la mediana de tiempo es ≤ 5 s |
| No hay jerga | 0 pantallas con wallet, token, XLM, blockchain o hash (revisión del código y de las pantallas), y ninguna persona marca una palabra técnica como no entendida |
| Entiende el pago dividido | En T2, al menos 3 de 5 lo completan sin ayuda |
| "Hoy" responde lo que necesita | En T3, al menos 4 de 5 encuentran lo vendido y lo pendiente en ≤ 20 s |
| Entiende para qué sirve el sello | Al menos 3 de 5 explican "Sellado ✓" como "ya no se puede cambiar" o algo equivalente |
| Lo compartiría | Al menos 3 de 5 dicen que le mandarían el enlace a un banco |

## 7. Resultados

> **Estado: sesiones pendientes.** Al subir este documento todavía no se ha corrido ninguna sesión con comercios reales. Aquí solo se registra lo que de verdad se haga: si se alcanza a menos de 5 personas, se dice cuántas y se anota en "Riesgos y pendientes" de `docs/semana4/MVPFunctional.md`.

| Sesión | Fecha | Tipo de negocio | T1 toques | T1 tiempo (s) | T1 sin ayuda | Notas |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | Sin sesiones todavía |

### Revisión del texto de las pantallas (sin personas)

Esto sí se hizo y se puede repetir: una prueba automática (`frontend/test/ui.test.ts`, issue L-01) busca "wallet", "token", "XLM", "blockchain", "hash" y "firma digital" en los textos del sistema de diseño, y la revisión manual de las pantallas del dueño no encontró ninguna de esas palabras. En el flujo diseñado, la venta en efectivo son 2 toques fuera del teclado ("Registrar venta" y "Guardar venta"); el tiempo solo se puede medir con personas.

## 8. Hallazgos y recomendaciones

Se completa después de las sesiones. Cada hallazgo que pida un cambio se convierte en un issue nuevo (L-11 no incluye corregirlos).
