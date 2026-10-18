// Pantalla 9 — Compartir historial (dueño: Santiago). Paso 7 del Blueprint. Spec 05 §2.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';
import {
  fechaCorta,
  useEnlaces,
  type Vigencia,
} from '../../src/hooks';
import { Boton, Campo, FilaLista, Pantalla, Tarjeta, Texto } from '../../src/ui';

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
  const { enlaces, periodoPosible, vigencias, crear, revocar } = useEnlaces();
  const [desde, setDesde] = useState(periodoPosible.desde);
  const [hasta, setHasta] = useState(periodoPosible.hasta);
  const [vigencia, setVigencia] = useState<Vigencia>(30);
  const [aviso, setAviso] = useState<string | null>(null);
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
      setAviso(r.error);
      setGenerando(false);
      return;
    }
    setUltimoUrl(r.url);
    try {
      const modo = await compartirOCopiar(r.url);
      setAviso(modo === 'copiado' ? 'Enlace copiado. Ya lo puedes pegar donde quieras.' : 'Listo. Elige con quién compartir el enlace.');
    } catch {
      setAviso('Enlace creado. Cópialo desde la lista o ábrelo como verificador.');
    }
    setGenerando(false);
  };

  return (
    <Pantalla titulo="Compartir historial" simulacion>
      <Texto variante="nota">
        Genera un enlace para que un banco o prestamista vea tu historial, sin crear cuenta.
      </Texto>

      <Tarjeta>
        <Texto variante="subtitulo">Período</Texto>
        <Texto variante="nota">
          Puedes compartir desde {fechaCorta(periodoPosible.desde)} hasta {fechaCorta(periodoPosible.hasta)}.
        </Texto>
        <Campo
          etiqueta="Desde (AAAA-MM-DD)"
          value={desde}
          onChangeText={setDesde}
          autoCapitalize="none"
          placeholder={periodoPosible.desde}
        />
        <Campo
          etiqueta="Hasta (AAAA-MM-DD)"
          value={hasta}
          onChangeText={setHasta}
          autoCapitalize="none"
          placeholder={periodoPosible.hasta}
        />
      </Tarjeta>

      <Tarjeta>
        <Texto variante="subtitulo">Vigencia del enlace</Texto>
        <Texto variante="nota">¿Por cuántos días puede abrirse?</Texto>
        {vigencias.map((v) => (
          <Boton
            key={v}
            titulo={`${v} días${v === vigencia ? ' · elegido' : ''}`}
            variante={v === vigencia ? 'primario' : 'secundario'}
            onPress={() => setVigencia(v)}
          />
        ))}
      </Tarjeta>

      <Boton
        titulo={generando ? 'Generando…' : 'Generar enlace'}
        deshabilitado={generando}
        onPress={() => {
          void generar();
        }}
      />

      {aviso ? <Texto variante="nota">{aviso}</Texto> : null}
      {ultimoUrl ? (
        <Tarjeta>
          <Texto variante="nota">Último enlace</Texto>
          <Texto>{ultimoUrl}</Texto>
          <Boton
            titulo={Platform.OS === 'web' ? 'Copiar de nuevo' : 'Compartir de nuevo'}
            variante="secundario"
            onPress={() => {
              void compartirOCopiar(ultimoUrl).then((modo) => {
                setAviso(modo === 'copiado' ? 'Enlace copiado.' : 'Listo para compartir.');
              });
            }}
          />
        </Tarjeta>
      ) : null}

      <Texto variante="subtitulo">Enlaces creados</Texto>
      {enlaces.length === 0 ? (
        <Texto variante="nota">Aún no has creado enlaces.</Texto>
      ) : (
        enlaces.map((e) => (
          <FilaLista
            key={e.id}
            titulo={e.periodoTexto}
            detalle={
              e.activo
                ? `Vence ${e.venceTexto} · abierto ${e.vistas} veces`
                : e.revocado
                  ? `Revocado · abierto ${e.vistas} veces`
                  : `Vencido · abierto ${e.vistas} veces`
            }
            derecha={e.activo ? 'Revocar' : undefined}
            onPress={
              e.activo
                ? () => {
                    revocar(e.id);
                    setAviso('Enlace revocado. Ya no se puede abrir.');
                  }
                : undefined
            }
          />
        ))
      )}

      <Boton titulo="Ver como verificador" variante="secundario" onPress={() => router.push('/verificar/demo')} />
      <Boton titulo="Volver al historial" variante="secundario" onPress={() => router.back()} />
    </Pantalla>
  );
}
