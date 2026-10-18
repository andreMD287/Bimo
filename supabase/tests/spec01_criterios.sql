-- Criterios de aceptacion del spec 01 §11 (y DB-01..DB-12). Se corre contra una base con las migraciones:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec01_criterios.sql
-- Todo ocurre dentro de una transaccion que termina en ROLLBACK. Cada prueba lleva el ID de la regla.
begin;

create function pg_temp.fail(msg text) returns void language plpgsql as $$
begin raise exception 'FALLA: %', msg; end $$;

-- Ejecuta sql y exige que falle con un mensaje que contenga el patron.
create function pg_temp.expect_error(prueba text, sql text, patron text) returns void language plpgsql as $$
begin
  begin
    execute sql;
    set constraints all immediate;
  exception when others then
    if sqlerrm like '%' || patron || '%' then
      raise notice 'ok  %', prueba;
      return;
    end if;
    raise exception 'FALLA: % -> error inesperado: %', prueba, sqlerrm;
  end;
  raise exception 'FALLA: % -> no fallo', prueba;
end $$;

create function pg_temp.assert_eq(prueba text, actual anyelement, esperado anyelement) returns void language plpgsql as $$
begin
  if actual is distinct from esperado then
    raise exception 'FALLA: % -> esperado %, actual %', prueba, esperado, actual;
  end if;
  raise notice 'ok  %', prueba;
end $$;

-- Fixture: dos comercios con sus cuentas y un usuario dueno cada uno.
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.co'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.co');
insert into merchants (id, network) values ('M_A', 'testnet'), ('M_B', 'testnet');
insert into merchant_members (merchant_id, user_id, role) values
  ('M_A', '00000000-0000-0000-0000-0000000000a1', 'dueno'),
  ('M_B', '00000000-0000-0000-0000-0000000000b2', 'dueno');
insert into merchant_profiles (merchant_id, business_name, owner_name) values ('M_A', 'Tienda A', 'Dueno A'), ('M_B', 'Tienda B', 'Dueno B');

create function pg_temp.crear_cuentas(m text) returns void language plpgsql as $$
begin
  insert into ledger_accounts (id, merchant_id, code, type, currency) values
    (m||'_caja', m, 'caja', 'activo', 'COP'),
    (m||'_pcc', m, 'por_cobrar_clientes', 'activo', 'COP'),
    (m||'_pcp', m, 'por_cobrar_psp', 'activo', 'COP'),
    (m||'_cso', m, 'cuenta_socio', 'activo', 'COP'),
    (m||'_usd', m, 'bolsillo_usd', 'activo', 'USDC'),
    (m||'_ven', m, 'ventas', 'ingreso', 'COP'),
    (m||'_com', m, 'comisiones', 'gasto', 'COP'),
    (m||'_dif', m, 'diferencias_caja', 'gasto', 'COP'),
    (m||'_gas', m, 'gastos', 'gasto', 'COP'),
    (m||'_ret', m, 'retiros_dueno', 'patrimonio', 'COP');
end $$;
select pg_temp.crear_cuentas('M_A');
select pg_temp.crear_cuentas('M_B');
insert into customers (id, merchant_id, display_name, created_at, updated_at) values
  ('C_ROSA', 'M_A', 'Dona Rosa', now(), now());

-- Crea un asiento con lineas: [{"a":"caja","d":"debe","m":2000000,"c":"efectivo","u":"C_ROSA"}]
create function pg_temp.mk(id text, merchant text, kind entry_kind, occurred timestamptz, lineas jsonb, reverses text default null)
returns void language plpgsql as $$
declare l jsonb; n int := 0; suf text;
begin
  insert into journal_entries (id, merchant_id, occurred_at, kind, origin, reverses_entry_id)
    values (id, merchant, occurred, kind, 'declarado', reverses);
  for l in select * from jsonb_array_elements(lineas) loop
    n := n + 1;
    suf := case l->>'a' when 'caja' then 'caja' when 'por_cobrar_clientes' then 'pcc' when 'por_cobrar_psp' then 'pcp'
      when 'cuenta_socio' then 'cso' when 'ventas' then 'ven' when 'comisiones' then 'com' when 'diferencias_caja' then 'dif'
      when 'gastos' then 'gas' when 'retiros_dueno' then 'ret' end;
    insert into journal_lines (id, entry_id, line_no, account_id, direction, amount_minor, currency, channel, customer_id)
      values (id || '_L' || n, id, n, merchant || '_' || suf, (l->>'d')::line_direction, (l->>'m')::bigint, 'COP',
              (l->>'c')::channel_code, l->>'u');
  end loop;
end $$;

