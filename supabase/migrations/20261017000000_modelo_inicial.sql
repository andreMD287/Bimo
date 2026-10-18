-- Migracion inicial de Bimo (spec 01 v1.4): enums, tablas, indices, vista, triggers DB-01..DB-12, forget_merchant y RLS.
-- Los nombres son los del spec. Cambios solo aditivos desde aqui.

-- ============================================================ 3. ENUMS
create type member_role   as enum ('dueno', 'empleado');
create type key_kind      as enum ('secure_enclave_p256', 'software_p256', 'passkey_webauthn');
create type currency_code as enum ('COP', 'USDC');
create type account_type  as enum ('activo', 'pasivo', 'ingreso', 'gasto', 'patrimonio');
create type account_code  as enum (
  'caja', 'por_cobrar_clientes', 'por_cobrar_psp', 'cuenta_socio', 'bolsillo_usd', 'adelantos_por_pagar',
  'ventas', 'comisiones', 'diferencias_caja', 'gastos', 'retiros_dueno'
);
create type channel_code  as enum ('efectivo', 'breb', 'datafono_externo', 'tap_to_pay', 'fiado', 'transferencia_otro');
create type entry_kind    as enum ('venta', 'abono_cliente', 'liquidacion_psp', 'ajuste_caja', 'reverso', 'conversion', 'salida');
create type entry_origin  as enum ('declarado', 'verificado', 'on_chain');
create type line_direction as enum ('debe', 'haber');
create type day_status    as enum ('abierto', 'cerrado', 'firmado', 'sellado', 'requiere_enmienda');
create type seal_status   as enum ('preparado', 'firmado', 'enviado', 'confirmado', 'fallido');
create type outbox_status as enum ('pendiente', 'enviado', 'fallido');
create type signing_status as enum ('abierta', 'firmada', 'vencida', 'reemplazada');
create type account_status as enum ('pending', 'deploying', 'ready', 'failed');

-- ============================================================ Utilidades
-- ULID del servidor (26 caracteres Crockford base32): 48 bits de tiempo + 80 bits aleatorios.
create function gen_ulid() returns text language plpgsql volatile as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  ts bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  out text := '';
  rnd bytea := uuid_send(gen_random_uuid());
  i int;
  win int;
begin
  for i in 0..9 loop
    out := substr(alphabet, (ts % 32)::int + 1, 1) || out;
    ts := ts / 32;
  end loop;
  for i in 0..15 loop
    win := (get_byte(rnd, (5 * i) / 8) << 8) | get_byte(rnd, (5 * i) / 8 + 1);
    out := out || substr(alphabet, ((win >> (11 - ((5 * i) % 8))) & 31) + 1, 1);
  end loop;
  return out;
end $$;

-- ============================================================ 4.1 Comercios e identidad
create table merchants (
  id                text primary key,
  stellar_address   text unique,
  network           text not null check (network in ('testnet','mainnet')),
  account_status    account_status not null default 'pending',
  created_at        timestamptz not null default now(),
  forgotten_at      timestamptz
);

create table merchant_profiles (          -- [PII]
  merchant_id       text primary key references merchants(id) on delete cascade,
  business_name     text not null check (length(business_name) <= 80),
  owner_name        text check (length(owner_name) <= 80),
  phone             text,
  city              text
);

create table merchant_members (
  merchant_id       text not null references merchants(id) on delete cascade,
  user_id           uuid not null references auth.users(id),
  role              member_role not null,
  created_at        timestamptz not null default now(),
  primary key (merchant_id, user_id)
);

create table devices (
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  user_id           uuid not null references auth.users(id),
  key_kind          key_kind not null,
  public_key        bytea not null,
  signer_registered_tx text,
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  unique (merchant_id, public_key)
);

-- ============================================================ 4.2 Ledger
create table ledger_accounts (
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  code              account_code not null,
  type              account_type not null,
  currency          currency_code not null,
  unique (merchant_id, code, currency)
);

