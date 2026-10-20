// Pantalla 9 — Compartir historial (dueña: Lizeth desde el Entregable 4; L-09). Paso 7 del Blueprint. Spec 05 §2.
// El enlace se ve UNA sola vez, al crearlo (spec 06 §3.5): la lista solo muestra período, vistas y estado.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import {
  fechaCorta,
  useEnlaces,
  type Vigencia,
} from '../../src/hooks';
import { Aviso, Boton, Campo, ChipCanal, EstadoVacio, FilaLista, Pantalla, Seccion, Tarjeta, Texto, spacing } from '../../src/ui';

async function compartirOCopiar(url: string): Promise<'copiado' | 'compartido'> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return 'copiado';
    }
  }
  await Share.share({ message: url, url });
  return 'compartido';
}

export default function Compartir() {
  const { enlaces, periodoPosible, vigencias, crear, revocar, simulacion } = useEnlaces();
  const [porRevocar, setPorRevocar] = useState<string | null>(null);
  const [desde, setDesde] = useState(periodoPosible.desde);
  const [hasta, setHasta] = useState(periodoPosible.hasta);
  const [vigencia, setVigencia] = useState<Vigencia>(30);
  const [aviso, setAviso] = useState<{ tono: 'info' | 'exito' | 'error'; texto: string } | null>(null);
  const [ultimoUrl, setUltimoUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    setDesde(periodoPosible.desde);
    setHasta(periodoPosible.hasta);
  }, [periodoPosible.desde, periodoPosible.hasta]);

  const generar = async () => {
    if (generando) return;
    setGenerando(true);
    setAviso(null);
    const r = await crear({ desde, hasta, vigencia_dias: vigencia });
    if (!r.ok) {
      setAviso({ tono: 'error', texto: r.error });
      setGenerando(false);
      return;
    }
    setUltimoUrl(r.url);
    try {
      const modo = await compartirOCopiar(r.url);
      setAviso({ tono: 'exito', texto: modo === 'copiado' ? 'Enlace copiado. Ya lo puedes pegar donde quieras.' : 'Listo. Elige con quién compartir el enlace.' });
    } catch {
      setAviso({ tono: 'info', texto: 'Enlace creado. Cópialo de aquí abajo antes de salir de esta pantalla.' });
    }
    setGenerando(false);
  };

  return (
    <Pantalla titulo="Compartir historial" simulacion={simulacion}>
      <Texto variante="nota">
        Genera un enlace para que un banco o prestamista vea tu historial, sin crear cuenta. Solo ve los días que elijas y no puede
        cambiar nada.
      </Texto>

      <Tarjeta titulo="Período">
        <Texto variante="nota">
          Puedes compartir desde el {fechaCorta(periodoPosible.desde)} hasta el {fechaCorta(periodoPosible.hasta)} (máximo un año).
        </Texto>
        <Campo etiqueta="Desde (AAAA-MM-DD)" value={desde} onChangeText={setDesde} autoCapitalize="none" placeholder={periodoPosible.desde} />
        <Campo etiqueta="Hasta (AAAA-MM-DD)" value={hasta} onChangeText={setHasta} autoCapitalize="none" placeholder={periodoPosible.hasta} />
      </Tarjeta>

      <Tarjeta titulo="¿Por cuántos días se puede abrir?">
        <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Vigencia del enlace">
          {vigencias.map((v) => (
            <ChipCanal key={v} nombre={`${v} días`} detalle={v === 30 ? 'Recomendado' : undefined} seleccionado={v === vigencia} onPress={() => setVigencia(v)} />
          ))}
        </View>
      </Tarjeta>

      <Boton
        titulo={generando ? 'Generando…' : Platform.OS === 'web' ? 'Crear y copiar enlace' : 'Crear y compartir enlace'}
        grande
        deshabilitado={generando}
        onPress={() => {
          void generar();
        }}
      />

      {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}
      {ultimoUrl ? (
        <Tarjeta variante="destacada" titulo="Tu enlace nuevo">
          <Texto variante="cuerpoFuerte">{ultimoUrl}</Texto>
          <Texto variante="nota">Por seguridad, este enlace solo se muestra ahora. Si lo pierdes, crea uno nuevo y revoca este.</Texto>
          <Boton
            titulo={Platform.OS === 'web' ? 'Copiar de nuevo' : 'Compartir de nuevo'}
            variante="secundario"
            onPress={() => {
              void compartirOCopiar(ultimoUrl).then((modo) => {
                setAviso({ tono: 'exito', texto: modo === 'copiado' ? 'Enlace copiado.' : 'Listo para compartir.' });
              });
            }}
          />
        </Tarjeta>
      ) : null}

      <Seccion titulo="Enlaces compartidos">
        {enlaces.length === 0 ? (
          <EstadoVacio icono="🔗" titulo="Aún no has compartido tu historial" texto="Cuando crees un enlace, aquí verás cuántas veces lo abrieron." />
        ) : (
          <Tarjeta>
            {enlaces.map((e, i) => (
              <View key={e.id}>
                <FilaLista
                  icono={e.activo ? '🔗' : '⛔'}
                  titulo={e.periodoTexto}
                  detalle={`${e.activo ? `Activo · vence ${e.venceTexto}` : e.revocado ? 'Revocado' : 'Vencido'} · abierto ${e.vistas} ${e.vistas === 1 ? 'vez' : 'veces'}`}
                  derecha={e.activo ? 'Revocar' : undefined}
                  onPress={e.activo ? () => setPorRevocar(porRevocar === e.id ? null : e.id) : undefined}
                  ultima={i === enlaces.length - 1 && porRevocar !== e.id}
                />
                {porRevocar === e.id ? (
                  <View style={s.confirmar}>
                    <Texto variante="nota">Quien tenga este enlace ya no podrá abrirlo. Esto no se puede deshacer.</Texto>
                    <Boton
                      titulo="Sí, revocar enlace"
                      variante="peligro"
                      onPress={() => {
                        revocar(e.id);
                        setPorRevocar(null);
                        setAviso({ tono: 'info', texto: 'Enlace revocado. Ya no se puede abrir.' });
                      }}
                    />
                    <Boton titulo="Cancelar" variante="secundario" onPress={() => setPorRevocar(null)} />
                  </View>
                ) : null}
              </View>
            ))}
          </Tarjeta>
        )}
      </Seccion>

      {simulacion ? <Boton titulo="Ver como verificador" variante="secundario" onPress={() => router.push('/verificar/demo')} /> : null}
      <Boton titulo="Volver" variante="secundario" onPress={() => router.back()} />
    </Pantalla>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  confirmar: { gap: spacing.s, paddingVertical: spacing.m },
});
