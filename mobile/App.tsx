import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from './src/components/Screen';
import { auth } from './src/lib/firebase';
import { ContactsOnboardingScreen, CONTACTS_ONBOARDING_SEEN_KEY } from './src/screens/ContactsOnboardingScreen';
import { CreateTripScreen } from './src/screens/CreateTripScreen';
import { FriendInviteScreen } from './src/screens/FriendInviteScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PhoneLoginScreen } from './src/screens/PhoneLoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { theme } from './src/theme';

if (typeof window !== 'undefined') {
  require('./src/styles/web.css');
}

type RootStackParamList = {
  PhoneLogin: undefined;
  ContactsOnboarding: undefined;
  FriendInvite: undefined;
  Home: undefined;
  Profile: undefined;
  CreateTrip: undefined;
  TripDetail: { tripId: string; openAddPlace?: boolean };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
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

  const initialSignedInRoute = useMemo(() => {
    if (contactsOnboardingSeen === false) return 'ContactsOnboarding' as const;
    return 'FriendInvite' as const;
  }, [contactsOnboardingSeen]);

  if (booting || contactsOnboardingSeen === null) {
    return (
      <Screen>
        <View style={styles.boot}>
          <ActivityIndicator />
          <Text style={styles.bootText}>Hazırlanıyor...</Text>
        </View>
        <StatusBar style="light" />
      </Screen>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: 'fade' }}
        initialRouteName={user ? initialSignedInRoute : 'PhoneLogin'}
      >
        {!user ? (
          <>
            <Stack.Screen name="PhoneLogin">
              {() => <PhoneLoginScreen />}
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
            <Stack.Screen name="Home">
              {({ navigation }) => (
                <HomeScreen
                  onCreateTrip={() => navigation.navigate('CreateTrip')}
                  onOpenTrip={(tripId) => navigation.navigate('TripDetail', { tripId })}
                  onOpenProfile={() => navigation.navigate('Profile')}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Profile">
              {({ navigation }) => <ProfileScreen onBack={() => navigation.goBack()} />}
            </Stack.Screen>
            <Stack.Screen name="CreateTrip">
              {({ navigation }) => (
                <CreateTripScreen
                  onCreated={(tripId) =>
                    navigation.replace('TripDetail', { tripId, openAddPlace: true })
                  }
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

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  bootText: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '700' },
});