-- Configuracion de canales (spec 01 v1.4). No es contable.
create table merchant_channels (
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  name              text not null check (length(name) between 1 and 60),
  channel           channel_code not null,
  commission_bps    int not null check (commission_bps between 0 and 10000),
  settlement_days   smallint not null check (settlement_days between 0 and 30),
  active            boolean not null default true,
  created_at        timestamptz not null,
  updated_at        timestamptz not null
);

create table customers (                  -- [PII de terceros]
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  display_name      text not null check (length(display_name) <= 60),
  phone             text,
  created_at        timestamptz not null,
  updated_at        timestamptz not null
);

create table business_days (
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  business_date     date not null,
  status            day_status not null default 'abierto',
  counted_cash_minor bigint,
  closed_at         timestamptz,
  closed_by         uuid references auth.users(id),
  current_seal_version int not null default 0,
  unique (merchant_id, business_date)
);

create table journal_entries (
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  day_id            text not null references business_days(id),
  business_date     date not null,
  occurred_at       timestamptz not null,
  recorded_at       timestamptz not null default now(),
  kind              entry_kind not null,
  origin            entry_origin not null,
  reverses_entry_id text references journal_entries(id),
  external_source   text,
  external_ref      text,
  note              text check (length(note) <= 140),
  device_id         text references devices(id),
  created_by        uuid references auth.users(id),
  clock_suspect     boolean not null default false,
  unique (external_source, external_ref),
  check ((kind = 'reverso') = (reverses_entry_id is not null)),
  check (origin <> 'verificado' or external_ref is not null)
);

create table journal_lines (
  id                text primary key,
  entry_id          text not null references journal_entries(id),
  line_no           smallint not null,
  account_id        text not null references ledger_accounts(id),
  direction         line_direction not null,
  amount_minor      bigint not null check (amount_minor > 0),
  currency          currency_code not null,
  channel           channel_code,
  customer_id       text references customers(id),
  unique (entry_id, line_no)
);

create table entry_salts (
  entry_id          text primary key references journal_entries(id) on delete cascade,
  salt              bytea not null check (length(salt) = 32),
  created_at        timestamptz not null default now()
);

-- ============================================================ 4.3 Sellos
create table signing_requests (
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  status            signing_status not null default 'abierta',
  preimage_xdr      bytea not null,
  expiration_ledger bigint not null,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  closed_at         timestamptz
);
create unique index on signing_requests (merchant_id) where status = 'abierta';

create table seals (
  id                text primary key,
  day_id            text not null references business_days(id),
  signing_request_id text references signing_requests(id),
  version           int not null check (version >= 1),
  merkle_root       bytea not null check (length(merkle_root) = 32),
  entry_count       int not null,
  origin_flags      int not null,
  amend_reason_hash bytea,
  merchant_signature bytea,
  attester_signature bytea,
  status            seal_status not null default 'preparado',
  tx_hash           text,
  ledger_seq        bigint,
  error             text,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  unique (day_id, version)
);

create table seal_leaves (
  seal_id           text not null references seals(id) on delete cascade,
  leaf_index        int not null,
  entry_id          text not null references journal_entries(id) on delete cascade,
  leaf_hash         bytea not null check (length(leaf_hash) = 32),
  primary key (seal_id, leaf_index),
  unique (seal_id, entry_id)
);

-- ============================================================ 4.4 Verificacion
create table verification_links (
  id                text primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  token_hash        bytea not null unique,
  date_from         date not null,
  date_to           date not null check (date_to >= date_from),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  view_count        int not null default 0
);

-- ============================================================ 4.5 Integracion, mensajeria e indexacion
create table inbox_events (
  id                text primary key,
  source            text not null,
  external_id       text not null,
  payload           jsonb not null,
  signature_valid   boolean not null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  error             text,
  unique (source, external_id)
);

create table outbox_messages (
  id                text primary key,
  topic             text not null,
  payload           jsonb not null,
  status            outbox_status not null default 'pendiente',
  attempts          int not null default 0,
  next_attempt_at   timestamptz not null default now(),
  last_error        text,
  created_at        timestamptz not null default now()
);

