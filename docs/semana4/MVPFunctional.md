# MVP funcional — Entregable 4

## Aprendizajes y ajustes priorizados

1. **Probar todo junto antes de pulir por partes (impacto alto, esfuerzo bajo).** Las pruebas de cada módulo pasaban, pero al conectar la app con `core`, Supabase y Stellar aparecieron fallos que ninguna prueba aislada veía: el correo de Supabase no traía el código de 6 dígitos, `core` no enviaba CORS para la versión web, el navegador rechazaba `fetch` dentro del verificador («Illegal invocation») y un comercio nuevo no tenía canales para vender. Los cuatro se corrigieron el domingo. Ajuste: el recorrido de punta a punta (`frontend/scripts/smoke-local.mts`) se corre antes de cada entrega.
2. **Que el código calcule lo que firma (impacto alto, esfuerzo alto).** La app valida la preimagen y calcula el resumen por su cuenta; nunca firma uno ya hecho. Costó trabajo, pero así la prueba QA-02 (Bimo no puede sellar por un comercio) es real y se comprueba en la red.
3. **Las herramientas de Stellar cambian rápido (impacto medio).** El SDK y el CLI nuevos cambiaron tipos y credenciales. Se resolvió fijando versiones y dejando scripts que cualquiera puede repetir.

**Se ajusta antes del cierre:** publicar `core` en Railway y la base en Supabase en la nube, para que el enlace público trabaje con datos reales. **Queda pendiente:** la llave del comercio en el Secure Enclave del iPhone, el indexador de eventos y la multifirma del administrador.

## Riesgos y pendientes

- **El producto en línea es una demostración.** El enlace de Vercel muestra la app con datos de ejemplo. El flujo real (registro, ventas, cierre, sello y verificación) funciona, pero hoy corre en el computador de André con Supabase local; `core` aún no está en Railway y no hay proyecto de Supabase en la nube. Mientras no se publique, quien abra el enlace no puede registrarse de verdad.
- **Solo testnet.** Nada se ha probado en la red principal, ni su costo.
- **La llave del comercio vive en software.** En la web la firma P-256 usa una llave guardada en el navegador; en el celular debe pasar al Secure Enclave de iOS (incremento 2). «Confirmar con Face ID» en la web es una confirmación simulada.
- **Sin prueba en un celular real.** La verificación se hizo en el navegador, no en Expo Go ni en un development build.
- **Multifirma del administrador sin cerrar.** La cuenta admin del registro tiene una sola llave; falta pasarla a 2 de 3 con las llaves públicas de Santiago y Lizeth (ver `contratos-testnet.md`).
- **Indexador y eventos diferidos** (A-13, A-20). No hay panel que lea los eventos de la cadena; el verificador lee el contrato directo.
- **Dependencia del RPC público de testnet.** Si se cae, no se puede sellar ni verificar.
- **Partes del equipo.** Al escribir esto no están en `main` las entregas de Santiago (verificador web y CLI) ni de Lizeth (pantallas y validación). La página de verificación de la app es una versión mínima de André que cubre el recorrido.
- **Datos personales.** Las pruebas usan correos de ejemplo; antes de usuarios reales hay que definir retención y consentimiento.

## Plan de validación con usuarios

**A quiénes.** Al usuario del Problem Brief: el dueño de un negocio pequeño o informal que maneja él mismo la plata, sin contador, y que cobra por al menos dos canales. Vamos a buscar **5 comercios en Bogotá**: dos tiendas de barrio, una miscelánea o papelería, y dos salones de belleza o manicuristas independientes (de ahí salen las historias de pago dividido y anticipos). Los conseguimos por conocidos del equipo, porque ya sabemos que viven el problema. Ninguno debe saber de cripto.

**Con qué métodos.**
1. **Entrevista corta (5 min):** por qué medios le pagan, cómo sabe hoy cuánto vendió, cuánto tarda en cuadrar y si un banco le ha pedido demostrar sus ventas.
2. **Prueba con el producto (12 min), con tareas guiadas en su local:** registrar una venta en efectivo de $ 8.500 con una mano ocupada; una venta dividida entre efectivo y Nequi; decir cuánto vendió y cuánto le falta que llegue del datáfono; cerrar el día con un conteo que no cuadra; confirmar y sellar; y crear un enlace para un banco. Usamos la app en nuestro celular con datos de ejemplo, para que nadie ponga datos reales de su negocio.
3. **Métricas:** toques fuera del teclado y segundos por tarea (cronómetro o grabación de pantalla si la persona acepta), errores, veces que pide ayuda, palabras que no entendió y facilidad del 1 al 5. Al final le pedimos que explique con sus palabras qué significa "Sellado ✓".

