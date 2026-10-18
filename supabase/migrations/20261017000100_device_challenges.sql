-- Spec 01 v1.5: retos de un solo uso para registrar un dispositivo o borrar la cuenta (spec 06 §3.1).
create table device_challenges (
  id                text primary key,
  user_id           uuid not null references auth.users(id),
  purpose           text not null check (purpose in ('register_device','delete_merchant')),
  challenge         bytea not null check (length(challenge) = 32),
  expires_at        timestamptz not null,
  used_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index on device_challenges (user_id, created_at);
-- Solo el rol de servicio: RLS activo y sin politicas.
alter table device_challenges enable row level security;
