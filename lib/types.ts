// ─── Status & Enums ────────────────────────────────────────────────

export type TripStatus = "on-time" | "delayed" | "cancelled" | "recovered" | "rebooked";

export type RecoveryStage =
  | "progress"
  | "alternatives"
  | "itinerary"
  | "success";

export type NotificationType =
  | "disruption"
  | "recovery"
  | "update"
  | "reminder";

export type SortKey = "best-match" | "price" | "duration" | "arrival";
export type SortDirection = "asc" | "desc";

export type TravelClass = "SL" | "3A" | "2A" | "1A" | "CC" | "EC" | "3E" | "2S";

export type AvailabilityStatus = "available" | "rac" | "waitlist";

export type AppTheme = "light" | "dark" | "system";

export interface AvailabilityInfo {
  type: AvailabilityStatus;
  status?: AvailabilityStatus;
  count?: number;
  racNumber?: number;
  wlNumber?: number;
  label: string;
}

export interface RefundInfo {
  originalFare: number;
  refundAmount: number;
  status: "Requested" | "Processing" | "Refunded";
  expectedDays: string; // e.g. "5-7"
  refundMethod: string; // "original payment method"
}

export interface NearbyStation {
  name: string;
  code: string;
  travelTime: string; // e.g. "25 min"
  distance: string;   // e.g. "8 km"
  city: string;
  mainStationCode: string;
}

export interface TimelineStop {
  station: string;
  code: string;
  time: string;
  platform: string;
  type: "origin" | "halt" | "destination";
  dayOffset?: string;
}

// ─── Core Models ───────────────────────────────────────────────────

export interface Station {
  code: string;
  city: string;
  name: string;
  platform?: string;
}

export interface TrainSegment {
  trainName: string;
  trainNumber: string;
  departureStation: Station;
  arrivalStation: Station;
  fromStation?: Station;
  toStation?: Station;
  departureTime: Date;
  arrivalTime: Date;
  dayOffset?: string; // e.g. "+1 day" or "+2 days"
  status: TripStatus;
  travelClass?: TravelClass;
  coachBerth?: string;
  coach?: string;
  berth?: string;
  platform?: string;
}

export interface Trip {
  id: string;
  pnr: string; // 10-digit PNR
  passengerName: string;
  travelClass: TravelClass;
  fare: number;
  coach?: string;
  berth?: string;
  segments: TrainSegment[];
  status: TripStatus;
  neededByTime?: Date;
  disruptionReason?: string;
  recoveredAlternativeId?: string;
  refund?: RefundInfo;
  onTimeNote?: string;
  syncStatus?: "synced" | "pending" | "failed";
  isPendingSync?: boolean;
}

export interface Alternative {
  id: string;
  tripId: string;
  trainName: string;
  trainNumber: string;
  fromStation: Station;
  toStation: Station;
  departureTime: Date;
  arrivalTime: Date;
  dayOffset?: string;
  duration: number; // minutes
  changes: number; // 0 = Direct
  changeStations: string[];
  travelClass: TravelClass;
  coachBerth?: string;
  fare: number;
  originalFare: number;
  fareDifference: number;
  availability: AvailabilityInfo;
  timelineStops?: TimelineStop[];
  nearbyStationSuggestion?: NearbyStation;
}

export interface ScoreBreakdown {
  time_diff_score: number;
  berth_match_score: number;
  train_type_score: number;
  price_diff_score: number;
  overall: number;
}

export interface RankedAlternative extends Alternative {
  rank: number;
  budgetFitScore: number;    // 0-100 (weight 30)
  arrivalFitScore: number;   // 0-100 (weight 30)
  changesScore: number;      // 0-100 (weight 15)
  durationScore: number;     // 0-100 (weight 15)
  preferenceFitScore: number;// 0-100 (weight 10)
  overallScore: number;      // 0-100
  tags: string[];
  matchReason?: string;      // One plain-language reason sentence for Best Match
  score_breakdown?: ScoreBreakdown;
}

export interface Notification {
  id: string;
  tripId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  options?: ChatOption[];
  actions?: Array<{
    type: string;
    raw: string;
    payload: Record<string, string>;
    label: string;
  }>;
}

export interface ChatOption {
  label: string;
  value: string;
}

export type PriorityProfile = "balanced" | "lowest-fare" | "fastest" | "comfort";
export type SeatPreferenceType = "confirmed-only" | "confirmed-or-rac" | "any";
export type BerthPreference = "no-preference" | "lower" | "middle" | "upper" | "side-lower" | "side-upper";
export type DepartureWindow = "any" | "early-morning" | "morning" | "afternoon" | "evening" | "night";
export type DeadlineDay = "same-day" | "next-day" | "in-2-days" | "none";
export type PresetName = "best-value" | "fastest" | "comfort" | "confirmed-only" | "custom";
export type FlexibilityTolerance = 1 | 3 | 6;

