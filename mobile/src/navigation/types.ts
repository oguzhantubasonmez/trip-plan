import type { NavigatorScreenParams } from '@react-navigation/native';

export type HomeStackParamList = {
  Home: undefined;
  CreateTrip: undefined;
  TripDetail: { tripId: string; openAddPlace?: boolean; focusComments?: boolean };
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
