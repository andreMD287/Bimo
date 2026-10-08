# Specs de Bimo — índice

Diseño detallado del incremento 1 y de la base del producto completo. La arquitectura (el *qué* y el *por qué*) está en `docs/arquitectura/ARQUITECTURA.md`; estos specs dicen **exactamente cómo**. Si la arquitectura y un spec no coinciden en un detalle, **manda el spec**. Antes de escribir código, lee `CLAUDE.md` en la raíz.

## Orden de lectura

| # | Spec | Versión | De qué trata |
|---|---|---|---|
| 01 | [Modelo de datos](01-modelo-de-datos.md) | 1.3 | Tablas, enums, reglas de la base de datos, borrado |
| 02 | [Formato canónico y Merkle](02-formato-canonico-y-merkle.md) | 1.1 | Bytes exactos de cada asiento, árbol y raíz. Con [vectores](02-vectores.json), [referencia](02-referencia.mjs) y [chequeo](02-check.mjs) |
| 03 | [Contratos Soroban y flujo de firma](03-contratos-soroban.md) | 1.3 | Verificador P-256, smart account, `bimo-registry`, cómo se firma y envía |
| 04 | [Sincronización offline](04-sincronizacion.md) | 1.2 | Base local, reglas V-01..V-11, push, pull, cierre, reloj, "Hoy" |
| 05 | [Enlace de verificación](05-enlace-de-verificacion.md) | 1.0 | Qué ve el verificador y cómo comprueba sin confiar en nadie |
| 06 | [API](06-api.md) | 1.0 | Endpoints, autenticación, errores, simuladores |
| 07 | [Máquinas de estado](07-maquinas-de-estado.md) | 1.0 | Día, solicitud de firma, sello, cuenta |
| 08 | [Repo, stack, pruebas y plan](08-repo-stack-pruebas-y-plan.md) | 1.2 | Estructura, dependencias, entornos, cómo probar sin Mac, CI, tareas T01–T16, lo diferido después de la demo y guion de la demo |

## Cómo se cambia un spec

1. Se propone el cambio en un PR que edita el spec y sube su versión (el historial va en la línea **Estado**).
2. Solo se permiten cambios **aditivos** sobre lo ya implementado (tablas, columnas nulas, valores de enum, códigos nuevos, endpoints nuevos). Un cambio que rompe algo exige una versión mayor y un plan de migración.
3. El spec 02 nunca cambia sus bytes; solo puede agregar códigos al final de sus tablas.
4. Después se cambia el código.

## Decisiones tomadas en el diseño detallado

Además de los ADR de la arquitectura:

| Decisión | Dónde |
|---|---|
| El día de negocio es el día calendario en Bogotá (decisión del equipo) | ADR-14, spec 01 §7 |
| `bimo-registry` es inmutable; borrado criptográfico para Habeas Data | ADR-15, ADR-16 |
| Dinero en enteros (centavos COP, 10⁻⁷ USDC) | Spec 01 §1 |
| Codificación binaria propia + árbol RFC 9162, con sal por asiento | Spec 02 |
| App en React Native con Expo, porque el desarrollo principal se hace en Windows sin Mac | ADR-03, spec 08 §3.0 |
| Incremento 1 con llave P-256 de software protegida con Face ID y un verificador propio; Secure Enclave o passkeys en el incremento 2 | ADR-04, spec 03 §2 y §6 |
| `bimo-core` normaliza las firmas a low-S (Soroban lo exige; el Secure Enclave del incremento 2 no lo hace) | Spec 03 §2 |
| La app nunca firma un hash que le manden hecho | Spec 03 §5 |
| `expo-sqlite` como base local; formato canónico y reglas V-01..V-11 una sola vez en el paquete `shared` | Spec 04 §2, spec 08 §1 |
| Ninguna venta se rechaza por la hora; el reloj se mide en cada petición | Spec 04 §7 |
| Salidas de plata (gastos y retiros del dueño) para que la caja cuadre al cerrar; amplía la tabla de cuentas del ADR-05 | Spec 01 v1.3, spec 04 §4.1 |
| Inicio de sesión con código por correo en el incremento 1 (el SMS cuesta; llega en el incremento 2) | Spec 06 §2 |
| Los totales que ve un verificador los calcula su navegador, nunca el servidor | Spec 05 §1 |
| Las solicitudes de firma se crean con el dueño presente; no hay "reabrir" un día | Spec 07 |
| Stack: Fastify + Kysely + Zod en `core`, cola en Postgres, Vite + React en la web | Spec 08 §2 |

## Recorrido de cada caso de uso por los specs

Sirve para comprobar que nada queda sin dueño (paso de revisión cruzada).

| Caso de uso | Recorrido |
|---|---|
| CU-01 Abrir cuenta | Código por correo (06 §2) → `POST /merchants` (06 §3.1; crea cuentas del ledger, 01 §4.2) → llave P-256 en el Keychain con Face ID (03 §6) → reto y `POST /devices` (06 §3.1) → despliegue de `bimo-account` (03 §3, 07 §4) → la app comprueba su firmante en RPC (03 §6) |
| CU-02 Registrar venta | Validación V-01..V-11 (04 §4) → transacción local (04 §2) → push (04 §5, 06 §3.2) → triggers DB-02..DB-11 y sal (01 §5, 02 §4) |
| CU-03 Ver "Hoy" | Cálculos locales (04 §9) sobre las cuentas del ledger (01 §4.2) |
| CU-04 Cerrar y sellar | Conteo y `ajuste_caja` (04 §6) → `POST /days/{date}/close` (06 §3.3, 07 D-3) → pull completo (04 §6) → solicitud de firma (07 S-1, 02 §4–6) → validación de la preimagen y Face ID (03 §5.2–5.3) → firma (06 §3.4, 07 S-2) → envío y confirmación (03 §7, 07 L-2..L-4) → `sellado` (07 D-5) |
| CU-05 Verificar | Crear enlace (05 §2, 06 §3.5) → paquete (05 §3, 06 §3.6) → lectura directa de Stellar y recálculo (05 §4, 02 §8) → resultado y totales (05 §4.1–4.2) |

## Glosario

| Término | Significado |
|---|---|
| Asiento | Un movimiento del ledger (una venta, un abono, una salida…), con sus líneas de debe y haber. Nunca se edita |
| Reverso | Asiento espejo que anula otro. Es la única forma de corregir |
| Sello | Raíz Merkle de todos los asientos de un día, guardada en `bimo-registry` con la firma del dueño y la del atestador |
| Enmienda | Nueva versión del sello de un día, cuando llegan asientos después del cierre |
| Sal | 32 bytes aleatorios por asiento que impiden adivinar montos a partir de los hashes |
| Atestador | Cuenta de Bimo que co-firma cada sello y certifica qué asientos llegaron de fuentes verificadas |
| Smart account | Cuenta del comercio en Stellar, que es un contrato. Solo la mueve la llave de su iPhone |
| Preimagen | Los datos exactos de la autorización que el dueño firma; la app los valida antes de pedir Face ID |
| Solicitud de firma | Grupo de días pendientes que se confirman con un solo Face ID |
| Origen | `declarado` (lo registró el dueño), `verificado` (llegó de un socio o PSP), `on_chain` (ocurrió en Stellar) |
| Development build | Versión propia de la app con sus módulos nativos (por ejemplo Face ID sobre la llave), compilada una vez en un Mac; después se desarrolla desde Windows con recarga en vivo |
