// Pantalla 7 — Confirmar y sellar (dueña: Lizeth). Paso 6 del Blueprint. Spec 07 §1 (D-4, D-5) y §6.
// Usa solo `src/hooks` y `src/ui`. Face ID y el sello se SIMULAN (etiqueta "Simulación").
// Si hay varios días pendientes, un solo "Confirmar con Face ID" los confirma todos.

import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { formatoCOP, useSello } from '../../src/hooks';
import {
  Aviso,
  Boton,
  FilaLista,
  InsigniaEstadoDia,
  Pantalla,
  Seccion,
  Tarjeta,
  Texto,
  colors,
  spacing,
  EtiquetaSimulacion,
} from '../../src/ui';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function Sellar() {
  const sello = useSello();
  // El resumen se guarda al confirmar: cuando termina, ya no quedan días pendientes.
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const resumen = confirmado ?? sello.resumen;

  if (sello.fase === 'nada') {
    return (
      <Pantalla titulo="Confirmar y sellar" simulacion={sello.simulacion}>
        <Aviso tono="exito" titulo="Estás al día">
          No hay días por confirmar. Cuando cierres el día, lo confirmas aquí.
        </Aviso>
        <Boton titulo="Volver a Hoy" onPress={() => router.replace('/hoy')} />
        <Boton titulo="Ver historial" variante="secundario" onPress={() => router.push('/historial')} />
      </Pantalla>
    );
  }

  if (sello.fase === 'confirmando' || sello.fase === 'guardando') {
    return (
      <Pantalla titulo="Confirmar y sellar" simulacion={sello.simulacion}>
        <View style={s.centro}>
          <View style={s.circulo}>
            {sello.fase === 'confirmando' ? (
              <Texto variante="montoGrande">🙂</Texto>
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )}
          </View>
          <Texto variante="subtitulo" centrado>
            {sello.textoFase}
          </Texto>
          <Texto variante="nota" centrado>
            {resumen}
          </Texto>
          {sello.fase === 'guardando' ? <InsigniaEstadoDia estado="firmado" texto={sello.textoFase} /> : null}
        </View>
      </Pantalla>
    );
  }

  if (sello.fase === 'sellado') {
    return (
      <Pantalla
        titulo="Confirmar y sellar"
        simulacion={sello.simulacion}
        pie={
          <>
            <Boton titulo="Volver a Hoy" grande onPress={() => router.replace('/hoy')} />
            <Boton titulo="Compartir mi historial" variante="secundario" onPress={() => router.push('/compartir')} />
          </>
        }
      >
        <View style={s.centro}>
          <View style={[s.circulo, s.circuloOk]}>
            <Texto variante="montoGrande">🔒</Texto>
          </View>
          <Texto variante="titulo" centrado>
            {sello.textoFase}
          </Texto>
          <Texto centrado>{resumen.replace(/^Sellar /, 'Sellaste ')}</Texto>
          <Texto variante="nota" centrado>
            Desde ahora nadie puede cambiar estas ventas sin que se note, ni siquiera Bimo. Si algo estaba mal, se corrige con un ajuste a la vista.
          </Texto>
        </View>
      </Pantalla>
    );
  }

  // fase 'listo'
  return (
    <Pantalla
      titulo="Confirmar y sellar"
      simulacion={sello.simulacion}
      pie={
        <>
          <Boton
            titulo="Confirmar con Face ID"
            icono="🙂"
            grande
            ayuda="Confirma con tu cara y se sellan los días de la lista"
            onPress={() => {
              setConfirmado(sello.resumen);
              void sello.confirmar();
            }}
          />
          {/* Face ID real llega con el development build (incremento 2); en la web y en Expo Go es simulado */}
          <View style={s.faceIdSimulado}>
            <EtiquetaSimulacion />
            <Texto variante="nota">En esta versión, Face ID se simula.</Texto>
          </View>
        </>
      }
    >
      <Tarjeta variante="oscura">
        <Texto variante="subtitulo" color={colors.white}>
          {mayuscula(sello.resumen)}
        </Texto>
        <Texto variante="nota" color={colors.lilac}>
          Revisa que esté bien. Al confirmar, este cierre queda guardado y nadie lo puede cambiar sin que se note.
        </Texto>
      </Tarjeta>

      {sello.error ? (
        <Aviso tono="error" titulo="No pudimos confirmar">
          <Texto variante="nota">{sello.error}</Texto>
          <Texto variante="nota">Arriba está el resumen al día. Revísalo y confirma de nuevo.</Texto>
        </Aviso>
      ) : null}

      {sello.pendientes.length > 1 ? (
        <Aviso tono="info" titulo={`Tienes ${sello.pendientes.length} días por confirmar`}>
          Los confirmas todos juntos, con un solo Face ID.
        </Aviso>
      ) : null}

      <Seccion titulo={sello.pendientes.length === 1 ? 'Día por confirmar' : 'Días por confirmar'}>
        <Tarjeta>
          {sello.pendientes.map((p, i) => (
            <View key={p.fecha} style={s.dia}>
              <FilaLista
                titulo={mayuscula(p.fechaTexto)}
                detalle={`${p.cantidadVentas} ${p.cantidadVentas === 1 ? 'venta' : 'ventas'}`}
                derecha={formatoCOP(p.vendido_minor)}
                ultima
              />
              <InsigniaEstadoDia estado={p.esEnmienda ? 'requiere_enmienda' : 'cerrado'} texto={p.textoEstado} />
              {i < sello.pendientes.length - 1 ? <View style={s.separador} /> : null}
            </View>
          ))}
        </Tarjeta>
      </Seccion>
    </Pantalla>
  );
}

const s = StyleSheet.create({
  centro: { alignItems: 'center', gap: spacing.l, paddingTop: spacing.xxl },
  circulo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circuloOk: { backgroundColor: colors.success },
  dia: { gap: spacing.s },
  faceIdSimulado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s },
  separador: { height: 1, backgroundColor: colors.border, marginTop: spacing.s },
});
