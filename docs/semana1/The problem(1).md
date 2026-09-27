# Decisión del problema

## Problema elegido

Los pequeños comercios en Colombia tienen dificultades para llevar un registro claro y unificado del dinero que reciben por varios métodos de pago distintos, cada uno con su propio tiempo de consignación.

## Por qué elegimos este

Identificamos que es un problema real que incluso personas conocidas viven en sus propios negocios pequeños. Sabiendo que una gran parte de los colombianos trabaja en pymes y que en la mayoría de los casos son negocios propios e informales, creemos que simplificar el proceso de llevar un registro contable rápido y accesible es valioso tanto en el contexto colombiano como en realidades similares en Latinoamérica. A diferencia de las otras ideas discutidas, esta tenía un dolor claro y verificable, el cuadrar a mano las transferencias Bre-B, los datáfonos y las billeteras digitales (Nequi, Daviplata); y un público con el que podíamos hablar directamente.

## Propuestas descartadas

- **Lizeth  — Los artistas y coleccionistas no tienen una forma confiable de verificar la autenticidad y el historial de propiedad de una obra.** descartada porque es muy nicho el objetivo y no convence a los desarrollados por escalabilidad e integración.  
- **Santiago — Las pymes que venden a crédito a clientes grandes no tienen liquidez inmediata para cubrir sus gastos operativos mientras esperan que les paguen.** descartada porque se desconoce aún la veracidad de los problemas como es acceso a las pymes para ayudar, como la confianza e integración.

## Cómo tomamos la decisión

Después de una lluvia de ideas abierta, el equipo discutió las propuestas de forma informal, sin hacer una votación formal. Cuando André presentó el problema de la conciliación de pagos, el resto del equipo lo reconoció como el de mayor impacto real, y la decisión se tomó por consenso: la aceptación fue unánime.

# BIMO: "Las cuentas claras y el chocolate espeso"

## Encabezado

**Proyecto:** BIMO **En una frase:** Un registro unificado e inalterable de transacciones que le permite a los pequeños comercios colombianos ver, en un solo lugar, todo el dinero que se mueve por Bre-B, datáfonos y billeteras virtuales.

## Equipo y roles

| Integrante | Usuario de GitHub | Rol | Responsable de entregas |
| :---- | :---- | :---- | :---- |
| André | andreMD287 | Blockchain / desarrollo full-stack (Stellar, backend) | Sí |
| Santiago Pardo | dpardogo | Desarrollo | Sí |
| Lizeth Rico | ricoththth | Diseño | Sí |

**Canal de coordinación interna:** Nos comunicamos principalmente por un grupo de Whatsapp al no ser un equipo grande no parece una necesidad tener un canal más robusto.

## Problema y evidencia

En 2022 las pymes representaron el 99,5% de las empresas formales en Colombia\*, y según el DANE, el empleo informal ocupa al 54,6% de la población colombiana\*\*. Una parte importante de estos negocios desde tiendas de barrio hasta vendedores ambulantes hoy recibe dinero por varios canales a la vez: efectivo, transferencias Bre-B y pagos con tarjeta procesados por proveedores como Bold, Redeban o Credibanco. Cada canal consigna a la cuenta del dueño en un tiempo distinto, a veces el mismo día, a veces días después, y cada uno queda como un registro aislado y desconectado de los demás. Hemos observado esto directamente en conversaciones con dueños de pequeños negocios que conocemos, quienes llevan la cuenta de sus ventas escribiendo totales a mano o revisando varias aplicaciones al final del día, sin un solo lugar que muestre qué entró realmente y cuándo. No es un inconveniente ocasional: ocurre todos los días que el negocio abre, con cada venta que no se paga en efectivo al instante. El problema crece con la cantidad de métodos de pago que acepta el negocio, algo cada vez más común a medida que los pagos digitales especialmente Bre-B y billeteras digitales que se extienden en el comercio informal colombiano.

