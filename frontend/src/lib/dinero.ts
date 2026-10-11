// Dinero: siempre enteros en unidades mínimas (COP en centavos, spec 01 §1).
// Nunca se usa un número con decimales para un monto.

function agruparMiles(entero: string): string {
  let out = '';
  for (let i = 0; i < entero.length; i++) {
    if (i > 0 && (entero.length - i) % 3 === 0) out += '.';
    out += entero[i];
  }
  return out;
}

/** 2000000 → "$ 20.000"; 2000050 → "$ 20.000,50"; -500000 → "-$ 5.000". */
export function formatoCOP(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new Error('monto no entero');
  const abs = Math.abs(centavos);
  const pesos = (abs - (abs % 100)) / 100;
  const resto = abs % 100;
  const texto = `$ ${agruparMiles(String(pesos))}${resto === 0 ? '' : ',' + String(resto).padStart(2, '0')}`;
  return centavos < 0 ? `-${texto}` : texto;
}

/** Pesos enteros tecleados en el teclado de monto → centavos. "20000" → 2000000. */
export function pesosACentavos(pesos: string): number {
  const limpio = pesos.replace(/\D/g, '');
  if (limpio === '') return 0;
  return Number(limpio) * 100;
}

/**
 * Comisión estimada de un canal.
 *
 * Regla: comision = monto_centavos × bps / 10.000, redondeada al centavo más
 * cercano (las mitades suben). Se calcula solo con enteros (BigInt), porque
 * monto × bps puede pasar de 2^53:
 *   (monto × bps + 5.000) / 10.000, con división entera.
 * Ejemplo: $ 100.000 (10.000.000 centavos) al 1,5 % (150 bps) = 150.000 centavos = $ 1.500.
 */
export function comisionEstimada(montoCentavos: number, bps: number): number {
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos < 0) throw new Error('monto inválido');
  if (!Number.isSafeInteger(bps) || bps < 0) throw new Error('bps inválido');
  return Number((BigInt(montoCentavos) * BigInt(bps) + 5000n) / 10000n);
}

/** Texto de un porcentaje en bps: 150 → "1,5 %"; 300 → "3 %". */
export function formatoBps(bps: number): string {
  const entero = (bps - (bps % 100)) / 100;
  const dec = String(bps % 100).padStart(2, '0').replace(/0+$/, '');
  return dec === '' ? `${entero} %` : `${entero},${dec} %`;
}