create table chain_events (
  tx_hash           text not null,
  event_index       int not null,
  contract_id       text not null,
  ledger_seq        bigint not null,
  event_type        text not null,
  topics            jsonb not null,
  data              jsonb not null,
  ingested_at       timestamptz not null default now(),
  primary key (tx_hash, event_index)
);

create table merchant_changes (
  seq               bigserial primary key,
  merchant_id       text not null references merchants(id) on delete cascade,
  entity            text not null check (entity in ('entry','customer','channel','day','seal')),
  entity_id         text not null,
  at                timestamptz not null default now()
);

create table indexer_cursor (
  contract_id       text primary key,
  last_ledger       bigint not null
);

create table audit_log (
  id                bigserial primary key,
  actor             text not null,
  action            text not null,
  target            text,
  detail            jsonb,
  at                timestamptz not null default now()
);

-- ============================================================ 4.6 Indices
create index on journal_entries (merchant_id, business_date);
create index on journal_entries (day_id);
create index on journal_lines (entry_id);
create index on journal_lines (account_id);
create index on journal_lines (customer_id) where customer_id is not null;
create index on seals (status) where status in ('firmado','enviado','fallido');
create index on outbox_messages (status, next_attempt_at) where status = 'pendiente';
create index on chain_events (contract_id, ledger_seq);
create index on merchant_changes (merchant_id, seq);
create index on merchant_channels (merchant_id);

-- ============================================================ 5. Reglas de la base de datos
-- DB-01: asientos y lineas no se editan ni se borran (salvo forget_merchant: bimo.forget = on).
-- DB-12: un sello confirmado no se edita ni se borra (mismo bypass).
create function forget_active() returns boolean language sql stable as $$
  select coalesce(current_setting('bimo.forget', true), 'off') = 'on'
$$;

create function db01_inmutable() returns trigger language plpgsql as $$
begin
  if forget_active() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'DB-01: % no esta permitido sobre %; los asientos son de solo adicion', tg_op, tg_table_name
    using errcode = 'P0001';
end $$;
create trigger db01_journal_entries before update or delete on journal_entries
  for each row execute function db01_inmutable();
create trigger db01_journal_lines before update or delete on journal_lines
  for each row execute function db01_inmutable();

create function db12_sello_confirmado() returns trigger language plpgsql as $$
begin
  if old.status = 'confirmado' and not forget_active() then
    raise exception 'DB-12: un sello confirmado no se edita ni se borra' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger db12_seals before update or delete on seals
  for each row execute function db12_sello_confirmado();

-- DB-02 y DB-03: business_date en America/Bogota y day_id resuelto (ignora lo que mande el cliente).
create function db02_03_dia_de_negocio() returns trigger language plpgsql as $$
declare
  v_date date := (new.occurred_at at time zone 'America/Bogota')::date;
  v_day text;
begin
  new.business_date := v_date;
  insert into business_days (id, merchant_id, business_date)
    values (gen_ulid(), new.merchant_id, v_date)
    on conflict (merchant_id, business_date) do nothing;
  select id into v_day from business_days where merchant_id = new.merchant_id and business_date = v_date;
  new.day_id := v_day;
  return new;
end $$;
create trigger db02_03_journal_entries before insert on journal_entries
  for each row execute function db02_03_dia_de_negocio();

-- DB-08: un reverso apunta a un asiento del mismo comercio que no haya sido reversado antes.
create function db08_reverso() returns trigger language plpgsql as $$
declare
  v_merchant text;
begin
  if new.reverses_entry_id is null then
    return new;
  end if;
  select merchant_id into v_merchant from journal_entries where id = new.reverses_entry_id;
  if v_merchant is null or v_merchant <> new.merchant_id then
    raise exception 'DB-08: el reverso debe apuntar a un asiento del mismo comercio' using errcode = 'P0001';
  end if;
  if exists (select 1 from journal_entries where reverses_entry_id = new.reverses_entry_id and id <> new.id) then
    raise exception 'DB-08: el asiento % ya fue reversado', new.reverses_entry_id using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger db08_journal_entries before insert on journal_entries
  for each row execute function db08_reverso();

