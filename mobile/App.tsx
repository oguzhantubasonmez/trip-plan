import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ExpoLinking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from './src/components/Screen';
import { auth } from './src/lib/firebase';
import { MainTabNavigator } from './src/navigation/MainTabNavigator';
import type { RootStackParamList } from './src/navigation/types';
import { ThemeProvider, useAppTheme, useThemeMode } from './src/ThemeContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { ReleaseNotesGate } from './src/components/ReleaseNotesGate';
import { JoinInviteScreen } from './src/screens/JoinInviteScreen';
import type { AppTheme } from './src/theme';
import { parseTripInviteIdFromUrl } from './src/utils/tripInviteLink';

/** Sadece web: mobilde `window` polyfill olabilir ama `window.location` yok → .search patlar. */
const getInitialInviteTripId = (): string | null => {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const search = window.location.search;
    if (typeof search !== 'string') return null;
    const p = new URLSearchParams(search);
    const raw = p.get('invite');
    if (raw == null) return null;
    const id = String(raw).trim();
    if (!id) return null;
    if (typeof window.history?.replaceState === 'function') {
      window.history.replaceState({}, '', window.location.pathname || '/');
    }
    return id;
  } catch {
    return null;
  }
};
const initialInviteTripId = getInitialInviteTripId();

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  require('./src/styles/web.css');
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function AppInner() {
  const appTheme = useAppTheme();
  const { mode } = useThemeMode();
  const bootStyles = useMemo(() => createBootStyles(appTheme), [appTheme]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const pendingInviteTripIdRef = useRef<string | null>(null);
  const initialUrlHandledRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  /** Native / derin bağlantı: routewise://join/{tripId} — giriş yoksa davet kimliği bekletilir. */
  useEffect(() => {
    if (!navReady || !authReady) return;

    const handleIncoming = (url: string | null) => {
      const id = parseTripInviteIdFromUrl(url);
      if (!id) return;
      if (user && navigationRef.isReady()) {
        navigationRef.navigate('JoinInvite', { tripId: id });
      } else {
        pendingInviteTripIdRef.current = id;
      }
    };

    if (!initialUrlHandledRef.current) {
      initialUrlHandledRef.current = true;
      void ExpoLinking.getInitialURL().then(handleIncoming);
    }

    const sub = ExpoLinking.addEventListener('url', (e) => handleIncoming(e.url));
    return () => sub.remove();
  }, [navReady, authReady, user]);

  useEffect(() => {
    if (!navReady || !authReady || !user || !navigationRef.isReady()) return;
    const pending = pendingInviteTripIdRef.current;
    if (pending) {
      pendingInviteTripIdRef.current = null;
      navigationRef.navigate('JoinInvite', { tripId: pending });
    }
  }, [navReady, authReady, user]);

  /** Web: sayfa ?invite= ile açıldı, oturum yoksa kimlik giriş sonrasına saklanır. */
  useEffect(() => {
    if (!authReady) return;
    const id = String(initialInviteTripId ?? '').trim();
    if (!id || user) return;
    pendingInviteTripIdRef.current = id;
  }, [authReady, user]);

  /** Giriş sonrası doğrudan ana sekme; `?invite=` yalnızca geçerli id ile davet ekranına gider. */
  const initialSignedInRoute = useMemo(() => {
    const id = String(initialInviteTripId ?? '').trim();
    if (id.length > 0) return 'JoinInvite' as const;
    return 'Main' as const;
  }, []);

  if (!authReady) {
    return (
      <Screen>
        <View style={bootStyles.boot}>
          <ActivityIndicator color={appTheme.color.primary} />
          <Text style={bootStyles.bootText}>Hazırlanıyor…</Text>
        </View>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      </Screen>
    );
  }

  return (
    <>
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: 'fade' }}
        initialRouteName={user ? initialSignedInRoute : 'Auth'}
      >
        {!user ? (
          <>
            <Stack.Screen name="Auth">
              {() => <AuthScreen />}
            </Stack.Screen>
          </>
        ) : (
          <>
            <Stack.Screen name="Main">
              {() => <MainTabNavigator />}
            </Stack.Screen>
            <Stack.Screen
              name="JoinInvite"
              initialParams={
                initialInviteTripId ? { tripId: String(initialInviteTripId).trim() } : undefined
              }
            >
              {({ route, navigation }) => (
                <JoinInviteScreen
                  tripId={String(route.params?.tripId ?? initialInviteTripId ?? '').trim()}
                  onJoined={(tripId) =>
                    navigation.replace('Main', {
                      screen: 'HomeTab',
                      params: { screen: 'TripDetail', params: { tripId } },
                    })
                  }
                  onDecline={() => navigation.replace('Main')}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    {user ? <ReleaseNotesGate /> : null}
    </>
  );
}

function createBootStyles(theme: AppTheme) {
  return StyleSheet.create({
    boot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    bootText: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '700' },
  });
}
