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

<!-- Escribe aquí: Lizeth -->

## Evidencia verificable

### Producto en línea

Aplicación web: **https://bimo-frontend.vercel.app** (Vercel, se despliega desde `main`). Hoy muestra la app en modo demostración con datos de ejemplo; con las variables públicas `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` pasa a modo real. El recorrido real está grabado en el video y se puede repetir en local con [correr-local.md](correr-local.md).

### Contratos y transacciones en testnet

Ver [contratos-testnet.md](contratos-testnet.md).

Además de lo anterior, el flujo completo desde la app (registro, ventas, cierre, firma y sello) produjo sellos reales en testnet; ver «Sellos creados desde la app» en [contratos-testnet.md](contratos-testnet.md). Ejemplo: https://stellar.expert/explorer/testnet/tx/d3664460549fe0c72e57c74b88c30251079e8ac2dafda31a0bc2d54f35b36f88

### Video

<!-- Escribe aquí: Lizeth -->

### Cómo verificar tú mismo

<!-- Escribe aquí: Santiago -->

## Participación del equipo

**André:** contratos `bimo-registry`, `bimo-p256-verifier` y `bimo-account` en testnet; migraciones de Supabase (verificadas con `supabase db reset`); `core` completo (comercios, sincronización, cierre, firma y sello, enlaces y verificación pública); paquete `shared` y `verifier` (adelanto); conexión de la app con datos reales; recorrido de punta a punta y evidencia; video del Challenge #4.

<!-- Escribe aquí: Lizeth -->
<!-- Escribe aquí: Santiago -->
