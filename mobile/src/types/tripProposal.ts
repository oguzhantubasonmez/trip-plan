export type TripProposalStatus = 'pending' | 'approved' | 'rejected';

import type { StopExtraExpense } from './trip';

export type EditStopPayload = {
  locationName?: string;
  /** YYYY-MM-DD */
  stopDate?: string | null;
  arrivalTime?: string;
  departureTime?: string;
  cost?: number;
  extraExpenseTypeId?: string | null;
  extraExpenseTypeName?: string | null;
  /** Durak ekstra masrafları (tam liste; onayda doğrudan yazılır) */
  extraExpenses?: StopExtraExpense[];
  coords?: { latitude: number; longitude: number };
  placeRating?: number | null;
  placeUserRatingsTotal?: number | null;
};

export type TripProposal = {
  proposalId: string;
  tripId: string;
  stopId: string;
  proposedBy: string;
  payload: EditStopPayload;
  status: TripProposalStatus;
  createdAt?: any;
  updatedAt?: any;
};