-- ---------------------------------------------------------------- La migracion crea lo del spec
select pg_temp.assert_eq('spec01 11: 21 tablas en public',
  (select count(*)::int from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'), 21);
select pg_temp.assert_eq('spec01 11: RLS activo en todas las tablas',
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0);

-- ---------------------------------------------------------------- DB-02 / DB-03
select pg_temp.mk('E1', 'M_A', 'venta', '2026-10-07T04:30:00Z',
  '[{"a":"caja","d":"debe","m":2000000,"c":"efectivo"},{"a":"ventas","d":"haber","m":2000000}]');
select pg_temp.assert_eq('DB-02 04:30Z queda el 2026-10-06 en Bogota',
  (select business_date from journal_entries where id = 'E1'), date '2026-10-06');
select pg_temp.assert_eq('DB-03 crea el dia y lo enlaza',
  (select count(*)::int from business_days d join journal_entries e on e.day_id = d.id where e.id = 'E1' and d.status = 'abierto'), 1);
select pg_temp.mk('E1b', 'M_A', 'venta', '2026-10-07T05:15:00Z',
  '[{"a":"caja","d":"debe","m":100,"c":"efectivo"},{"a":"ventas","d":"haber","m":100}]');
select pg_temp.assert_eq('DB-02 05:15Z (12:15 a. m.) es el dia siguiente',
  (select business_date from journal_entries where id = 'E1b'), date '2026-10-07');

select pg_temp.assert_eq('gen_ulid: 26 caracteres Crockford base32 (los ids de business_days)',
  (select count(*)::int from business_days where id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'), (select count(*)::int from business_days));

-- ---------------------------------------------------------------- DB-01
select pg_temp.expect_error('DB-01 UPDATE de journal_entries', $$update journal_entries set note = 'x' where id = 'E1'$$, 'DB-01');
select pg_temp.expect_error('DB-01 DELETE de journal_entries', $$delete from journal_entries where id = 'E1'$$, 'DB-01');
select pg_temp.expect_error('DB-01 UPDATE de journal_lines', $$update journal_lines set amount_minor = 1 where id = 'E1_L1'$$, 'DB-01');
select pg_temp.expect_error('DB-01 DELETE de journal_lines', $$delete from journal_lines where id = 'E1_L1'$$, 'DB-01');

-- ---------------------------------------------------------------- DB-04 / DB-05
select pg_temp.expect_error('DB-04 asiento descuadrado falla en el commit',
  $$select pg_temp.mk('E_BAD', 'M_A', 'venta', now(), '[{"a":"caja","d":"debe","m":100,"c":"efectivo"},{"a":"ventas","d":"haber","m":99}]')$$, 'DB-04');
select pg_temp.expect_error('DB-05 asiento con una sola linea',
  $$select pg_temp.mk('E_ONE', 'M_A', 'venta', now(), '[{"a":"caja","d":"debe","m":100,"c":"efectivo"}]')$$, 'DB-05');

-- ---------------------------------------------------------------- DB-06 / DB-07 / DB-08
select pg_temp.expect_error('DB-06 cuenta de otro comercio',
  $$insert into journal_entries (id, merchant_id, occurred_at, kind, origin) values ('E_X', 'M_A', now(), 'venta', 'declarado');
    insert into journal_lines (id, entry_id, line_no, account_id, direction, amount_minor, currency, channel)
      values ('E_X_L1', 'E_X', 1, 'M_B_caja', 'debe', 100, 'COP', 'efectivo')$$, 'DB-06');
select pg_temp.expect_error('DB-06 moneda distinta a la de la cuenta',
  $$insert into journal_entries (id, merchant_id, occurred_at, kind, origin) values ('E_Y', 'M_A', now(), 'venta', 'declarado');
    insert into journal_lines (id, entry_id, line_no, account_id, direction, amount_minor, currency, channel)
      values ('E_Y_L1', 'E_Y', 1, 'M_A_caja', 'debe', 100, 'USDC', 'efectivo')$$, 'DB-06');
select pg_temp.expect_error('DB-07 channel obligatorio en cuenta de activo',
  $$insert into journal_entries (id, merchant_id, occurred_at, kind, origin) values ('E_Z', 'M_A', now(), 'venta', 'declarado');
    insert into journal_lines (id, entry_id, line_no, account_id, direction, amount_minor, currency)
      values ('E_Z_L1', 'E_Z', 1, 'M_A_caja', 'debe', 100, 'COP')$$, 'DB-07');
select pg_temp.expect_error('DB-07 customer obligatorio en por_cobrar_clientes',
  $$insert into journal_entries (id, merchant_id, occurred_at, kind, origin) values ('E_W', 'M_A', now(), 'venta', 'declarado');
    insert into journal_lines (id, entry_id, line_no, account_id, direction, amount_minor, currency, channel)
      values ('E_W_L1', 'E_W', 1, 'M_A_pcc', 'debe', 100, 'COP', 'fiado')$$, 'DB-07');

select pg_temp.mk('E1_R', 'M_A', 'reverso', '2026-10-07T04:35:00Z',
  '[{"a":"ventas","d":"debe","m":2000000},{"a":"caja","d":"haber","m":2000000,"c":"efectivo"}]', 'E1');
select pg_temp.expect_error('DB-08 un asiento no se reversa dos veces',
  $$select pg_temp.mk('E1_R2', 'M_A', 'reverso', now(), '[{"a":"ventas","d":"debe","m":2000000},{"a":"caja","d":"haber","m":2000000,"c":"efectivo"}]', 'E1')$$, 'DB-08');
select pg_temp.expect_error('DB-08 el reverso apunta a un asiento del mismo comercio',
  $$select pg_temp.mk('E_B1', 'M_B', 'venta', now(), '[{"a":"caja","d":"debe","m":5,"c":"efectivo"},{"a":"ventas","d":"haber","m":5}]');
    select pg_temp.mk('E_B1_R', 'M_A', 'reverso', now(), '[{"a":"ventas","d":"debe","m":5},{"a":"caja","d":"haber","m":5,"c":"efectivo"}]', 'E_B1')$$, 'DB-08');

-- ---------------------------------------------------------------- Reenvio idempotente
insert into journal_entries (id, merchant_id, occurred_at, kind, origin)
  values ('E1', 'M_A', '2026-10-07T04:30:00Z', 'venta', 'declarado') on conflict (id) do nothing;
select pg_temp.assert_eq('Reenviar el mismo asiento no crea duplicados',
  (select count(*)::int from journal_entries where id = 'E1'), 1);

-- ---------------------------------------------------------------- DB-09 / D-9
update business_days set status = 'sellado' where merchant_id = 'M_A' and business_date = '2026-10-06';
select pg_temp.mk('E2', 'M_A', 'venta', '2026-10-06T22:00:00Z',
  '[{"a":"cuenta_socio","d":"debe","m":500,"c":"breb"},{"a":"ventas","d":"haber","m":500}]');
select pg_temp.assert_eq('DB-09 asiento en dia sellado -> requiere_enmienda',
  (select status::text from business_days where merchant_id = 'M_A' and business_date = '2026-10-06'), 'requiere_enmienda');

-- ---------------------------------------------------------------- DB-11
select pg_temp.assert_eq('DB-11 el asiento E1 agrego una fila al feed',
  (select count(*)::int from merchant_changes where merchant_id = 'M_A' and entity = 'entry' and entity_id = 'E1'), 1);
select pg_temp.assert_eq('DB-11 el cambio de estado del dia agrego una fila',
  (select count(*)::int from merchant_changes where merchant_id = 'M_A' and entity = 'day') >= 3, true);
insert into merchant_channels (id, merchant_id, name, channel, commission_bps, settlement_days, created_at, updated_at)
  values ('CH1', 'M_A', 'Datafono Bold', 'datafono_externo', 250, 2, now(), now());
update merchant_channels set commission_bps = 300, updated_at = now() where id = 'CH1';
select pg_temp.assert_eq('DB-11 INSERT y UPDATE de merchant_channels agregan filas',
  (select count(*)::int from merchant_changes where entity = 'channel' and entity_id = 'CH1'), 2);
update customers set display_name = 'Dona Rosa M.', updated_at = now() where id = 'C_ROSA';
select pg_temp.assert_eq('DB-11 INSERT y UPDATE de customers agregan filas',
  (select count(*)::int from merchant_changes where entity = 'customer' and entity_id = 'C_ROSA'), 2);
select pg_temp.expect_error('commission_bps fuera de 0-10000',
  $$insert into merchant_channels values ('CH2','M_A','x','efectivo',10001,0,true,now(),now())$$, 'commission_bps');
select pg_temp.expect_error('settlement_days fuera de 0-30',
  $$insert into merchant_channels values ('CH3','M_A','x','efectivo',0,31,true,now(),now())$$, 'settlement_days');

-- ---------------------------------------------------------------- Ejemplos del spec 01 §6 y saldos
-- Comercio M_B (limpio). Montos en centavos.
select pg_temp.mk('X01', 'M_B', 'venta', '2026-10-06T15:00:00Z', '[{"a":"caja","d":"debe","m":2000000,"c":"efectivo"},{"a":"ventas","d":"haber","m":2000000}]');
select pg_temp.mk('X02', 'M_B', 'venta', '2026-10-06T15:01:00Z', '[{"a":"caja","d":"debe","m":3000000,"c":"efectivo"},{"a":"cuenta_socio","d":"debe","m":7000000,"c":"breb"},{"a":"ventas","d":"haber","m":10000000}]');
select pg_temp.mk('X03', 'M_B', 'venta', '2026-10-06T15:02:00Z', '[{"a":"por_cobrar_psp","d":"debe","m":10000000,"c":"datafono_externo"},{"a":"ventas","d":"haber","m":10000000}]');
insert into customers (id, merchant_id, display_name, created_at, updated_at) values ('C_B', 'M_B', 'Dona Rosa', now(), now());
select pg_temp.mk('X04', 'M_B', 'venta', '2026-10-06T15:03:00Z', '[{"a":"por_cobrar_clientes","d":"debe","m":5000000,"c":"fiado","u":"C_B"},{"a":"ventas","d":"haber","m":5000000}]');
select pg_temp.mk('X05', 'M_B', 'abono_cliente', '2026-10-06T15:04:00Z', '[{"a":"caja","d":"debe","m":2000000,"c":"efectivo"},{"a":"por_cobrar_clientes","d":"haber","m":2000000,"c":"fiado","u":"C_B"}]');
select pg_temp.mk('X06', 'M_B', 'liquidacion_psp', '2026-10-06T15:05:00Z', '[{"a":"cuenta_socio","d":"debe","m":9800000,"c":"datafono_externo"},{"a":"comisiones","d":"debe","m":200000},{"a":"por_cobrar_psp","d":"haber","m":10000000,"c":"datafono_externo"}]');
select pg_temp.mk('X07', 'M_B', 'ajuste_caja', '2026-10-06T15:06:00Z', '[{"a":"diferencias_caja","d":"debe","m":500000},{"a":"caja","d":"haber","m":500000,"c":"efectivo"}]');
select pg_temp.mk('X08', 'M_B', 'venta', '2026-10-06T15:07:00Z', '[{"a":"caja","d":"debe","m":999,"c":"efectivo"},{"a":"ventas","d":"haber","m":999}]');
select pg_temp.mk('X08_R', 'M_B', 'reverso', '2026-10-06T15:08:00Z', '[{"a":"ventas","d":"debe","m":999},{"a":"caja","d":"haber","m":999,"c":"efectivo"}]', 'X08');
select pg_temp.mk('X09', 'M_B', 'salida', '2026-10-06T15:09:00Z', '[{"a":"gastos","d":"debe","m":3000000},{"a":"caja","d":"haber","m":3000000,"c":"efectivo"}]');
select pg_temp.mk('X10', 'M_B', 'salida', '2026-10-06T15:10:00Z', '[{"a":"retiros_dueno","d":"debe","m":5000000},{"a":"cuenta_socio","d":"haber","m":5000000,"c":"breb"}]');
select pg_temp.mk('X11', 'M_B', 'venta', '2026-10-06T15:11:00Z', '[{"a":"caja","d":"debe","m":4000000,"c":"efectivo"},{"a":"por_cobrar_clientes","d":"debe","m":6000000,"c":"fiado","u":"C_B"},{"a":"ventas","d":"haber","m":10000000}]');
set constraints all immediate;
-- caja: 2.000.000+3.000.000+2.000.000-500.000+999-999-3.000.000+4.000.000 = 7.500.000
select pg_temp.assert_eq('spec01 6: saldo de caja', (select balance_minor::bigint from account_balances where merchant_id = 'M_B' and code = 'caja'), 7500000::bigint);
-- cuenta_socio: 7.000.000+9.800.000-5.000.000 = 11.800.000
select pg_temp.assert_eq('spec01 6: saldo de cuenta_socio', (select balance_minor::bigint from account_balances where merchant_id = 'M_B' and code = 'cuenta_socio'), 11800000::bigint);
-- por_cobrar_psp: 10.000.000-10.000.000 = 0
select pg_temp.assert_eq('spec01 6: saldo de por_cobrar_psp', (select balance_minor::bigint from account_balances where merchant_id = 'M_B' and code = 'por_cobrar_psp'), 0::bigint);
-- por_cobrar_clientes: 5.000.000-2.000.000+6.000.000 = 9.000.000
select pg_temp.assert_eq('spec01 6: saldo de por_cobrar_clientes (fiado y anticipo)', (select balance_minor::bigint from account_balances where merchant_id = 'M_B' and code = 'por_cobrar_clientes'), 9000000::bigint);
-- ventas (haber negativo): -(2.000.000+10.000.000+10.000.000+5.000.000+999-999+10.000.000)...
select pg_temp.assert_eq('spec01 6: saldo de ventas', (select balance_minor::bigint from account_balances where merchant_id = 'M_B' and code = 'ventas'), -37000000::bigint);
select pg_temp.assert_eq('spec01 6: saldo de comisiones', (select balance_minor::bigint from account_balances where merchant_id = 'M_B' and code = 'comisiones'), 200000::bigint);
select pg_temp.assert_eq('spec01 6: saldo de gastos y retiros',
  (select sum(balance_minor)::bigint from account_balances where merchant_id = 'M_B' and code in ('gastos','retiros_dueno')), 8000000::bigint);

-- ---------------------------------------------------------------- Sellos: DB-12 y solicitud unica
insert into signing_requests (id, merchant_id, status, preimage_xdr, expiration_ledger, expires_at)
  values ('SR1', 'M_B', 'abierta', '\x00', 1, now() + interval '10 minutes');
select pg_temp.expect_error('Una sola signing_request abierta por comercio',
  $$insert into signing_requests (id, merchant_id, status, preimage_xdr, expiration_ledger, expires_at) values ('SR2','M_B','abierta','\x00',1,now())$$, 'signing_requests');
insert into seals (id, day_id, signing_request_id, version, merkle_root, entry_count, origin_flags, status, tx_hash, merchant_signature)
  select 'S1', d.id, 'SR1', 1, decode(repeat('ab', 32), 'hex'), 13, 1, 'confirmado', 'TXHASH', '\x01'
  from business_days d where d.merchant_id = 'M_B';
select pg_temp.assert_eq('DB-11 el sello agrega fila al feed', (select count(*)::int from merchant_changes where entity = 'seal' and entity_id = 'S1'), 1);
select pg_temp.expect_error('DB-12 UPDATE de un sello confirmado', $$update seals set entry_count = 1 where id = 'S1'$$, 'DB-12');
select pg_temp.expect_error('DB-12 DELETE de un sello confirmado', $$delete from seals where id = 'S1'$$, 'DB-12');

-- ---------------------------------------------------------------- RLS
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select pg_temp.assert_eq('RLS: el miembro ve sus asientos', (select count(*)::int from journal_entries where merchant_id = 'M_A') > 0, true);
select pg_temp.assert_eq('RLS: no ve asientos de otro comercio', (select count(*)::int from journal_entries where merchant_id = 'M_B'), 0);
select pg_temp.assert_eq('RLS: no ve clientes de otro comercio', (select count(*)::int from customers where merchant_id = 'M_B'), 0);
select pg_temp.assert_eq('RLS: no ve sellos de otro comercio', (select count(*)::int from seals), 0);
select pg_temp.assert_eq('RLS: no lee las sales', (select count(*)::int from entry_salts), 0);
select pg_temp.expect_error('RLS: un usuario autenticado no escribe asientos',
  $$insert into journal_entries (id, merchant_id, occurred_at, kind, origin) values ('E_RLS', 'M_A', now(), 'venta', 'declarado')$$, 'row-level security');
reset role;

-- ---------------------------------------------------------------- forget_merchant
insert into entry_salts (entry_id, salt) values ('X01', decode(repeat('cd', 32), 'hex'));
select forget_merchant('M_B');
select pg_temp.assert_eq('forget_merchant: sin asientos', (select count(*)::int from journal_entries where merchant_id = 'M_B'), 0);
select pg_temp.assert_eq('forget_merchant: sin lineas', (select count(*)::int from journal_lines where entry_id like 'X%'), 0);
select pg_temp.assert_eq('forget_merchant: sin sales', (select count(*)::int from entry_salts where entry_id like 'X%'), 0);
select pg_temp.assert_eq('forget_merchant: sin clientes ni PII',
  (select count(*)::int from customers where merchant_id = 'M_B') + (select count(*)::int from merchant_profiles where merchant_id = 'M_B'), 0);
select pg_temp.assert_eq('forget_merchant: el sello queda con raiz, version y tx_hash',
  (select row(version, encode(merkle_root, 'hex'), tx_hash, merchant_signature is null, signing_request_id is null)::text from seals where id = 'S1'),
  '(1,' || repeat('ab', 32) || ',TXHASH,t,t)');
select pg_temp.assert_eq('forget_merchant: marca forgotten_at', (select forgotten_at is not null from merchants where id = 'M_B'), true);

do $$ begin raise notice 'TODAS LAS PRUEBAS DEL SPEC 01 PASARON'; end $$;
rollback;
