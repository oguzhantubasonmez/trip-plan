export type TripProposalStatus = 'pending' | 'approved' | 'rejected';

import type { StopExtraExpense } from './trip';

export type EditStopPayload = {
  locationName?: string;
  arrivalTime?: string;
  departureTime?: string;
  cost?: number;
  extraExpenseTypeId?: string | null;
  extraExpenseTypeName?: string | null;
  /** Durak ekstra masrafları (tam liste; onayda doğrudan yazılır) */
  extraExpenses?: StopExtraExpense[];
  coords?: { latitude: number; longitude: number };
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
