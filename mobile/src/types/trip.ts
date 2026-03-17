export type AttendeeRole = 'admin' | 'editor' | 'viewer';
export type RsvpStatus = 'going' | 'maybe' | 'declined';

export type TripAttendee = {
  uid: string;
  role: AttendeeRole;
  rsvp?: RsvpStatus;
};

export type Trip = {
  tripId: string;
  adminId: string;
  title: string;
  startDate: string;
  endDate: string;
  totalDistance?: number;
  totalFuelCost?: number;
  attendees: TripAttendee[];
  createdAt?: any;
  updatedAt?: any;
};

export type StopStatus = 'pending' | 'approved';

export type Stop = {
  stopId: string;
  tripId: string;
  locationName: string;
  coords?: { latitude: number; longitude: number };
  arrivalTime?: string;
  departureTime?: string;
  cost?: number;
  status: StopStatus;
  order?: number;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}