-- DB-06 y DB-07: cuenta del mismo comercio y moneda; channel y customer obligatorios segun la cuenta.
create function db06_07_linea() returns trigger language plpgsql as $$
declare
  v_acc ledger_accounts%rowtype;
  v_merchant text;
begin
  select * into v_acc from ledger_accounts where id = new.account_id;
  select merchant_id into v_merchant from journal_entries where id = new.entry_id;
  if v_acc.id is null or v_acc.merchant_id <> v_merchant then
    raise exception 'DB-06: la cuenta no pertenece al comercio del asiento' using errcode = 'P0001';
  end if;
  if v_acc.currency <> new.currency then
    raise exception 'DB-06: la moneda de la linea no coincide con la de la cuenta' using errcode = 'P0001';
  end if;
  if v_acc.type = 'activo' and new.channel is null then
    raise exception 'DB-07: channel es obligatorio en cuentas de activo' using errcode = 'P0001';
  end if;
  if v_acc.code = 'por_cobrar_clientes' and new.customer_id is null then
    raise exception 'DB-07: customer_id es obligatorio en por_cobrar_clientes' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger db06_07_journal_lines before insert on journal_lines
  for each row execute function db06_07_linea();

-- DB-04 y DB-05: el asiento cuadra por moneda y tiene al menos 2 lineas (al hacer commit).
create function db04_05_cuadre() returns trigger language plpgsql as $$
declare
  v_lines int;
  v_bad int;
begin
  select count(*) into v_lines from journal_lines where entry_id = new.entry_id;
  if v_lines < 2 then
    raise exception 'DB-05: el asiento % tiene menos de 2 lineas', new.entry_id using errcode = 'P0001';
  end if;
  select count(*) into v_bad from (
    select currency from journal_lines where entry_id = new.entry_id
    group by currency
    having sum(case when direction = 'debe' then amount_minor else -amount_minor end) <> 0
  ) s;
  if v_bad > 0 then
    raise exception 'DB-04: el asiento % no cuadra (debe <> haber)', new.entry_id using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger db04_05_journal_lines after insert on journal_lines
  deferrable initially deferred for each row execute function db04_05_cuadre();

-- DB-09: un asiento en un dia sellado lo pasa a requiere_enmienda (D-9).
create function db09_enmienda() returns trigger language plpgsql as $$
begin
  update business_days set status = 'requiere_enmienda'
   where id = new.day_id and status = 'sellado';
  return null;
end $$;
create trigger db09_journal_entries after insert on journal_entries
  for each row execute function db09_enmienda();

-- DB-11: feed de cambios por comercio para el pull (spec 04 §8).
create function db11_cambio_entry() returns trigger language plpgsql as $$
begin
  insert into merchant_changes (merchant_id, entity, entity_id) values (new.merchant_id, 'entry', new.id);
  return null;
end $$;
create trigger db11_journal_entries after insert on journal_entries
  for each row execute function db11_cambio_entry();

create function db11_cambio_customer() returns trigger language plpgsql as $$
begin
  insert into merchant_changes (merchant_id, entity, entity_id) values (new.merchant_id, 'customer', new.id);
  return null;
end $$;
create trigger db11_customers after insert or update on customers
  for each row execute function db11_cambio_customer();

create function db11_cambio_channel() returns trigger language plpgsql as $$
begin
  insert into merchant_changes (merchant_id, entity, entity_id) values (new.merchant_id, 'channel', new.id);
  return null;
end $$;
create trigger db11_merchant_channels after insert or update on merchant_channels
  for each row execute function db11_cambio_channel();

create function db11_cambio_day() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into merchant_changes (merchant_id, entity, entity_id) values (new.merchant_id, 'day', new.id);
  end if;
  return null;
end $$;
create trigger db11_business_days after insert or update on business_days
  for each row execute function db11_cambio_day();

create function db11_cambio_seal() returns trigger language plpgsql as $$
declare
  v_merchant text;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select merchant_id into v_merchant from business_days where id = new.day_id;
    insert into merchant_changes (merchant_id, entity, entity_id) values (v_merchant, 'seal', new.id);
  end if;
  return null;
end $$;
create trigger db11_seals after insert or update on seals
  for each row execute function db11_cambio_seal();