\*\[cita: [https://www.bbvaresearch.com/wp-content/uploads/2024/02/202401\_MiPymes\_Colombia-1.pdf](https://www.bbvaresearch.com/wp-content/uploads/2024/02/202401_MiPymes_Colombia-1.pdf) \] \*\*\[cita: [https://www.dane.gov.co/index.php/estadisticas-por-tema/mercado-laboral/empleo-informal-y-seguridad-social](https://www.dane.gov.co/index.php/estadisticas-por-tema/mercado-laboral/empleo-informal-y-seguridad-social) \]

## Usuario y actores

Quien sufre este problema es el dueño de un negocio pequeño o informal (tendero, vendedor ambulante, microempresario) que maneja personalmente el dinero de su negocio, usualmente sin contador ni software contable. Necesita saber, al final de cada día o semana, cuánto dinero ganó y dónde está ese dinero en ese momento entre la caja, cuenta bancaria o billeteras digitales para poder pagar proveedores, reponer inventario o simplemente saber si el negocio es rentable. Hoy lo resuelve sumando recibos a mano, revisando varias aplicaciones bancarias o de pagos, y llevando cuadernos o hojas de cálculo, lo que le cuesta tiempo todos los días e introduce errores que pueden pasar desapercibidos durante semanas.

Otros actores en el flujo son: el cliente, que elige cómo pagar; los proveedores de servicios de pago (PSP) como Bold, Redeban y Credibanco, que procesan los pagos con tarjeta y consignan el dinero según su propio calendario; el banco o billetera digital que recibe las transferencias Bre-B; y, de forma indirecta, cualquier empleado de confianza que cobre en nombre del dueño, quien también necesita una forma de reportar lo recaudado.

## Flujo actual de valor

1. Un cliente paga en el negocio usando uno de varios métodos: Efectivo, un pago por billetera digital, una transferencia Bre-B, o una tarjeta pasada/acercada a un datáfono de un PSP (Bold, Redeban o Credibanco).  
2. Con efectivo, el dinero va directo a la caja; no queda registro hasta que el dueño lo cuenta.  
3. Con Bre-B, la transferencia llega a la cuenta del dueño casi de inmediato, pero solo aparece dentro de esa aplicación bancaria específica.  
4. Con pagos con tarjeta, el PSP autoriza la transacción al instante, pero no consigna el dinero de inmediato: Bold, Redeban y Credibanco aplican cada uno su propio tiempo de consignación (comúnmente 1 a 2 días hábiles) antes de que el dinero llegue a la cuenta del dueño, y cada uno cobra su propia comisión.  
5. Al final del día, el dueño debe abrir cada aplicación o cuenta por separado, además de contar el efectivo físico, para reconstruir el total de ventas.  
6. Este paso de conciliación manual no responde a ninguna obligación normativa: existe únicamente porque ningún canal se comunica con los demás.

## Fricciones identificadas

- **En el paso de consignación (PSP → cuenta bancaria):** Bold, Redeban y Credibanco consignan en tiempos distintos, así que el dinero "ganado" hoy puede no verse reflejado en la cuenta durante 1 o 2 días, dificultando saber cuánto efectivo hay realmente disponible.  
- **En el paso de conciliación de fin de día:** el dueño debe cruzar manualmente el efectivo, Bre-B y cada aplicación de PSP, lo que le cuesta entre 15 y 30 minutos diarios y es propenso a errores humanos como transacciones que se pasan por alto o conteos duplicados.  
- **En el paso de registro:** no existe un historial único y a prueba de manipulación de las transacciones; los registros viven en cuadernos, en la memoria o en aplicaciones desconectadas entre sí, lo cual afecta directamente al dueño y, de forma indirecta, a cualquiera que más adelante necesite auditar o verificar los ingresos del negocio por ejemplo, para solicitar un crédito.  
- **En el paso de costos y comisiones:** cada PSP cobra comisiones distintas **por transacción,** en muchos casos, difíciles de rastrear sin una vista consolidada, lo que le dificulta al dueño conocer su margen neto real por cada método de pago.

## Oportunidad e hipótesis

Entre estas fricciones, priorizamos la falta de un registro único y confiable, además de los altos costos de comisiones y demoras distintas que representan un coste alto para negocios muy pequeños. Elegimos esta oportunidad puesto que representa el dolor más grande para el usuario, a saber, la incertidumbre de la demora real de la transacción, el tiempo que le toma unificar sus fuentes de ingreso y las altas comisiones de las PSP que para un negocio pequeño puede no justificarse.

Nuestra hipótesis es que registrar cada transacción (sin importar el canal) en un libro contable compartido y de solo adición le permitiría al dueño de un negocio pequeño ver un total exacto y siempre consistente, en lugar de conciliar varias fuentes a mano. Por otro lado, un sistema más accesible daría paso a una mayor adopción de pagos digitales. Para el usuario, esto significaría no tener que cuadrar cuentas manualmente al final del día, menos errores que pasen desapercibidos, y un historial confiable que eventualmente podría mostrarle a un banco o proveedor sin trabajo adicional.

## Criterio de pertinencia

Este caso es un buen candidato para un registro distribuido e inalterable, en lugar de una base de datos tradicional o una simple integración entre sistemas existentes, por dos de los criterios de la Sesión 1\. Primero, el registro necesita ser a prueba de manipulación: hablamos de un libro contable que refleja transacciones reales, así que los registros pasados no pueden modificarse en silencio; el dueño de un negocio pequeño necesita confiar en que los números de ayer no van a cambiar, especialmente si ese registro se llega a mostrar a un tercero como un banco. Segundo, varias partes que no confían plenamente entre sí necesitan compartir la misma versión de la verdad: el dueño del negocio, los PSP y, potencialmente, futuras contrapartes (proveedores, prestamistas) actualmente ven imágenes distintas y parciales del mismo flujo de dinero, sin una fuente de verdad compartida entre ellos. Una base de datos tradicional solo resuelve esto si se confía en que una sola parte la administre y nunca la altere, lo cual va en contra del propósito aquí, ya que toda la fricción surge precisamente de registros fragmentados y no verificables que llevan actores desconectados entre sí.

## Supuestos y riesgos

1. Suponemos que los dueños de negocios pequeños e informales están dispuestos a adoptar una nueva herramienta digital para registrar sus transacciones, aunque muchos hoy dependen de métodos manuales. Si esto es erróneo, es decir, los dueños no ven ningún valor más allá de lo que ya hacen a mano, la hipótesis se cae sin importar la tecnología detrás.  
2. Suponemos que tener un registro compartido e inalterable es algo que los dueños realmente valoran (por confianza, para mostrárselo a un banco, o por tranquilidad propia), y no solo un detalle técnico. Si a los dueños no les importa la inalterabilidad histórica y solo quieren un total simple, una herramienta mucho más sencilla —sin blockchain— podría resolver el mismo problema, lo cual invalidaría nuestra hipótesis específica sobre la pertinencia de blockchain.

