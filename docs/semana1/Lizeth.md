# ArtTrace — NFT en Stellar para trazabilidad y autenticidad de obras de arte

## Resumen

Plataforma sobre **Stellar (Soroban)** que emite un NFT "certificado" por cada obra física o digital de un artista. El NFT actúa como pasaporte de la obra: registra su creación, cada transferencia de propiedad (compra/venta) y permite verificar en cualquier momento su autenticidad y cadena de custodia. Stellar aporta fees casi nulos, confirmación en segundos y una red de *anchors* que facilita el on/off-ramp entre pesos colombianos (u otras monedas) y cripto — clave para artistas y compradores que no son cripto-nativos.

## Problema

- Falsificación y falta de procedencia verificable en el mercado del arte, especialmente para artistas emergentes.
- Compradores no tienen forma fácil de comprobar que una pieza es original o de rastrear quién la ha poseído antes.
- Artistas pierden trazabilidad de sus propias obras una vez salen de su estudio (reventas, préstamos, exhibiciones).

## Propuesta de valor

- **Para artistas:** certificado digital inmutable de cada obra, con posibilidad de recibir regalías (royalties) en reventas.
- **Para coleccionistas/compradores:** historial completo de propiedad y verificación de autenticidad en segundos, escaneando un código (QR/NFC) vinculado al NFT.
- **Para casas de subasta/galerías:** herramienta de due diligence rápida antes de intermediar una venta.

## Cómo funciona (flujo básico)

1. **Registro de la obra:** el artista crea un perfil verificado y sube evidencia de la obra (fotos, video, certificado físico, hash de archivo si es digital).
2. **Minteo del NFT:** se acuña un NFT que representa la obra, con metadata: artista, título, año, técnica, medidas, foto de alta resolución, hash del certificado físico (si aplica).
3. **Vinculación física-digital:** para obras físicas, se adhiere un tag NFC o QR único (a prueba de manipulación) que enlaza la pieza con su NFT.
4. **Transferencia de propiedad:** cada compra/venta se registra on-chain como transferencia del NFT, quedando en el historial público.
5. **Verificación:** cualquier persona puede escanear el tag o buscar el NFT y ver: artista original, historial de dueños, fechas de transacción, y si el NFT sigue vinculado a la obra (no reportado como robado/perdido).
6. **Regalías automáticas (opcional):** contrato inteligente que asigna un % al artista en cada reventa.

## Componentes técnicos (Stellar)

| Componente | Descripción |
|---|---|
| Smart contract (Soroban) | Contrato NFT no-fungible sobre Soroban (siguiendo el patrón de token NFT de Soroban, análogo a ERC-721) con lógica de royalties en cada transferencia |
| Metadata storage | IPFS/Arweave para imágenes y certificados; solo el hash IPFS y datos clave se guardan en el contrato para minimizar costo de storage |
| Identidad del artista | Cuenta Stellar del artista + opcionalmente verificación vía Stellar's *Soroban Domains* o un registro propio de artistas verificados |
| Vinculación física | Tag NFC/QR resistente a manipulación, con ID único enlazado al `token_id` del contrato |
| App/web de verificación | Escanear tag → consulta al contrato (via RPC de Soroban) → muestra historial de dueños y estado de autenticidad |
| Wallets | Integración con Freighter, Lobstr u otras wallets Stellar; opción de wallet custodiada (via Passkeys/smart wallet) para onboarding sin fricción |
| On/off-ramp | *Anchors* de Stellar (o integraciones locales) para que artistas y compradores compren/vendan con COP sin manejar cripto directamente |
| Panel del artista | Registrar obras, ver ventas, configurar % de regalías |
| Marketplace (opcional) | Módulo de compra/venta directa artista–coleccionista, liquidado en Stellar (posible uso de USDC o un asset local vía Stellar) |

## Posibles retos

- **Vínculo físico-digital confiable:** un NFT no impide falsificar la obra física; el tag debe ser difícil de clonar o transferir a otra pieza.
- **Adopción de artistas y compradores** poco familiarizados con cripto — necesita UX simple, posiblemente con wallets custodiadas u onboarding sin fricción (login social, fiat on-ramp).
- **Costos de gas** — en Stellar/Soroban las fees son mínimas, así que no es un problema mayor, pero conviene diseñar el contrato para minimizar operaciones de storage (que son el costo más alto en Soroban).
- **Validación inicial de autenticidad** — quién certifica que la primera minteada es legítima (el propio artista, una galería aliada, un perito).
- **Maduración del ecosistema NFT en Stellar** — Soroban es más joven que EVM/Solana en tooling NFT; hay que validar librerías/estándares disponibles (o construir el estándar propio) antes de comprometerse.

## Posible modelo de negocio

- Comisión por minteo de cada obra.
- % de comisión en reventas dentro del marketplace propio.
- Suscripción para galerías/casas de subasta que quieran usar el panel de verificación en volumen.

## Siguientes pasos sugeridos

- [ ] Revisar estándares/librerías de NFT existentes en Soroban (o definir el propio) antes de escribir el contrato.
- [ ] Prototipo del flujo de minteo + verificación con 1–2 artistas piloto, usando Soroban testnet.
- [ ] Validar proveedor de tags NFC/QR anti-manipulación.
- [ ] Diseñar UX de onboarding sin fricción para artistas no cripto-nativos.
