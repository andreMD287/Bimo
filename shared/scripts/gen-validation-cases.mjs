/* global URL, console */
// Genera shared/validation-cases.json (spec 04 §4, spec 08 §4): { name, entry, context, expected: "ok" | <codigo> }.
// Uso: node shared/scripts/gen-validation-cases.mjs
import { writeFileSync } from 'node:fs';

const ALPHABET = /[^0-9A-HJKMNP-TV-Z]/g;
const id = (tag) => ('01JD' + tag.toUpperCase().replace(ALPHABET, '0')).padEnd(26, '0').slice(0, 26);
const CUSTOMER = id('CLIENTEROSA');
const T = '2026-10-06T20:30:00.000Z';

let seq = 0;
const line = (account_code, direction, amount_minor, channel, customer_id) => {
  seq += 1;
  return {
    id: id('L' + seq), line_no: 0, account_code, direction, amount_minor, currency: 'COP',
    ...(channel ? { channel } : {}), ...(customer_id ? { customer_id } : {}),
  };
};
const entry = (tag, kind, lines, extra = {}) => ({
  id: id(tag), occurred_at: T, kind, origin: 'declarado', reverses_entry_id: null, note: null,
  lines: lines.map((l, i) => ({ ...l, line_no: i + 1 })), ...extra,
});
const ctx = (extra = {}) => ({ customers: [CUSTOMER], entries: [], reversed: [], ...extra });

const venta = (tag, amount = 2000000) =>
  entry(tag, 'venta', [line('caja', 'debe', amount, 'efectivo'), line('ventas', 'haber', amount)]);

const cases = [];
const add = (name, e, expected, context = ctx()) => cases.push({ name, entry: e, context, expected });

// ---- Los ejemplos del spec 01 §6 (todos validos)
add('ejemplo 1: venta en efectivo $20.000', venta('EJ1'), 'ok');
add('ejemplo 2: venta dividida efectivo + Bre-B', entry('EJ2', 'venta', [line('caja', 'debe', 3000000, 'efectivo'), line('cuenta_socio', 'debe', 7000000, 'breb'), line('ventas', 'haber', 10000000)]), 'ok');
add('ejemplo 3: venta con datafono externo', entry('EJ3', 'venta', [line('por_cobrar_psp', 'debe', 10000000, 'datafono_externo'), line('ventas', 'haber', 10000000)]), 'ok');
add('ejemplo 4: venta fiada a Dona Rosa', entry('EJ4', 'venta', [line('por_cobrar_clientes', 'debe', 5000000, 'fiado', CUSTOMER), line('ventas', 'haber', 5000000)]), 'ok');
add('ejemplo 5: abono de Dona Rosa en efectivo', entry('EJ5', 'abono_cliente', [line('caja', 'debe', 2000000, 'efectivo'), line('por_cobrar_clientes', 'haber', 2000000, 'fiado', CUSTOMER)]), 'ok');
add('ejemplo 6: consignacion del datafono con comision', entry('EJ6', 'liquidacion_psp', [line('cuenta_socio', 'debe', 9800000, 'datafono_externo'), line('comisiones', 'debe', 200000), line('por_cobrar_psp', 'haber', 10000000, 'datafono_externo')]), 'ok');
add('ejemplo 7: faltante en caja al cerrar', entry('EJ7', 'ajuste_caja', [line('diferencias_caja', 'debe', 500000), line('caja', 'haber', 500000, 'efectivo')]), 'ok');
add('ejemplo 7b: sobrante en caja al cerrar', entry('EJ7B', 'ajuste_caja', [line('caja', 'debe', 500000, 'efectivo'), line('diferencias_caja', 'haber', 500000)]), 'ok');
{
  const original = venta('EJ8O');
  const rev = entry('EJ8', 'reverso', [line('ventas', 'debe', 2000000), line('caja', 'haber', 2000000, 'efectivo')], { reverses_entry_id: original.id });
  add('ejemplo 8: reverso de una venta mal registrada', rev, 'ok', ctx({ entries: [original] }));
}
add('ejemplo 9: pago a un proveedor en efectivo', entry('EJ9', 'salida', [line('gastos', 'debe', 3000000), line('caja', 'haber', 3000000, 'efectivo')]), 'ok');
add('ejemplo 10: el dueno saca plata por Bre-B', entry('EJ10', 'salida', [line('retiros_dueno', 'debe', 5000000), line('cuenta_socio', 'haber', 5000000, 'breb')]), 'ok');
add('ejemplo 11: venta con anticipo (saldo por cobrar)', entry('EJ11', 'venta', [line('caja', 'debe', 4000000, 'efectivo'), line('por_cobrar_clientes', 'debe', 6000000, 'fiado', CUSTOMER), line('ventas', 'haber', 10000000)]), 'ok');
add('la hora nunca es motivo de rechazo: una venta de 2001', { ...venta('HORA1'), occurred_at: '2001-01-01T00:00:00.000Z' }, 'ok');
add('la hora nunca es motivo de rechazo: una venta de 2099', { ...venta('HORA2'), occurred_at: '2099-12-31T23:59:59.999Z' }, 'ok');
add('V-11 acepta milisegundos como numero entero', { ...venta('HORA3'), occurred_at: 1791318600000 }, 'ok');
add('V-03 acepta el maximo de 10^12', venta('MAX1', 1000000000000), 'ok');
add('V-02 acepta 20 lineas', entry('LIN20', 'venta', [...Array.from({ length: 19 }, () => line('caja', 'debe', 10, 'efectivo')), line('ventas', 'haber', 190)]), 'ok');

