import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { CopyTripScreen } from '../screens/CopyTripScreen';
import { CreateTripScreen } from '../screens/CreateTripScreen';
import { EditTripScreen } from '../screens/EditTripScreen';
import { FriendInviteScreen } from '../screens/FriendInviteScreen';
import { FriendsHubScreen } from '../screens/FriendsHubScreen';
import { GroupDetailScreen } from '../screens/GroupDetailScreen';
import { GroupsScreen } from '../screens/GroupsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { TripDetailScreen } from '../screens/TripDetailScreen';
import { TripPresentationScreen } from '../screens/TripPresentationScreen';
import { TripStopsDiscoverScreen } from '../screens/TripStopsDiscoverScreen';
import { WeatherForecastScreen } from '../screens/WeatherForecastScreen';
import type { HomeStackParamList } from './types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home">
        {({ navigation }) => (
          <HomeScreen
            onCreateTrip={() => navigation.navigate('CreateTrip')}
            onOpenTrip={(tripId, opts) =>
              navigation.navigate('TripDetail', {
                tripId,
                focusComments: opts?.focusComments,
              })
            }
            onOpenFriends={() => navigation.navigate('FriendsHub')}
            onOpenGroup={(groupId) => navigation.navigate('GroupDetail', { groupId })}
            onOpenWeatherForecast={(params) => navigation.navigate('WeatherForecast', params)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="WeatherForecast">
        {({ route, navigation }) => (
          <WeatherForecastScreen
            initialLatitude={route.params?.latitude}
            initialLongitude={route.params?.longitude}
            initialLabel={route.params?.label}
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
      <Stack.Screen name="TripDetail">
        {({ route, navigation }) => (
          <TripDetailScreen
            tripId={route.params.tripId}
            openAddPlace={route.params.openAddPlace}
            focusComments={route.params.focusComments}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="TripPresentation">
        {({ route, navigation }) => (
          <TripPresentationScreen
            tripId={route.params.tripId}
            initialIndex={route.params.initialIndex}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="TripStopsDiscover">
        {({ route, navigation }) => (
          <TripStopsDiscoverScreen
            tripId={route.params.tripId}
            onBack={() => navigation.goBack()}
            onAfterStopAdded={() =>
              navigation.navigate('TripDetail', { tripId: route.params.tripId })
            }
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CopyTrip">
        {({ route, navigation }) => (
          <CopyTripScreen
            sourceTripId={route.params.sourceTripId}
            onCreated={(tripId) =>
              navigation.replace('TripDetail', {
                tripId,
                openAddPlace: false,
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
    </Stack.Navigator>
  );
}
