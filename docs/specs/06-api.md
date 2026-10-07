# Spec 06 — API de `bimo-core`

**Estado:** v1.0 · **Depende de:** specs 01 a 05, spec 07 · **Lo usan:** app iOS, web de verificación, `bimo-core`

Contrato HTTP entre la app, la web de verificación y `bimo-core`. La primera tarea de `bimo-core` es generar `core/openapi.yaml` a partir de este spec; desde entonces ese archivo y este spec deben coincidir.

---

## 1. Convenciones

| Tema | Regla |
|---|---|
| Base | `https://api.<dominio>/v1` · solo HTTPS · JSON UTF-8 |
| Nombres | `snake_case` en JSON; rutas en minúscula con guiones |
| Fechas | Instantes en ISO-8601 UTC con milisegundos (`2026-10-06T20:30:00.000Z`). Días de negocio como `AAAA-MM-DD` en rutas y JSON, salvo donde el spec 02 usa `AAAAMMDD` numérico |
| Dinero | Enteros en unidades mínimas (spec 01 §1) |
| Binarios | Base64 estándar (claves, firmas, XDR) o hex (hashes, sales), según indique cada campo |
| Versionado | Dentro de `/v1` solo se hacen cambios **aditivos**: campos nuevos opcionales y endpoints nuevos. Los clientes ignoran los campos que no conocen |
| Paginación | Por cursor: `cursor` y `limit` en la petición; `next_cursor` y `has_more` en la respuesta |

### 1.1 Errores

```json
{ "error": { "code": "missing_entries", "message": "Texto para desarrolladores", "details": { } } }
```

| HTTP | `code` |
|---|---|
| 400 | `invalid_request` (falló la validación del esquema) |
| 401 | `unauthenticated` |
| 403 | `forbidden`, `device_revoked`, `role_not_allowed` |
| 404 | `not_found` |
| 409 | `missing_entries`, `day_not_closable`, `signature_expired`, `request_superseded`, `already_exists` |
| 410 | `link_inactive` |
| 422 | `invalid_signature`, `invalid_challenge` |
| 429 | `rate_limited` (con encabezado `Retry-After`) |
| 503 | `chain_unavailable` (Stellar, el RPC o el relayer no responden; el cliente reintenta) |

Los rechazos de validación de asientos **no** son errores HTTP: van ítem por ítem dentro de la respuesta del push (spec 04 §5.2).

---

## 2. Autenticación

**Decisión para el incremento 1:** Supabase Auth con **código de un solo uso por correo**. Es gratuito; el OTP por SMS cuesta y se agrega en el incremento 2 sin cambiar el resto (la arquitectura menciona OTP al celular como objetivo).

| Capa | Mecanismo |
|---|---|
| Usuario | `Authorization: Bearer <JWT de Supabase>`. `bimo-core` lo valida con las llaves públicas de Supabase |
| Dispositivo | `X-Device-Id: <ULID>` en toda petición autenticada, salvo las de registro. El dispositivo debe pertenecer al comercio del usuario y no estar revocado |
| Reloj | `X-Device-Time: <ISO-8601>` en toda petición del celular (spec 04 §7) |
| Valor o sello | Firma del Secure Enclave sobre la preimagen (spec 03 §5), no un token |
| Público | `Authorization: Bearer <token del enlace>` (spec 05) |

### 2.1 Roles

| Endpoint | Dueño | Empleado (inc. 2) |
|---|---|---|
| Push y pull | Sí | Sí (solo asientos `venta` y `abono_cliente`) |
| Cerrar día, firmar sellos | Sí | No |
| Enlaces de verificación | Sí | No |
| Borrar cuenta | Sí | No |

---

## 3. Endpoints

### 3.1 Comercio y dispositivo (CU-01)

| Método y ruta | Cuerpo | Respuesta | Notas |
|---|---|---|---|
| `POST /merchants` | `{ business_name, owner_name?, city? }` | `201 { merchant_id }` | Usuario sin comercio. Crea `merchants`, `merchant_profiles`, `merchant_members` (dueño) y las cuentas del ledger en una transacción |
| `POST /devices/challenge` | `{}` | `{ challenge_id, challenge (base64, 32 bytes), expires_at }` | Vence en 5 min, un solo uso |
| `POST /devices` | `{ device_id, challenge_id, public_key (base64, 65 bytes), key_kind, signature (base64, 64 bytes) }` | `201 { device_id, account_status }` | `signature` es la firma P-256 del Secure Enclave sobre el `challenge` (con el SHA-256 que aplica CryptoKit). Si es el primer dispositivo, encola el despliegue de `bimo-account` |
| `GET /merchants/me` | — | `{ merchant_id, business_name, stellar_address, account_status, network, role }` | `account_status`: `pending` · `deploying` · `ready` · `failed` |
| `DELETE /merchants/me` | `{ challenge_id, signature }` | `202` | Borrado de ADR-16. Exige firma del dispositivo sobre un reto, para que no baste el correo |

`network` trae el contenido de `contracts/deployments/<red>.json` (spec 03 §9).

### 3.2 Sincronización (spec 04)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /sync/push` | Spec 04 §5.1 (máximo 200 ítems) | `{ results: [ { type, id, result, code?, business_date?, day_status? } ], clock_skew_ms }` |
| `GET /sync/pull?cursor=&limit=` | — | `{ changes: [ { seq, entity, data } ], next_cursor, has_more }` |

En el pull, `data` trae la entidad completa: el asiento con sus líneas, el cliente, `{ business_date, status, counted_cash_minor }` para un día o `{ business_date, version, status, tx_hash? }` para un sello. Un sello en `preparado` incluye `signing_request_id` para que la app pida la preimagen.

