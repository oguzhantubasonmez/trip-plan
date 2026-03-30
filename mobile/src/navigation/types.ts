import type { NavigatorScreenParams } from '@react-navigation/native';

export type HomeStackParamList = {
  Home: undefined;
  /** Opsiyonel başlangıç koordinatları (rota durağından açılırsa) */
  WeatherForecast: { latitude?: number; longitude?: number; label?: string } | undefined;
  CreateTrip: undefined;
  TripDetail: { tripId: string; openAddPlace?: boolean; focusComments?: boolean };
  CopyTrip: { sourceTripId: string };
  EditTrip: { tripId: string };
  FriendsHub: undefined;
  FriendInviteBrowse: undefined;
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetail: { groupId: string };
};

export type DiscoverStackParamList = {
  Discover: { focusPollId?: string } | undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  DiscoverTab: NavigatorScreenParams<DiscoverStackParamList> | undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  /** Ana sekme grubu: Ana sayfa, Keşfet, Profil */
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  JoinInvite: { tripId: string };
};