-- ============================================================ Saldos
create view account_balances with (security_invoker = true) as
select a.merchant_id, a.code, a.currency,
       coalesce(sum(case when l.direction = 'debe' then l.amount_minor else -l.amount_minor end), 0) as balance_minor
from ledger_accounts a
left join journal_lines l on l.account_id = a.id
group by a.merchant_id, a.code, a.currency;

-- ============================================================ 9. Borrado de datos (ADR-16)
create function forget_merchant(p_merchant_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('bimo.forget', 'on', true);

  -- los sellos conservan solo raiz, version y tx_hash
  update seals set signing_request_id = null, merchant_signature = null, attester_signature = null, error = null
   where day_id in (select id from business_days where merchant_id = p_merchant_id);

  delete from entry_salts where entry_id in (select id from journal_entries where merchant_id = p_merchant_id);
  delete from seal_leaves where entry_id in (select id from journal_entries where merchant_id = p_merchant_id);
  delete from journal_lines where entry_id in (select id from journal_entries where merchant_id = p_merchant_id);
  delete from journal_entries where merchant_id = p_merchant_id;
  delete from customers where merchant_id = p_merchant_id;
  delete from merchant_channels where merchant_id = p_merchant_id;
  delete from merchant_profiles where merchant_id = p_merchant_id;
  delete from verification_links where merchant_id = p_merchant_id;
  delete from devices where merchant_id = p_merchant_id;
  delete from merchant_changes where merchant_id = p_merchant_id;
  delete from signing_requests where merchant_id = p_merchant_id;

  update merchants set forgotten_at = now() where id = p_merchant_id;
  insert into audit_log (actor, action, target) values ('service', 'forget_merchant', p_merchant_id);
end $$;
revoke all on function forget_merchant(text) from public, anon, authenticated;
grant execute on function forget_merchant(text) to service_role;

-- ============================================================ RLS (DB-10 y segunda barrera)
-- La app nunca habla con Postgres; todo pasa por bimo-core (rol de servicio, que ignora RLS).
-- Un usuario autenticado solo puede LEER lo de los comercios de los que es miembro; nunca escribe.
alter table merchants enable row level security;
alter table merchant_profiles enable row level security;
alter table merchant_members enable row level security;
alter table devices enable row level security;
alter table ledger_accounts enable row level security;
alter table merchant_channels enable row level security;
alter table customers enable row level security;
alter table business_days enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
alter table entry_salts enable row level security;
alter table signing_requests enable row level security;
alter table seals enable row level security;
alter table seal_leaves enable row level security;
alter table verification_links enable row level security;
alter table inbox_events enable row level security;
alter table outbox_messages enable row level security;
alter table chain_events enable row level security;
alter table merchant_changes enable row level security;
alter table indexer_cursor enable row level security;
alter table audit_log enable row level security;

create function is_member(p_merchant_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from merchant_members m where m.merchant_id = p_merchant_id and m.user_id = auth.uid())
$$;

create policy miembros_leen on merchants for select to authenticated using (is_member(id));
create policy miembros_leen on merchant_profiles for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on merchant_members for select to authenticated using (user_id = auth.uid());
create policy miembros_leen on devices for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on ledger_accounts for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on merchant_channels for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on customers for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on business_days for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on journal_entries for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on journal_lines for select to authenticated
  using (exists (select 1 from journal_entries e where e.id = entry_id and is_member(e.merchant_id)));
create policy miembros_leen on signing_requests for select to authenticated using (is_member(merchant_id));
create policy miembros_leen on seals for select to authenticated
  using (exists (select 1 from business_days d where d.id = day_id and is_member(d.merchant_id)));
create policy miembros_leen on seal_leaves for select to authenticated
  using (exists (select 1 from seals s join business_days d on d.id = s.day_id where s.id = seal_id and is_member(d.merchant_id)));
create policy miembros_leen on merchant_changes for select to authenticated using (is_member(merchant_id));
-- Sin politicas (solo rol de servicio): entry_salts, verification_links, inbox_events, outbox_messages,
-- chain_events, indexer_cursor, audit_log.
