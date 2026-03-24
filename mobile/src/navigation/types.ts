export type RootStackParamList = {
  PhoneLogin: undefined;
  ContactsOnboarding: undefined;
  FriendInvite: undefined;
  Home: undefined;
  JoinInvite: { tripId: string };
  Profile: undefined;
  FriendsHub: undefined;
  FriendInviteBrowse: undefined;
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetail: { groupId: string };
  CreateTrip: undefined;
  EditTrip: { tripId: string };
  TripDetail: { tripId: string; openAddPlace?: boolean };
};
