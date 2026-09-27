# Propuesta de André — Bimo

## El problema
Los pequeños comercios en Colombia que empiezan a aceptar pagos por varios canales (efectivo, Bre-B, tarjeta) no tienen una forma unificada de ver su plata ni de conciliarla, y terminan pagando comisiones altas o esperando días para poder usarla.

## ¿Quién lo sufre?
Tenderos y comercios pequeños no cripto-nativos que ya usan Bre-B para cobrar y que ahora empiezan a considerar aceptar tarjeta, sobre todo con la llegada de Tap to Pay de Apple a LATAM. Son negocios que manejan poco margen y para los que cada punto de comisión o cada día de espera por su dinero sí pesa en el flujo de caja.

## ¿Cómo se resuelve hoy y qué cuesta?
Hoy cada canal vive en su propio mundo: una app o cuenta para Bre-B y, si aceptan tarjeta, un datáfono o PSP aparte (tipo SumUp). Eso obliga al comercio a conciliar manualmente cuánto le entró por cada lado. Las comisiones de tarjeta suelen estar entre 2% y 4% por transacción, y la plata que cobran por ese canal normalmente no queda disponible de inmediato sino que se liquida en 1 o 2 días hábiles. En la práctica el tendero no tiene una sola cuenta de "esto es lo que tengo hoy", sino que arma esa foto a mano.

## ¿Por qué creo que blockchain podría aportar?
Mi hipótesis es que usar una capa de settlement en Stellar/USDC por debajo de los distintos rieles (Bre-B, tarjeta) permitiría liquidar casi al instante y llevar un único registro del dinero del comercio, en vez de que cada canal tenga su propia contabilidad separada. Esto ataca directamente el punto de eliminar un intermediario que hoy concentra la confianza y retiene la plata durante la liquidación, y además deja un histórico único e inalterable que facilita la conciliación en vez de hacerla a mano.
