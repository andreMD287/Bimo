// Navegación del flujo (André). Los dueños de las pantallas no tocan este archivo.
// En web ancha, el flujo del dueño va dentro de un marco de teléfono; `verificar/*` usa todo el ancho.

import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { DatosProvider } from '../src/hooks';
import { color } from '../src/ui';

const ANCHO_MARCO = 420;

function Marco({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const conMarco = Platform.OS === 'web' && width > ANCHO_MARCO + 80 && !pathname.startsWith('/verificar');
  if (!conMarco) return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <View style={s.escritorio}>
      <View style={s.telefono}>{children}</View>
    </View>
  );
}

export default function Layout() {
  return (
    <DatosProvider>
      <StatusBar style="dark" />
      <Marco>
        <Stack
          screenOptions={{
            headerTintColor: color.primario,
            headerBackTitle: 'Atrás',
            contentStyle: { backgroundColor: color.fondo },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Bimo', headerShown: false }} />
          <Stack.Screen name="canales" options={{ title: 'Tus canales de cobro' }} />
          <Stack.Screen name="(comercio)/hoy" options={{ title: 'Hoy', headerBackVisible: false }} />
          <Stack.Screen name="(comercio)/venta" options={{ title: 'Registrar venta', presentation: 'modal' }} />
          <Stack.Screen name="(comercio)/movimientos" options={{ title: 'Movimientos del día' }} />
          <Stack.Screen name="(comercio)/cierre" options={{ title: 'Cerrar el día' }} />
          <Stack.Screen name="(comercio)/sellar" options={{ title: 'Confirmar y sellar' }} />
          <Stack.Screen name="(comercio)/historial" options={{ title: 'Historial' }} />
          <Stack.Screen name="(comercio)/compartir" options={{ title: 'Compartir historial' }} />
          <Stack.Screen name="verificar/[token]" options={{ title: 'Verificación de historial', headerShown: false }} />
        </Stack>
      </Marco>
    </DatosProvider>
  );
}

const s = StyleSheet.create({
  escritorio: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCDCD6', padding: 24 },
  telefono: {
    width: ANCHO_MARCO,
    height: '100%',
    maxHeight: 880,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 8,
    borderColor: '#1B1B1B',
    backgroundColor: color.fondo,
  },
});
