// Pantalla 6 — Cerrar el día (dueña: Lizeth). Paso 5 del Blueprint; H4. Spec 04 §6 y §9, spec 07 D-3.
// Usa solo `src/hooks` y `src/ui`.
//
// El dueño escribe el efectivo contado (y, si quiere, lo que ve en la cuenta). Las diferencias
// se muestran con calma: un faltante o sobrante de caja queda como ajuste visible, no se borra nada.

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatoCOP, pesosACentavos, useCierre, type Diferencia } from '../../src/hooks';
import {
  Aviso,
  Boton,
  Campo,
  TecladoMonto,
  FilaLista,
  InsigniaEstadoDia,
  MontoGrande,
  Pantalla,
  Seccion,
  Tarjeta,
  Texto,
  spacing,
} from '../../src/ui';

const soloDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);

function textoDiferencia(d: Diferencia): { titulo: string; cuerpo: string } {
  const monto = formatoCOP(Math.abs(d.diferencia_minor));
  const esCaja = d.concepto === 'Efectivo en caja';
  if (d.diferencia_minor > 0)
    return {
      titulo: `${d.concepto}: sobran ${monto}`,
      cuerpo: esCaja
        ? 'Puede ser una venta que no registraste o un vuelto de más. Queda anotado como ajuste de caja, a la vista.'
        : 'Puede ser una consignación que llegó o un pago que no registraste.',
    };
  return {
    titulo: `${d.concepto}: faltan ${monto}`,
    cuerpo: esCaja
      ? 'Puede ser un vuelto o un gasto que no anotaste. Queda anotado como ajuste de caja, a la vista.'
      : 'Puede que una consignación todavía no haya llegado. Revísalo con calma mañana.',
  };
}

export default function Cierre() {
  const cierre = useCierre();
  const [efectivo, setEfectivo] = useState('');
  const [exacto, setExacto] = useState(false);
  const [cuenta, setCuenta] = useState('');
  const [error, setError] = useState<string | null>(null);

  const escribioEfectivo = exacto || efectivo !== '';
  const contado_minor = exacto ? cierre.esperado.efectivo_minor : pesosACentavos(efectivo);
  const revision = escribioEfectivo
    ? cierre.revisar({
        efectivo_contado_minor: contado_minor,
        cuenta_informada_minor: cuenta === '' ? undefined : pesosACentavos(cuenta),
      })
    : null;

  if (!cierre.sePuedeCerrar) {
    return (
      <Pantalla titulo={`Cierre del ${cierre.fechaTexto}`}>
        <InsigniaEstadoDia estado={cierre.estadoDia} texto={cierre.textoEstadoDia} />
        <Aviso tono="exito" titulo="Este día ya está cerrado">
          {cierre.estadoDia === 'sellado' ? 'Quedó sellado. Puedes verlo en tu historial.' : 'Solo falta que lo confirmes para sellarlo.'}
        </Aviso>
        {cierre.estadoDia === 'sellado' ? (
          <Boton titulo="Ver historial" onPress={() => router.push('/historial')} />
        ) : (
          <Boton titulo="Confirmar y sellar" grande onPress={() => router.push('/sellar')} />
        )}
      </Pantalla>
    );
  }

  return (
    <Pantalla
      titulo={`Cerrar el ${cierre.fechaTexto}`}
      subtitulo={`${cierre.cantidadVentas} ventas · ${formatoCOP(cierre.vendido_minor)}`}
      pie={
        <>
          {error ? <Aviso tono="error">{error}</Aviso> : null}
          <Boton
            titulo="Cerrar el día"
            grande
            deshabilitado={!escribioEfectivo}
            ayuda="Después confirmas para sellarlo"
            onPress={() => {
              const r = cierre.cerrar({ efectivo_contado_minor: contado_minor });
              if (!r.ok) return setError(r.error);
              router.replace('/sellar');
            }}
          />
        </>
      }
    >
      {cierre.diasSinCerrar.length > 0 ? (
        <Aviso tono="atencion" titulo="Quedaron días sin cerrar">
          <Texto variante="nota">Para un día pasado, contar el efectivo es opcional: lo cierras con lo registrado.</Texto>
          <View style={s.lista}>
            {cierre.diasSinCerrar.map((d) => (
              <View key={d.fecha} style={s.filaDia}>
                <Texto>{d.fechaTexto}</Texto>
                <Boton titulo="Cerrar sin contar" variante="suave" onPress={() => cierre.cerrarDiaPasado(d.fecha)} />
              </View>
            ))}
          </View>
        </Aviso>
      ) : null}

      <Seccion titulo="1. Cuenta el efectivo">
        <Tarjeta>
          <MontoGrande tamano="mediano" etiqueta="Debería haber en la caja" monto={formatoCOP(cierre.esperado.efectivo_minor)} />
          <MontoGrande
            tamano="mediano"
            etiqueta="Contaste"
            monto={exacto ? formatoCOP(cierre.esperado.efectivo_minor) : formatoCOP(pesosACentavos(efectivo))}
            detalle={exacto ? 'Está exacto' : escribioEfectivo ? undefined : 'Escribe lo que hay en la caja'}
          />
          <TecladoMonto
            valor={exacto ? '' : efectivo}
            onChange={(v) => {
              setExacto(false);
              setEfectivo(v);
              setError(null);
            }}
          />
          <Boton
            titulo={exacto ? '✓ Está exacto' : 'Está exacto'}
            variante={exacto ? 'primario' : 'secundario'}
            onPress={() => {
              setExacto(!exacto);
              setEfectivo('');
            }}
          />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="2. Revisa tu cuenta (opcional)">
        <Tarjeta>
          <FilaLista titulo="Debería haber en la cuenta" detalle="Bre-B, billeteras y consignaciones" derecha={formatoCOP(cierre.esperado.cuenta_minor)} />
          <FilaLista titulo="Por consignar" detalle="Datáfonos que aún no pagan" derecha={formatoCOP(cierre.esperado.pendiente_minor)} ultima />
          <Campo
            etiqueta="¿Cuánto ves en tu cuenta? (en pesos)"
            value={cuenta}
            onChangeText={(t) => setCuenta(soloDigitos(t))}
            keyboardType="number-pad"
            placeholder="Déjalo vacío si no lo revisaste"
          />
        </Tarjeta>
      </Seccion>

      <Aviso tono="info">Si no tienes señal, igual puedes cerrar: tu cierre queda guardado y se enviará cuando vuelva la señal.</Aviso>

      {revision ? (
        <Seccion titulo="3. Resultado">
          {revision.cuadra ? (
            <Aviso tono="exito" titulo="Todo cuadra">
              Lo que contaste es igual a lo registrado.
            </Aviso>
          ) : (
            revision.diferencias
              .filter((d) => d.diferencia_minor !== 0)
              .map((d) => {
                const t = textoDiferencia(d);
                return (
                  <Aviso key={d.concepto} tono="atencion" titulo={t.titulo}>
                    {t.cuerpo}
                  </Aviso>
                );
              })
          )}
        </Seccion>
      ) : null}
    </Pantalla>
  );
}

const s = StyleSheet.create({
  lista: { gap: spacing.s, marginTop: spacing.xs },
  filaDia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s },
});
