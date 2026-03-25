import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from './src/components/Screen';
import { auth } from './src/lib/firebase';
import { ThemeProvider, useAppTheme, useThemeMode } from './src/ThemeContext';
import { ContactsOnboardingScreen, CONTACTS_ONBOARDING_SEEN_KEY } from './src/screens/ContactsOnboardingScreen';
import { CreateGroupScreen } from './src/screens/CreateGroupScreen';
import { CreateTripScreen } from './src/screens/CreateTripScreen';
import { FriendInviteScreen } from './src/screens/FriendInviteScreen';
import { FriendsHubScreen } from './src/screens/FriendsHubScreen';
import { GroupDetailScreen } from './src/screens/GroupDetailScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { JoinInviteScreen } from './src/screens/JoinInviteScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { EditTripScreen } from './src/screens/EditTripScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import type { RootStackParamList } from './src/navigation/types';
import type { AppTheme } from './src/theme';

/** Sadece web: mobilde `window` polyfill olabilir ama `window.location` yok → .search patlar. */
const getInitialInviteTripId = (): string | null => {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const search = window.location.search;
    if (typeof search !== 'string') return null;
    const p = new URLSearchParams(search);
    const id = p.get('invite');
    if (id && typeof window.history?.replaceState === 'function') {
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
  const [booting, setBooting] = useState(true);
  const [contactsOnboardingSeen, setContactsOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(CONTACTS_ONBOARDING_SEEN_KEY);
        if (alive) setContactsOnboardingSeen(v === '1');
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** İlk kurulum: rehber tanıtımı → (isteğe bağlı) arkadaş ekranı; sonraki her açılışta doğrudan ana sayfa. */
  const initialSignedInRoute = useMemo(() => {
    if (initialInviteTripId) return 'JoinInvite' as const;
    if (contactsOnboardingSeen === false) return 'ContactsOnboarding' as const;
    return 'Home' as const;
  }, [contactsOnboardingSeen]);

  if (booting || contactsOnboardingSeen === null) {
    return (
      <Screen>
        <View style={bootStyles.boot}>
          <ActivityIndicator color={appTheme.color.primary} />
          <Text style={bootStyles.bootText}>Hazırlanıyor...</Text>
        </View>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      </Screen>
    );
  }

  return (
    <NavigationContainer>
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
            <Stack.Screen name="ContactsOnboarding">
              {({ navigation }) => (
                <ContactsOnboardingScreen
                  onDone={async () => {
                    setContactsOnboardingSeen(true);
                    navigation.replace('FriendInvite');
                  }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="FriendInvite">
              {({ navigation }) => <FriendInviteScreen onDone={() => navigation.replace('Home')} />}
            </Stack.Screen>
            <Stack.Screen
              name="JoinInvite"
              initialParams={
                initialInviteTripId ? { tripId: initialInviteTripId } : { tripId: '' }
              }
            >
              {({ route, navigation }) => (
                <JoinInviteScreen
                  tripId={route.params.tripId || initialInviteTripId || ''}
                  onJoined={(tripId) => navigation.replace('TripDetail', { tripId })}
                  onDecline={() => navigation.replace('Home')}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Home">
              {({ navigation }) => (
                <HomeScreen
                  onCreateTrip={() => navigation.navigate('CreateTrip')}
                  onOpenTrip={(tripId) => navigation.navigate('TripDetail', { tripId })}
                  onOpenProfile={() => navigation.navigate('Profile')}
                  onOpenFriends={() => navigation.navigate('FriendsHub')}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="FriendsHub">
              {({ navigation }) => (
                <FriendsHubScreen
                  onBack={() => navigation.goBack()}
                  onOpenGroups={() => navigation.navigate('Groups')}
                  onOpenContactInvite={() => navigation.navigate('FriendInviteBrowse')}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="FriendInviteBrowse">
              {({ navigation }) => (
                <FriendInviteScreen onDone={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Profile">
              {({ navigation }) => (
                <ProfileScreen
                  onBack={() => navigation.goBack()}
                  onOpenFriends={() => navigation.navigate('FriendsHub')}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Groups">
              {({ navigation }) => (
                <GroupsScreen
                  onBack={() => navigation.goBack()}
                  onCreateGroup={() => navigation.navigate('CreateGroup')}
                  onOpenGroup={(groupId) => navigation.navigate('GroupDetail', { groupId })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="CreateGroup">
              {({ navigation }) => (
                <CreateGroupScreen
                  onBack={() => navigation.goBack()}
                  onCreated={(groupId) => navigation.replace('GroupDetail', { groupId })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="GroupDetail">
              {({ route, navigation }) => (
                <GroupDetailScreen
                  groupId={route.params.groupId}
                  onBack={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="CreateTrip">
              {({ navigation }) => (
                <CreateTripScreen
                  onCreated={(tripId, opts) =>
                    navigation.replace('TripDetail', {
                      tripId,
                      openAddPlace: !opts?.skipAddPlaceModal,
                    })
                  }
                  onBack={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="EditTrip">
              {({ route, navigation }) => (
                <EditTripScreen
                  tripId={route.params.tripId}
                  onDone={() => navigation.goBack()}
                  onBack={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="TripDetail">
              {({ route, navigation }) => (
                <TripDetailScreen
                  tripId={route.params.tripId}
                  openAddPlace={route.params.openAddPlace}
                  onBack={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function createBootStyles(theme: AppTheme) {
  return StyleSheet.create({
    boot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    bootText: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '700' },
  });
}