El guion completo y la tabla de registro están en [`docs/usabilidad.md`](../usabilidad.md).

**Qué hipótesis.**
- H-A: un dueño registra una venta en efectivo en ≤ 3 toques y ≤ 5 s (QA-04).
- H-B: entiende "Hoy" sin explicación: encuentra lo vendido y lo pendiente de consignar.
- H-C: el cierre con diferencia no lo asusta y entiende qué hacer.
- H-D: entiende para qué sirve el sello ("ya nadie lo puede cambiar").
- H-E: le mandaría el enlace a un banco o prestamista. Esta es la que pone a prueba el supuesto 2 del Problem Brief: si a nadie le importa que el historial no se pueda alterar, una herramienta más simple bastaría.

**Con qué criterio sabremos que se cumplen.**
- H-A: 4 de 5 completan la venta en efectivo sin ayuda, con mediana ≤ 5 s y ≤ 3 toques.
- H-B: 4 de 5 responden en ≤ 20 s.
- H-C: 4 de 5 cierran el día sin pedir ayuda.
- H-D: 3 de 5 explican el sello como algo que no se puede cambiar.
- H-E: 3 de 5 dicen que sí lo compartirían. Si son 2 o menos, revisamos si el sello merece estar en el centro del producto o si es mejor presentarlo como un extra.
- Jerga: 0 palabras técnicas marcadas como no entendidas.

Registramos solo lo que de verdad pase. Si no alcanzamos a 5 personas, decimos con cuántas se hizo y lo dejamos en "Riesgos y pendientes".

## Evidencia verificable

### Producto en línea

Aplicación web: **https://bimo-frontend.vercel.app** (Vercel, se despliega desde `main`). Hoy muestra la app en modo demostración con datos de ejemplo; con las variables públicas `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` pasa a modo real. El recorrido real está grabado en el video y se puede repetir en local con [correr-local.md](correr-local.md).

### Contratos y transacciones en testnet

Ver [contratos-testnet.md](contratos-testnet.md).

Además de lo anterior, el flujo completo desde la app (registro, ventas, cierre, firma y sello) produjo sellos reales en testnet; ver «Sellos creados desde la app» en [contratos-testnet.md](contratos-testnet.md). Ejemplo: https://stellar.expert/explorer/testnet/tx/d3664460549fe0c72e57c74b88c30251079e8ac2dafda31a0bc2d54f35b36f88

### Video

<!-- Escribe aquí: Lizeth -->

### Cómo verificar tú mismo

1. **CLI de verificación:**
   ```bash
   # Dentro de verifier/
   npm run verify -- paquete.json --rpc <URL_RPC_STELLAR>
   ```
   Recibirás un JSON con el resultado de la verificación por día y los totales. Si algún día no coincide, el JSON detallará qué versión o raíz falló.

2. **Verificación en el navegador:**
   - Abre `https://verificar.bimo.com/#t=<token_del_enlace>`.
   - La página leerá automáticamente el paquete y verificará cada sello contra Stellar RPC.
   - ✅ significa que todo coincide; ❌ significa alteración.


## Participación del equipo

**André:** contratos `bimo-registry`, `bimo-p256-verifier` y `bimo-account` en testnet; migraciones de Supabase (verificadas con `supabase db reset`); `core` completo (comercios, sincronización, cierre, firma y sello, enlaces y verificación pública); paquete `shared` y `verifier` (adelanto); conexión de la app con datos reales; recorrido de punta a punta y evidencia; video del Challenge #4.

<!-- Escribe aquí: Lizeth -->
**Santiago:** paquete `shared` (formatos canónicos, Merkle, validaciones, ULID); pruebas de base de datos; lógica de verificación web (`verifier`) y CLI (`npm run verify`); documentación de desarrollo en `docs/dev-build.md`.
**Lizeth (`ricoththth`):** sistema de diseño de la app (tokens Velto, componentes accesibles, teclado de montos en enteros y pruebas de QA-04 sin jerga); pantallas del dueño: onboarding, "Hoy" con los datos del spec 04 §9, registrar venta con fiado y nota (V-07, V-10), cierre del día, confirmar y sellar, compartir historial, clientes de fiado y correcciones (V-09); página del verificador (enlace al explorador y `noindex`); guion de la prueba de usabilidad y plan de validación con usuarios.

<!-- Escribe aquí: Santiago -->
