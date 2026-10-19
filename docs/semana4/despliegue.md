# Despliegue (Vercel, Railway y Supabase)

Estado: **Vercel ya está desplegado** (https://bimo-frontend.vercel.app, modo demostración). Falta publicar `core` y la base para que el enlace público trabaje con datos reales. Estos pasos **no se han probado** porque requieren cuentas de Railway y Supabase en la nube.

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

## 3. Vercel (variables públicas del proyecto `bimo-frontend`)
Project → Settings → Environment Variables (Production y Preview):
- `EXPO_PUBLIC_API_URL` = URL pública de la API de Railway
- `EXPO_PUBLIC_SUPABASE_URL` = URL del proyecto de Supabase
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = llave pública (anon/publishable)

Después, *Redeploy*. Con las tres definidas la app sale del modo demostración. Ninguna es secreta; las llaves de Stellar nunca van a Vercel.

## 4. Apex
Registrar el proyecto antes de las 8:00 p. m. del lunes con el enlace de Vercel en **Website**.
