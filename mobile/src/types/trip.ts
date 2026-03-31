export type AttendeeRole = 'admin' | 'editor' | 'viewer';
export type RsvpStatus = 'going' | 'maybe' | 'declined';

/** Rota yaşam döngüsü — yeni rota varsayılan: planned */
export type TripPlanStatus = 'planned' | 'in_progress' | 'completed';

export type TripAttendee = {
  uid: string;
  role: AttendeeRole;
  rsvp?: RsvpStatus;
};

export type LegFromPrevious = {
  distanceKm?: number;
  durationMin?: number;
  /** driving = Google yol mesafesi; straight_line = kuş uçuşu (API yok / hata) */
  distanceBasis?: 'driving' | 'straight_line';
};

export type Trip = {
  tripId: string;
  adminId: string;
  title: string;
  startDate: string;
  endDate: string;
  /** Planlanan başlangıç saati (HH:mm, opsiyonel) */
  startTime?: string;
  /** Planlanan bitiş saati (HH:mm, opsiyonel) */
  endTime?: string;
  totalDistance?: number;
  totalFuelCost?: number;
  /** Rota için seçilen araç etiketi (örn. "Aile arabası") */
  vehicleLabel?: string;
  /** Bu rotada kullanılacak tüketim (L/100 km) – profilden bağımsız */
  tripConsumptionLPer100km?: number;
  /** Yakıt fiyatı TL/L (rota özeti için) */
  fuelPricePerLiter?: number;
  attendees: TripAttendee[];
  /** Plan durumu — oluşturulunca planned */
  planStatus: TripPlanStatus;
  /** Son yorum aktivitesi (uygulama içi okunmamış özeti için) */
  commentActivityAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

export type StopStatus = 'pending' | 'approved';

/** Tek satır ekstra masraf (aynı durakta birden fazla) */
export type StopExtraExpense = {
  expenseId: string;
  amount: number;
  extraExpenseTypeId?: string | null;
  extraExpenseTypeName?: string | null;
};

export type Stop = {
  stopId: string;
  tripId: string;
  locationName: string;
  /** Bu durağın plan günü (YYYY-MM-DD); yoksa rota başlangıç tarihi varsayılır */
  stopDate?: string;
  /** Google Places ortalama puanı (1–5), kayıt anında; yoksa işletme / veri yok */
  placeRating?: number;
  /** Google’daki değerlendirme sayısı */
  placeUserRatingsTotal?: number;
  /** Google Places `place_id` — sunumda yorum/foto/özet için (Places aramasından eklenince dolu) */
  googlePlaceId?: string;
  coords?: { latitude: number; longitude: number };
  arrivalTime?: string;
  departureTime?: string;
  cost?: number;
  /** Çoklu ekstra masraf (varsa `cost` ile birlikte toplam senkron tutulur) */
  extraExpenses?: StopExtraExpense[];
  /** Profildeki masraf türü (kaydedildiğinde anlık ad da saklanır) */
  extraExpenseTypeId?: string | null;
  extraExpenseTypeName?: string | null;
  /** Önceki duraktan bu durağa tahmini yol (km + süre) */
  legFromPrevious?: LegFromPrevious;
  status: StopStatus;
  order?: number;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}
