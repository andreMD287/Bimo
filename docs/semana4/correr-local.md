# Correr todo en local (para grabar el video)

Requisitos: Docker encendido, `stellar` CLI con las llaves `bimo-attester`, `bimo-deployer` y `bimo-fallback`.

1. Supabase local (incluye el buzón de correos en http://127.0.0.1:54324):
   `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,postgrest`
2. `core` (API y worker) con estas variables, los secretos salen de `stellar keys secret <nombre>`:
   `BIMO_ENV=local DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json STELLAR_NETWORK=testnet PORT=8787 ATTESTER_SECRET=… DEPLOYER_SECRET=… FALLBACK_SUBMITTER_SECRET=…`
   `pnpm --filter @bimo/core exec tsx src/main.ts api` y, en otra terminal, `… main.ts worker`.
3. App web: en `frontend/`, con `EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key de supabase start>`, `npx expo start --web --port 8081`.
4. Prueba sin pantalla de todo el recorrido: `pnpm --filter @bimo/core exec tsx ../frontend/scripts/smoke-local.mts`.

El código de ingreso llega al buzón local (Mailpit). En un proyecto Supabase en la nube hay que poner `{{ .Token }}` en las plantillas "Magic Link" y "Confirm signup" (ver `supabase/templates/`).
