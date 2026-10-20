# Despliegue (Vercel, Railway y Supabase)

Estado: Vercel (https://bimo-frontend.vercel.app), Supabase en la nube y `core` en Render (https://bimo-xtcr.onrender.com, modo `all`, plan gratuito, ver 2b) están desplegados y `/health` responde `ok`. Railway no se usó (sin plan gratuito). Para pasar a producción real hace falta un plan sin suspensión y rotar las contraseñas usadas en las pruebas.

## 1. Supabase (proyecto en la nube)
1. Crear el proyecto. Aplicar `supabase/migrations/*` (`supabase link` y `supabase db push`).
2. Authentication → Email Templates: en **Magic Link** y **Confirm signup** poner `{{ .Token }}` (ver `supabase/templates/*.html`). Sin esto el correo no trae el código de 6 dígitos.
3. Copiar: URL del proyecto, llave pública (anon/publishable) y la cadena de conexión de la base.

## 2. Railway: `core` (dos servicios con el mismo repositorio)
- API: `pnpm install --frozen-lockfile && pnpm --filter @bimo/core exec tsx src/main.ts api`
- Worker: igual, pero terminando en `main.ts worker`.
- Variables (secretos del servicio, **nunca** en el repo):
  `BIMO_ENV=staging`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL=<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, `STELLAR_NETWORK=testnet`, `BIMO_SIMULATORS=off`, `VERIFIER_BASE_URL=https://bimo-frontend.vercel.app`, `PORT`,
  `ATTESTER_SECRET`, `DEPLOYER_SECRET`, `FALLBACK_SUBMITTER_SECRET` (salen de `stellar keys secret bimo-attester|bimo-deployer|bimo-fallback`).
- Comprobar: `GET /health` debe responder `{"status":"ok","db":"ok","rpc":"ok"}`.

## 2b. Alternativa gratuita de un solo servicio (Render)
Si Railway no está disponible: un solo *Web Service* con el modo `all` (API y worker en el mismo proceso).
- Build: `corepack enable && pnpm install --frozen-lockfile`
- Start: `pnpm --filter @bimo/core exec tsx src/main.ts all`
- Mismas variables que en Railway. En el plan gratis el servicio se duerme tras 15 min sin tráfico y la primera petición tarda ~50 s.

## 3. Vercel (variables públicas del proyecto `bimo-frontend`)
Project → Settings → Environment Variables (Production y Preview):
- `EXPO_PUBLIC_API_URL` = URL pública de la API de Railway
- `EXPO_PUBLIC_SUPABASE_URL` = URL del proyecto de Supabase
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = llave pública (anon/publishable)

Después, *Redeploy*. Con las tres definidas la app sale del modo demostración. Ninguna es secreta; las llaves de Stellar nunca van a Vercel.

## 4. Apex
Registrar el proyecto antes de las 8:00 p. m. del lunes con el enlace de Vercel en **Website**.
