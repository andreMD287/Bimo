// Pantalla 3 — Hoy (dueña: Lizeth). Paso 4 del Blueprint; H1, H3, H6, H8. Cálculos: spec 04 §9.
// Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { formatoCOP, useComercio, useHoy, useSello } from '../../src/hooks';
import {
  Aviso,
  Boton,
  FilaLista,
  InsigniaEstadoDia,
  MontoGrande,
  Pantalla,
  Seccion,
  Tarjeta,
  Texto,
  colors,
  iconoCanal,
  spacing,
} from '../../src/ui';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function Hoy() {
  const hoy = useHoy();
  const { comercio } = useComercio();
  const { pendientes } = useSello();
  const porConfirmar = pendientes.filter((p) => p.fecha !== hoy.fecha);

  return (
    <Pantalla
      titulo={mayuscula(hoy.fechaTexto)}
      subtitulo={comercio.business_name}
      pie={
        hoy.estadoDia === 'abierto' ? (
          <Boton titulo="Registrar venta" icono="＋" grande onPress={() => router.push('/venta')} />
        ) : null
      }
    >
      <InsigniaEstadoDia estado={hoy.estadoDia} texto={hoy.textoEstadoDia} />
      {comercio.avisoCuenta ? <Aviso tono="info">{comercio.avisoCuenta}</Aviso> : null}

      {porConfirmar.length > 0 ? (
        <Aviso tono="atencion" titulo={porConfirmar.length === 1 ? `${mayuscula(porConfirmar[0]!.fechaTexto)} sin sellar` : `${porConfirmar.length} días sin sellar`}>
          <Texto variante="nota">{porConfirmar[0]!.textoEstado}. Toma menos de un minuto.</Texto>
          <View style={s.avisoAccion}>
            <Boton titulo="Confirmar ahora" variante="suave" onPress={() => router.push('/sellar')} />
          </View>
        </Aviso>
      ) : null}

      <Tarjeta variante="oscura">
        <MontoGrande
          claro
          etiqueta="Vendido hoy"
          monto={formatoCOP(hoy.vendido_minor)}
          detalle={`${hoy.cantidadVentas} ${hoy.cantidadVentas === 1 ? 'venta' : 'ventas'}`}
        />
      </Tarjeta>

      {hoy.porCanal.length > 0 ? (
        <Tarjeta titulo="Por canal">
          {hoy.porCanal.map((c, i) => (
            <FilaLista
              key={c.channel}
              icono={iconoCanal(c.channel)}
              titulo={c.nombre}
              derecha={formatoCOP(c.monto_minor)}
              ultima={i === hoy.porCanal.length - 1}
            />
          ))}
        </Tarjeta>
      ) : (
        <Aviso tono="info" titulo="Aún no hay ventas hoy">
          Toca "Registrar venta" cuando llegue el primer cliente.
        </Aviso>
      )}

      <View style={s.par}>
        <Tarjeta estilo={s.mitad}>
          <MontoGrande tamano="mediano" etiqueta="Disponible" monto={formatoCOP(hoy.disponible.total_minor)} />
          <Texto variante="nota">
            Caja {formatoCOP(hoy.disponible.caja_minor)}
            {'\n'}Cuenta {formatoCOP(hoy.disponible.cuenta_minor)}
          </Texto>
        </Tarjeta>
        <Tarjeta estilo={s.mitad} variante="destacada">
          <MontoGrande tamano="mediano" etiqueta="Por consignar" monto={formatoCOP(hoy.pendiente.total_minor)} />
          <Texto variante="nota">
            {hoy.pendiente.detalle[0] ? `Lo próximo llega el ${hoy.pendiente.detalle[0].fechaTexto}` : 'Nada pendiente'}
          </Texto>
        </Tarjeta>
      </View>

      {hoy.pendiente.detalle.length > 0 ? (
        <Seccion titulo="Cuándo llega tu plata">
          <Tarjeta>
            {hoy.pendiente.detalle.map((p, i) => (
              <FilaLista
                key={`${p.nombre}-${p.fecha}-${i}`}
                icono="🗓️"
                titulo={p.nombre}
                detalle={`Llega el ${p.fechaTexto}`}
                derecha={formatoCOP(p.monto_minor)}
                ultima={i === hoy.pendiente.detalle.length - 1}
              />
            ))}
          </Tarjeta>
        </Seccion>
      ) : null}

      {hoy.teDeben.total_minor > 0 ? (
        <Seccion titulo="Te deben">
          <Tarjeta>
            {hoy.teDeben.detalle.map((c, i) => (
              <FilaLista
                key={c.customer_id}
                icono="📒"
                titulo={c.nombre}
                derecha={formatoCOP(c.monto_minor)}
                ultima={i === hoy.teDeben.detalle.length - 1}
              />
            ))}
          </Tarjeta>
        </Seccion>
      ) : null}

      <Seccion titulo="Comisiones">
        <Tarjeta>
          <FilaLista
            icono="🧾"
            titulo="Cobradas hoy"
            detalle="Lo que te descontaron en las consignaciones"
            derecha={formatoCOP(hoy.comisiones_minor)}
            colorDerecha={hoy.comisiones_minor > 0 ? colors.dangerText : undefined}
          />
          <FilaLista
            icono="📊"
            titulo="Estimadas de tus ventas de hoy"
            detalle="Se descuentan cuando llegue la plata"
            derecha={formatoCOP(hoy.comisionEstimada_minor)}
            ultima
          />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Tu día">
        <Tarjeta>
          <FilaLista icono="📋" titulo="Movimientos del día" detalle="Ver y corregir ventas" onPress={() => router.push('/movimientos')} />
          {hoy.estadoDia === 'abierto' ? (
            <FilaLista icono="🌙" titulo="Cerrar el día" detalle="Contar la caja y sellar" onPress={() => router.push('/cierre')} />
          ) : (
            <FilaLista icono="🔒" titulo="Confirmar y sellar" detalle={hoy.textoEstadoDia} onPress={() => router.push('/sellar')} />
          )}
          <FilaLista icono="📅" titulo="Historial" detalle="Tus días anteriores" onPress={() => router.push('/historial')} ultima />
        </Tarjeta>
      </Seccion>
    </Pantalla>
  );
}

const s = StyleSheet.create({
  par: { gap: spacing.m },
  mitad: {},
  avisoAccion: { marginTop: spacing.s, alignItems: 'flex-start' },
});
