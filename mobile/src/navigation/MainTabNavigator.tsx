import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useAppTheme } from '../ThemeContext';
import { HomeStackNavigator } from './HomeStackNavigator';
import type {
  DiscoverStackParamList,
  MainTabParamList,
  ProfileStackParamList,
} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const DiscoverStack = createNativeStackNavigator<DiscoverStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function DiscoverStackNavigator({
  tabNavigation,
}: {
  tabNavigation: BottomTabNavigationProp<MainTabParamList>;
}) {
  return (
    <DiscoverStack.Navigator screenOptions={{ headerShown: false }}>
      <DiscoverStack.Screen name="Discover">
        {({ route }) => (
          <DiscoverScreen
            focusPollId={route.params?.focusPollId}
            onOpenFriends={() =>
              tabNavigation.navigate('HomeTab', { screen: 'FriendsHub' })
            }
            onNavigateCreateTripWithSecondStop={(p) =>
              tabNavigation.navigate('HomeTab', {
                screen: 'CreateTrip',
                params: { secondStopFromDiscover: p },
              })
            }
            onOpenTrip={(tripId) =>
              tabNavigation.navigate('HomeTab', {
                screen: 'TripDetail',
                params: { tripId },
              })
            }
          />
        )}
      </DiscoverStack.Screen>
    </DiscoverStack.Navigator>
  );
}

function ProfileStackNavigator({
  tabNavigation,
}: {
  tabNavigation: BottomTabNavigationProp<MainTabParamList>;
}) {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile">
        {() => (
          <ProfileScreen
            variant="tab"
            onOpenFriends={() =>
              tabNavigation.navigate('HomeTab', { screen: 'FriendsHub' })
            }
            onOpenSavedPlace={(googlePlaceId) =>
              tabNavigation.navigate('HomeTab', {
                screen: 'Home',
                params: { openDiscoverPlaceId: googlePlaceId },
              })
            }
          />
        )}
      </ProfileStack.Screen>
    </ProfileStack.Navigator>
  );
}

export function MainTabNavigator() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const tabBarPadBottom = Math.max(insets.bottom, 10);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.primaryDark,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
          paddingTop: 6,
          paddingBottom: tabBarPadBottom,
          height: 48 + tabBarPadBottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        options={{
          title: 'Ana sayfa',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      >
        {() => <HomeStackNavigator />}
      </Tab.Screen>
      <Tab.Screen
        name="DiscoverTab"
        options={{
          title: 'Keşfet',
          tabBarIcon: ({ color, size }) => <Ionicons name="rocket" color={color} size={size} />,
        }}
      >
        {({ navigation }) => <DiscoverStackNavigator tabNavigation={navigation} />}
      </Tab.Screen>
      <Tab.Screen
        name="ProfileTab"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      >
        {({ navigation }) => <ProfileStackNavigator tabNavigation={navigation} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