// ---- V-01
add('V-01 id con minusculas', { ...venta('V01A'), id: id('V01A').toLowerCase() }, 'invalid_id');
add('V-01 id de 25 caracteres', { ...venta('V01B'), id: id('V01B').slice(0, 25) }, 'invalid_id');
add('V-01 id con caracter fuera de Crockford (U)', { ...venta('V01C'), id: id('V01C').slice(0, 25) + 'U' }, 'invalid_id');
{ const e = venta('V01D'); e.lines[1].id = 'no-es-ulid'; add('V-01 id de linea invalido', e, 'invalid_id'); }

// ---- V-02
{ const e = venta('V02A'); e.lines = [e.lines[0]]; add('V-02 una sola linea', e, 'invalid_lines'); }
add('V-02 21 lineas', entry('V02B', 'venta', [...Array.from({ length: 20 }, () => line('caja', 'debe', 10, 'efectivo')), line('ventas', 'haber', 200)]), 'invalid_lines');
{ const e = venta('V02C'); e.lines[1].line_no = 3; add('V-02 line_no con hueco (1, 3)', e, 'invalid_lines'); }
{ const e = venta('V02D'); e.lines[1].line_no = 1; add('V-02 line_no repetido', e, 'invalid_lines'); }

// ---- V-03
add('V-03 monto cero', venta('V03A', 0), 'invalid_amount');
add('V-03 monto negativo', venta('V03B', -5), 'invalid_amount');
add('V-03 monto mayor a 10^12', venta('V03C', 1000000000001), 'invalid_amount');
add('V-03 monto con decimales', venta('V03D', 10.5), 'invalid_amount');

// ---- V-04
{ const e = venta('V04A'); e.lines[1].amount_minor = 1999999; add('V-04 asiento descuadrado por un centavo', e, 'unbalanced'); }
{ const e = venta('V04B'); e.lines.push({ ...line('caja', 'debe', 5, 'efectivo'), id: id('V04BX'), line_no: 3, currency: 'USDC' }); add('V-04 cuadra en COP pero no en USDC', e, 'unbalanced'); }

// ---- V-05
add('V-05 venta con la caja en el haber', entry('V05A', 'venta', [line('ventas', 'debe', 100), line('caja', 'haber', 100, 'efectivo')]), 'invalid_accounts');
add('V-05 conversion no la crea la app', entry('V05B', 'conversion', [line('caja', 'debe', 100, 'efectivo'), line('ventas', 'haber', 100)]), 'invalid_accounts');
add('V-05 abono contra ventas', entry('V05C', 'abono_cliente', [line('caja', 'debe', 100, 'efectivo'), line('ventas', 'haber', 100)]), 'invalid_accounts');
add('V-05 ajuste_caja con tres lineas', entry('V05D', 'ajuste_caja', [line('diferencias_caja', 'debe', 100), line('diferencias_caja', 'debe', 50), line('caja', 'haber', 150, 'efectivo')]), 'invalid_accounts');
add('V-05 liquidacion sin cuenta_socio', entry('V05E', 'liquidacion_psp', [line('comisiones', 'debe', 100), line('por_cobrar_psp', 'haber', 100, 'datafono_externo')]), 'invalid_accounts');
add('V-05 salida contra ventas', entry('V05F', 'salida', [line('gastos', 'debe', 100), line('ventas', 'haber', 100)]), 'invalid_accounts');
add('V-05 venta con cuenta de otro tipo (bolsillo_usd)', entry('V05G', 'venta', [line('bolsillo_usd', 'debe', 100, 'efectivo'), line('ventas', 'haber', 100)]), 'invalid_accounts');

// ---- V-06
add('V-06 caja con canal breb', entry('V06A', 'venta', [line('caja', 'debe', 100, 'breb'), line('ventas', 'haber', 100)]), 'invalid_channel');
add('V-06 cuenta_socio con datafono en una venta', entry('V06B', 'venta', [line('cuenta_socio', 'debe', 100, 'datafono_externo'), line('ventas', 'haber', 100)]), 'invalid_channel');
add('V-06 ventas con canal', entry('V06C', 'venta', [line('caja', 'debe', 100, 'efectivo'), line('ventas', 'haber', 100, 'efectivo')]), 'invalid_channel');
add('V-06 por_cobrar_psp con efectivo', entry('V06D', 'venta', [line('por_cobrar_psp', 'debe', 100, 'efectivo'), line('ventas', 'haber', 100)]), 'invalid_channel');
add('V-06 caja sin canal', entry('V06E', 'venta', [line('caja', 'debe', 100), line('ventas', 'haber', 100)]), 'invalid_channel');
add('V-06 salida por cuenta_socio con tap_to_pay', entry('V06F', 'salida', [line('gastos', 'debe', 100), line('cuenta_socio', 'haber', 100, 'tap_to_pay')]), 'invalid_channel');