### 3.3 Días y cierre

| Método y ruta | Cuerpo | Respuesta | Errores |
|---|---|---|---|
| `POST /days/{date}/close` | `{ counted_cash_minor, entry_ids: [..] }` | `200 { status, signing_request_id? }` | `409 missing_entries` con `details.entry_ids`; `409 day_not_closable` si el estado no lo permite (spec 07) |
| `GET /days?from=&to=` | — | `{ days: [ { date, status, entry_count, seal_version, tx_hash? } ] }` | |

El cierre solo registra el estado y el efectivo contado. El asiento `ajuste_caja`, si hace falta, ya llegó por el push.

### 3.4 Firma de sellos (spec 03 §5)

| Método y ruta | Cuerpo | Respuesta | Errores |
|---|---|---|---|
| `GET /signing/pending` | — | `{ request: null }` o `{ request: { signing_request_id, preimage_xdr, items: [ { date, entry_count, is_amend } ], expiration_ledger, expires_at } }` | |
| `POST /signing/{id}/signature` | `{ signature (base64, 64 bytes) }` | `202 { status: "firmado" }` | `409 signature_expired` (la app vuelve a pedir `pending`); `409 request_superseded` (entró un asiento nuevo y se rehízo; spec 07); `422 invalid_signature` |

Solo hay **una** solicitud de firma vigente por comercio. Agrupa todos los días pendientes (lotes de 14; spec 03 §5.5).

### 3.5 Enlaces de verificación (spec 05)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /verification-links` | `{ date_from, date_to, expires_in_days: 7 \| 30 \| 90 }` | `201 { id, url, expires_at }` (la `url` con el token solo se devuelve aquí) |
| `GET /verification-links` | — | `{ links: [ { id, date_from, date_to, expires_at, revoked_at, view_count, status } ] }` |
| `DELETE /verification-links/{id}` | — | `204` |

### 3.6 Públicos (sin sesión de usuario)

| Método y ruta | Autenticación | Respuesta |
|---|---|---|
| `GET /public/verification?from=&to=` | Token del enlace | Paquete del spec 05 §3 |
| `POST /public/verification/restore` | Token del enlace | `{ date }` → `202`. Encola la restauración de los datos archivados de ese día |
| `GET /public/entry-proof?entry_id=` | Token del enlace | Reservado para el incremento 2 (spec 05 §7); hoy responde `404` |
| `GET /health` | Ninguna | `{ status, db, rpc, relayer }` |

### 3.7 Simuladores (solo en entornos que no son producción)

Existen si `BIMO_SIMULATORS=on` (spec 08). Producen los mismos eventos que el socio y el PSP reales y entran por el `inbox` (ADR-12), así que generan asientos `verificado` de verdad. Sirven para la demo del bootcamp.

| Método y ruta | Cuerpo | Efecto |
|---|---|---|
| `POST /dev/simulate/breb-incoming` | `{ amount_minor, occurred_at? }` | Asiento `venta` verificado: D cuenta_socio (breb) / H ventas |
| `POST /dev/simulate/card-sale` | `{ amount_minor }` | Asiento `venta` verificado: D por_cobrar_psp (tap_to_pay) / H ventas. Simula Tap to Pay |
| `POST /dev/simulate/psp-settlement` | `{ sale_entry_ids, fee_bps }` | Asiento `liquidacion_psp` verificado |

Requieren sesión del dueño; actúan sobre su propio comercio.

### 3.8 Webhooks (incremento 2)

`POST /webhooks/{source}` con `source` en `custodia`, `psp` o `rail`. Validan la firma del emisor, guardan en `inbox_events` y responden `200` de inmediato; el procesamiento es asíncrono. En el incremento 1 solo los usan los simuladores internamente.

---

## 4. Límites

| Alcance | Límite |
|---|---|
| Por dispositivo | 120 peticiones por minuto (el push agrupa) |
| Push | 200 ítems y 1 MB por petición |
| Pull | 500 cambios por página |
| Por token de verificación | 60 peticiones por minuto |
| `POST /devices/challenge` | 10 por hora por usuario |

---

## 5. Observabilidad

- Toda respuesta lleva `X-Request-Id`. Los logs son JSON e incluyen `request_id`, `merchant_id` y `device_id`; **nunca** montos, notas, tokens, firmas ni datos personales.
- Métricas mínimas: latencia por endpoint, ítems del push por resultado, sellos por estado, edad del sello pendiente más viejo, saldo de XLM del relayer y del plan B.

---

## 6. Criterios de aceptación

- [ ] `core/openapi.yaml` describe exactamente los endpoints, cuerpos, respuestas y errores de este spec, y pasa un validador de OpenAPI 3.1.
- [ ] Una petición sin `X-Device-Id`, con un dispositivo de otro comercio o con un dispositivo revocado responde `403`.
- [ ] Un empleado (inc. 2) que intenta cerrar un día recibe `403 role_not_allowed`.
- [ ] `POST /devices` con una firma que no corresponde a la clave responde `422 invalid_signature` y no despliega nada.
- [ ] Un reto usado dos veces responde `422 invalid_challenge`.
- [ ] Con `BIMO_SIMULATORS=off`, las rutas `/dev/*` responden `404`.
- [ ] Ningún log de una sesión completa de prueba contiene montos, tokens, firmas ni nombres.
- [ ] Si Stellar no responde, los endpoints que no dependen de la red (push, pull, cierre) siguen funcionando, y los que sí dependen responden `503 chain_unavailable`.
