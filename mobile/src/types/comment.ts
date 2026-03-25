export type Comment = {
  commentId: string;
  userId: string;
  message: string;
  timestamp: any;
  /** Durak yorumu */
  stopId?: string | null;
  /** Rota geneli yorum */
  tripId?: string | null;
};