// ---- V-07
add('V-07 fiado sin cliente', entry('V07A', 'venta', [line('por_cobrar_clientes', 'debe', 100, 'fiado'), line('ventas', 'haber', 100)]), 'invalid_customer');
add('V-07 cliente que no existe', entry('V07B', 'venta', [line('por_cobrar_clientes', 'debe', 100, 'fiado', id('DESCONOCIDO')), line('ventas', 'haber', 100)]), 'invalid_customer');
add('V-07 cliente en una linea que no es fiado', entry('V07C', 'venta', [line('caja', 'debe', 100, 'efectivo', CUSTOMER), line('ventas', 'haber', 100)]), 'invalid_customer');
add('V-07 el cliente llego antes en el mismo lote', entry('V07D', 'venta', [line('por_cobrar_clientes', 'debe', 100, 'fiado', id('NUEVOLOTE')), line('ventas', 'haber', 100)]), 'ok', ctx({ customers: [CUSTOMER, id('NUEVOLOTE')] }));

// ---- V-08
add('V-08 origin verificado desde la app', { ...venta('V08A'), origin: 'verificado' }, 'forbidden_origin');
add('V-08 origin on_chain desde la app', { ...venta('V08B'), origin: 'on_chain' }, 'forbidden_origin');
add('V-08 declarado con external_source', { ...venta('V08C'), external_source: 'psp' }, 'forbidden_origin');
add('V-08 declarado con external_ref', { ...venta('V08D'), external_ref: 'abc' }, 'forbidden_origin');

// ---- V-09
{
  const original = venta('V09O');
  const base = (tag, lines, over = {}) => entry(tag, 'reverso', lines, { reverses_entry_id: original.id, ...over });
  const mirror = () => [line('ventas', 'debe', 2000000), line('caja', 'haber', 2000000, 'efectivo')];
  add('V-09 reverso con otro monto', base('V09A', [line('ventas', 'debe', 1999999), line('caja', 'haber', 1999999, 'efectivo')]), 'invalid_reversal', ctx({ entries: [original] }));
  add('V-09 reverso sin invertir la direccion', base('V09B', [line('caja', 'debe', 2000000, 'efectivo'), line('ventas', 'haber', 2000000)]), 'invalid_reversal', ctx({ entries: [original] }));
  add('V-09 reverso de un asiento que no existe', base('V09C', mirror()), 'invalid_reversal', ctx());
  add('V-09 reverso de un asiento ya reversado', base('V09D', mirror()), 'invalid_reversal', ctx({ entries: [original], reversed: [original.id] }));
  add('V-09 reverso sin reverses_entry_id', base('V09E', mirror(), { reverses_entry_id: null }), 'invalid_reversal', ctx({ entries: [original] }));
  add('V-09 reverso del mismo lote (el original va antes)', base('V09F', mirror()), 'ok', ctx({ entries: [original] }));
  add('V-09 un asiento que no es reverso trae reverses_entry_id', { ...venta('V09G'), reverses_entry_id: original.id }, 'invalid_reversal', ctx({ entries: [original] }));
  const fiada = entry('V09H', 'venta', [line('por_cobrar_clientes', 'debe', 500, 'fiado', CUSTOMER), line('ventas', 'haber', 500)]);
  add('V-07 (antes que V-09) reverso con un cliente desconocido', entry('V09I', 'reverso', [line('ventas', 'debe', 500), line('por_cobrar_clientes', 'haber', 500, 'fiado', id('OTROCLIENTE'))], { reverses_entry_id: fiada.id }), 'invalid_customer', ctx({ entries: [fiada], customers: [CUSTOMER] }));
}

// ---- V-10
add('V-10 nota de 140 caracteres', { ...venta('V10A'), note: 'a'.repeat(140) }, 'ok');
add('V-10 nota de 141 caracteres', { ...venta('V10B'), note: 'a'.repeat(141) }, 'invalid_text');
add('V-10 nota que no esta en NFC', { ...venta('V10C'), note: 'café' }, 'invalid_text');
add('V-10 nota en NFC con tilde', { ...venta('V10D'), note: 'café del día' }, 'ok');

// ---- V-11
add('V-11 hora sin milisegundos', { ...venta('V11A'), occurred_at: '2026-10-06T20:30:00Z' }, 'invalid_time');
add('V-11 hora con microsegundos', { ...venta('V11B'), occurred_at: '2026-10-06T20:30:00.123456Z' }, 'invalid_time');
add('V-11 milisegundos con fraccion', { ...venta('V11C'), occurred_at: 1791318600000.5 }, 'invalid_time');
add('V-11 texto que no es una fecha', { ...venta('V11D'), occurred_at: 'ayer' }, 'invalid_time');

writeFileSync(new URL('../validation-cases.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
console.log(`${cases.length} casos`);