export interface PresetDefinition {
  id: PresetName;
  name: string;
  tagline: string;
  fields: Partial<UserPreferences>;
}

export interface UserPreferences {
  maxBudget: number;
  classes: TravelClass[];
  onlyTheseClasses: boolean;
  seatPreference: SeatPreferenceType;
  maxChanges: number;
  departureWindow: DepartureWindow;
  deadlineDay: DeadlineDay;
  deadlineTime: string | null;
  flexibleSchedule: boolean;
  flexibilityHours: FlexibilityTolerance;
  includeNearbyStations: boolean;
  selectedNearbyStationCodes: string[];
  berthPreference: BerthPreference;
  priorityProfile: PriorityProfile;
  preset: PresetName;

  // Preserved for backward compatibility
  preferredTrains?: string[];
  preferredClass?: TravelClass | "any";
  prioritiseArrivalTime?: boolean;
  autoRecover?: boolean;
  preferredTransport?: "train" | "flight" | "bus";
  maxChangesPreference?: "any" | "direct" | "max-1" | "max-2";
  latestArrival?: string;
}

// ─── Filter State ──────────────────────────────────────────────────

export interface AlternativeFilters {
  maxFare: number | null;
  maxChanges: number | null;
  classFilter: TravelClass | "any";
  availableOnly: boolean;
  trainsOnly: string[];
  sortBy: SortKey;
  sortDirection: SortDirection;
}

// ─── App State ─────────────────────────────────────────────────────

export type BookingQuota = "GN" | "TQ" | "LD" | "SS" | "HP";
export type BookingBerthPreference = "LB" | "MB" | "UB" | "SL" | "SU" | "WS" | "NONE";

export interface BookingPassenger {
  id?: string;
  name: string;
  age: number;
  gender: "M" | "F" | "O";
  berthPreference: BookingBerthPreference;
}

export interface VibeFeedback {
  trainNumber: string;
  water: "yes" | "low" | "none";
  sockets: "all" | "some" | "broken";
  cleanliness: number;
  punctuality: "on-time" | "moderate-crawl" | "heavy-delay";
  submittedAt: number;
}

export interface AppState {
  trips: Trip[];
  selectedTripId: string | null;
  recoveryStage: RecoveryStage;
  recoveryByTripId?: Record<string, RecoveryStage>;
  filters: AlternativeFilters;
  preferences: UserPreferences;
  selectedAlternativeId: string | null;
  notifications: Notification[];
  chatMessages: ChatMessage[];
  chatInputDraft: string;
  theme: AppTheme;
  vibeRatings?: Record<string, VibeFeedback[]>;
}

// ─── Actions ───────────────────────────────────────────────────────

export type AppAction =
  | { type: "SELECT_TRIP"; tripId: string }
  | { type: "SET_RECOVERY_STAGE"; stage: RecoveryStage }
  | { type: "SET_FILTERS"; filters: Partial<AlternativeFilters> }
  | { type: "RESET_FILTERS" }
  | { type: "SELECT_ALTERNATIVE"; alternativeId: string }
  | {
      type: "CONFIRM_RECOVERY";
      tripId: string;
      alternativeId: string;
      newTrip?: Trip;
      refundAmount?: number;
      newPnr?: string;
    }
  | { type: "UPDATE_PREFERENCES"; preferences: Partial<UserPreferences> }
  | { type: "MARK_NOTIFICATION_READ"; notificationId: string }
  | { type: "MARK_ALL_NOTIFICATIONS_READ" }
  | { type: "ADD_CHAT_MESSAGE"; message: ChatMessage }
  | { type: "CLEAR_CHAT_MESSAGES" }
  | { type: "ADD_TRIP"; trip: Trip }
  | { type: "SUBMIT_VIBE_FEEDBACK"; feedback: VibeFeedback }
  | { type: "SET_CHAT_INPUT"; value: string }
  | { type: "SET_THEME"; theme: AppTheme }
  | { type: "HYDRATE_STATE"; state: Partial<AppState> }
  | { type: "MARK_TRIPS_SYNCED"; tripIds: string[] }
  | { type: "UPDATE_TRIP_SYNC_STATUS"; tripId: string; syncStatus: "synced" | "pending" | "failed" };

// ─── Context ───────────────────────────────────────────────────────

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  candidateAlternatives: Alternative[];
  alternatives: Alternative[];
  rankedAlternatives: RankedAlternative[];
  unreadCount: number;
  selectedTrip: Trip | null;
  activeTrip: Trip | null;
}

