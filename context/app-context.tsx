"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  AppAction,
  AppContextValue,
  Alternative,
  RankedAlternative,
  Trip,
  UserPreferences,
  TravelClass,
} from "@/lib/types";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES, DEFAULT_THEME } from "@/lib/constants";
import { evaluateAlternatives, getActiveTrip } from "@/lib/matching";
import { loadPersistedState, savePersistedState } from "@/context/state-storage";
import {
  getAllTrips,
  getAllDisruptions,
  getTrainsBetween,
  dbTripToAppTrip,
  dbDisruptionToNotification,
  isTableMissing,
} from "@/lib/data";
import { getTodayIST, formatISTDate, type JourneyItinerary } from "@/lib/journeys";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { processSyncQueue, getPendingSyncs } from "@/lib/data/sync-queue";

const initialState: AppState = {
  trips: [],
  selectedTripId: null,
  recoveryStage: "alternatives",
  recoveryByTripId: {},
  filters: DEFAULT_FILTERS,
  preferences: DEFAULT_PREFERENCES,
  selectedAlternativeId: null,
  notifications: [],
  chatMessages: [
    {
      id: "chat-init",
      role: "assistant",
      content:
        "Hello! I'm TravelRescue AI. I monitor your Indian Railways journeys and assist with instant disruption recovery, alternative trains, and full refund tracking.",
      timestamp: new Date(),
      options: [
        { label: "Show alternatives", value: "show-alternatives" },
        { label: "Change budget", value: "change-budget" },
        { label: "How refunds work", value: "refund-info" },
      ],
    },
  ],
  chatInputDraft: "",
  theme: DEFAULT_THEME,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SELECT_TRIP":
      return { ...state, selectedTripId: action.tripId };
    case "SET_RECOVERY_STAGE": {
      const tripId = state.selectedTripId || state.trips[0]?.id || "";
      return {
        ...state,
        recoveryStage: action.stage,
        recoveryByTripId: {
          ...state.recoveryByTripId,
          [tripId]: action.stage,
        },
      };
    }
    case "SET_FILTERS":
      return { ...state, filters: { ...state.filters, ...action.filters } };
    case "RESET_FILTERS":
      return { ...state, filters: DEFAULT_FILTERS };
    case "SELECT_ALTERNATIVE":
      return { ...state, selectedAlternativeId: action.alternativeId };
    case "CONFIRM_RECOVERY": {
      const updatedTrips = state.trips.map((trip) =>
        trip.id === action.tripId
          ? {
              ...trip,
              status: "rebooked" as const,
              recoveredAlternativeId: action.alternativeId,
              refund: action.refundAmount !== undefined ? {
                originalFare: trip.fare,
                refundAmount: action.refundAmount,
                status: "Processing" as const,
                expectedDays: "3-5",
                refundMethod: "Original payment method",
              } : trip.refund,
            }
          : trip
      );

      const allTrips = action.newTrip ? [action.newTrip, ...updatedTrips] : updatedTrips;

      return {
        ...state,
        trips: allTrips,
        selectedAlternativeId: action.alternativeId,
        recoveryStage: "success",
        recoveryByTripId: {
          ...state.recoveryByTripId,
          [action.tripId]: "success",
        },
      };
    }
    case "UPDATE_PREFERENCES":
      return { ...state, preferences: { ...state.preferences, ...action.preferences } };
    case "MARK_NOTIFICATION_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.notificationId ? { ...n, read: true } : n
        ),
      };
    case "MARK_ALL_NOTIFICATIONS_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };
    case "ADD_CHAT_MESSAGE":
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case "CLEAR_CHAT_MESSAGES":
      return { ...state, chatMessages: [] };
    case "ADD_TRIP": {
      const normalizedTrip: Trip = {
        ...action.trip,
        neededByTime: action.trip.neededByTime
          ? (action.trip.neededByTime instanceof Date ? action.trip.neededByTime : new Date(action.trip.neededByTime))
          : undefined,
        segments: action.trip.segments.map((seg) => ({
          ...seg,
          departureTime: seg.departureTime instanceof Date ? seg.departureTime : new Date(seg.departureTime),
          arrivalTime: seg.arrivalTime instanceof Date ? seg.arrivalTime : new Date(seg.arrivalTime),
        })),
      };
      return {
        ...state,
        trips: [normalizedTrip, ...state.trips],
        selectedTripId: normalizedTrip.id,
      };
    }
    case "SUBMIT_VIBE_FEEDBACK": {
      const trainNum = action.feedback.trainNumber;
      const existing = state.vibeRatings?.[trainNum] || [];
      return {
        ...state,
        vibeRatings: {
          ...state.vibeRatings,
          [trainNum]: [action.feedback, ...existing],
        },
      };
    }
    case "SET_CHAT_INPUT":
      return { ...state, chatInputDraft: action.value };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    case "HYDRATE_STATE":
      return { ...state, ...action.state };
    case "MARK_TRIPS_SYNCED": {
      const syncedSet = new Set(action.tripIds);
      return {
        ...state,
        trips: state.trips.map((t) =>
          syncedSet.has(t.id)
            ? { ...t, syncStatus: "synced" as const, isPendingSync: false }
            : t
        ),
      };
    }
    case "UPDATE_TRIP_SYNC_STATUS": {
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === action.tripId
            ? {
                ...t,
                syncStatus: action.syncStatus,
                isPendingSync: action.syncStatus === "pending",
              }
            : t
        ),
      };
    }
    default:
      return state;
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [dynamicAlternatives, setDynamicAlternatives] = useState<Alternative[]>([]);

  // Hydrate state from localStorage after mount
  useEffect(() => {
    const hydrated = loadPersistedState(initialState);
    if (Object.keys(hydrated).length > 0) {
      dispatch({ type: "HYDRATE_STATE", state: hydrated });
    }
  }, []);

  // Fetch real trips and disruptions from Supabase
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [dbTrips, dbDisruptions] = await Promise.all([
          getAllTrips(),
          getAllDisruptions(),
        ]);

        if (!mounted) return;

        if (dbTrips.length > 0) {
          const appTrips = dbTrips.map((t) => dbTripToAppTrip(t));
          // Preserve optimistic local trips awaiting sync confirmation
          const pendingSyncs = getPendingSyncs();
          const pendingTrips: Trip[] = [];
          for (const s of pendingSyncs) {
            const trip = s.payload.trip;
            if (
              trip &&
              !appTrips.some(
                (dbT) => dbT.id === trip.id || (Boolean(trip.pnr) && dbT.pnr === trip.pnr)
              )
            ) {
              pendingTrips.push(trip);
            }
          }

          const mergedTrips = [...pendingTrips, ...appTrips];
          dispatch({
            type: "HYDRATE_STATE",
            state: {
              trips: mergedTrips,
              selectedTripId: mergedTrips[0]?.id ?? null,
            },
          });
        }

        if (dbDisruptions.length > 0) {
          const notifs = dbDisruptions.map((d) => dbDisruptionToNotification(d));
          dispatch({
            type: "HYDRATE_STATE",
            state: { notifications: notifs },
          });
        }
      } catch (err) {
        if (!isTableMissing(err)) {
          console.error("Failed to load trips from Supabase:", err);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  // Save state to localStorage on state changes
  useEffect(() => {
    const timer = setTimeout(() => savePersistedState(state), 250);
    return () => clearTimeout(timer);
  }, [state]);

  const isOnline = useOnlineStatus();

  // Process offline mutation sync queue when transitioning to online
  useEffect(() => {
    if (!isOnline) return;

    let active = true;
    async function triggerSync() {
      const pending = getPendingSyncs();
      if (pending.length === 0) return;

      try {
        const result = await processSyncQueue();
        if (!active) return;

        if (result.synced > 0) {
          const syncedTripIds = pending
            .map((p) => p.payload.trip?.id)
            .filter(Boolean) as string[];

          if (syncedTripIds.length > 0) {
            dispatch({ type: "MARK_TRIPS_SYNCED", tripIds: syncedTripIds });
          }
        }
      } catch (err) {
        console.warn("Failed processing sync queue:", err);
      }
    }

    triggerSync();
    return () => {
      active = false;
    };
  }, [isOnline]);

  // Synchronize theme to document root
  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      state.theme === "dark" ||
      (state.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [state.theme]);

  const selectedTrip: Trip | null = useMemo(
    () => state.trips.find((t) => t.id === state.selectedTripId) ?? state.trips[0] ?? null,
    [state.trips, state.selectedTripId]
  );

  const activeTrip: Trip | null = useMemo(
    () => getActiveTrip(state.trips, state.selectedTripId, state.recoveryByTripId),
    [state.trips, state.selectedTripId, state.recoveryByTripId]
  );

  // Dynamic alternatives resolution from journeys API with multi-class expansion
  useEffect(() => {
    let active = true;
    const tripToResolve = activeTrip || selectedTrip;
    const segment = tripToResolve?.segments[0];
    const fromCode = segment?.departureStation?.code || "SBC";
    const toCode = segment?.arrivalStation?.code || "NDLS";
    const travelDate = segment?.departureTime
      ? formatISTDate(new Date(segment.departureTime))
      : getTodayIST();

    async function resolveAlternatives() {
      try {
        const q = new URLSearchParams({
          from: fromCode,
          to: toCode,
          date: travelDate,
          includeNearby: "true",
        });
        const res = await fetch(`/api/journeys?${q.toString()}`);
        if (!active) return;

        if (res.ok) {
          const data: { direct: JourneyItinerary[]; connecting: JourneyItinerary[] } = await res.json();
          const allJourneys = [...data.direct, ...data.connecting];

          if (allJourneys.length > 0) {
            const alts: Alternative[] = [];
            for (const j of allJourneys) {
              const leg = j.legs[0];
              for (const opt of j.classes) {
                alts.push({
                  id: `alt-${leg.trainNumber}-${opt.travelClass}`,
                  tripId: tripToResolve?.id || "preview-trip",
                  trainName: leg.trainName,
                  trainNumber: leg.trainNumber,
                  fromStation: {
                    code: leg.fromStationCode,
                    name: leg.fromStationName,
                    city: leg.fromStationName,
                  },
                  toStation: {
                    code: leg.toStationCode,
                    name: leg.toStationName,
                    city: leg.toStationName,
                  },
                  departureTime: new Date(j.departureTime),
                  arrivalTime: new Date(j.arrivalTime),
                  dayOffset: j.arrivalDayLabel,
                  duration: j.totalDurationMin,
                  changes: j.changes,
                  changeStations: j.legs.slice(0, -1).map((l) => l.toStationName),
                  travelClass: opt.travelClass,
                  coachBerth:
                    opt.travelClass === "1A"
                      ? "Cabin A"
                      : opt.travelClass === "2A"
                      ? "A1-18"
                      : opt.travelClass === "3A"
                      ? "B2-23"
                      : opt.travelClass === "SL"
                      ? "S4-45"
                      : "C1-12",
                  fare: opt.fare,
                  originalFare: tripToResolve?.fare || opt.fare,
                  fareDifference: opt.fare - (tripToResolve?.fare || opt.fare),
                  availability: {
                    type:
                      opt.availability.status === "AVAILABLE"
                        ? "available"
                        : opt.availability.status === "RAC"
                        ? "rac"
                        : "waitlist",
                    label: opt.availability.badge,
                    count: opt.availability.count,
                    racNumber: opt.availability.status === "RAC" ? opt.availability.count : undefined,
                    wlNumber: opt.availability.status === "WL" ? opt.availability.count : undefined,
                  },
                });
              }
            }
            if (active && alts.length > 0) {
              setDynamicAlternatives(alts);
              return;
            }
          }
        }

        // Fallback to getTrainsBetween if journeys API returned no results
        const trains = await getTrainsBetween(fromCode, toCode);
        if (!active) return;
        if (trains.length > 0) {
          const fallbackAlts: Alternative[] = [];
          for (const [idx, t] of trains.entries()) {
            const classes: TravelClass[] = ["3A", "2A", "SL"];
            for (const cls of classes) {
              const baseFare = cls === "2A" ? 2100 : cls === "3A" ? 1450 : 540;
              fallbackAlts.push({
                id: `alt-${t.train_number}-${cls}-${idx}`,
                tripId: tripToResolve?.id || "preview-trip",
                trainName: t.train_name,
                trainNumber: t.train_number,
                fromStation: segment?.departureStation || { code: fromCode, name: fromCode, city: fromCode },
                toStation: segment?.arrivalStation || { code: toCode, name: toCode, city: toCode },
                departureTime: new Date(Date.now() + t.departure_min * 60000),
                arrivalTime: new Date(Date.now() + t.arrival_min * 60000),
                duration: t.duration_min,
                changes: 0,
                changeStations: [],
                travelClass: cls,
                fare: baseFare + idx * 100,
                originalFare: tripToResolve?.fare || baseFare,
                fareDifference: baseFare + idx * 100 - (tripToResolve?.fare || baseFare),
                availability: {
                  type: idx === 0 ? "available" : idx === 1 ? "rac" : "waitlist",
                  label: idx === 0 ? "AVAILABLE 18" : idx === 1 ? "RAC 6" : "WL 12",
                  count: idx === 0 ? 18 : undefined,
                  racNumber: idx === 1 ? 6 : undefined,
                  wlNumber: idx === 2 ? 12 : undefined,
                },
              });
            }
          }
          setDynamicAlternatives(fallbackAlts);
        } else {
          setDynamicAlternatives([]);
        }
      } catch (err) {
        console.error("Error resolving alternatives:", err);
        if (active) setDynamicAlternatives([]);
      }
    }

    resolveAlternatives();
    return () => {
      active = false;
    };
  }, [activeTrip, selectedTrip]);

  const effectivePreferences: UserPreferences = useMemo(() => {
    const p = { ...state.preferences };
    const f = state.filters;
    if (f.maxFare !== null) p.maxBudget = f.maxFare;
    if (f.maxChanges !== null) p.maxChanges = f.maxChanges;
    if (f.classFilter !== "any") {
      p.classes = [f.classFilter];
      p.onlyTheseClasses = true;
    }
    if (f.availableOnly) {
      p.seatPreference = "confirmed-only";
    }
    return p;
  }, [state.preferences, state.filters]);

  const evaluationResult = useMemo(() => {
    return evaluateAlternatives(dynamicAlternatives, effectivePreferences, activeTrip ?? selectedTrip);
  }, [dynamicAlternatives, effectivePreferences, activeTrip, selectedTrip]);

  const rankedAlternatives: RankedAlternative[] = useMemo(() => {
    const ranked = [...evaluationResult.ranked];
    const { sortBy, sortDirection } = state.filters;
    if (sortBy !== "best-match") {
      const dir = sortDirection === "asc" ? 1 : -1;
      ranked.sort((a, b) => {
        switch (sortBy) {
          case "price":
            return (a.fare - b.fare) * dir;
          case "duration":
            return (a.duration - b.duration) * dir;
          case "arrival":
            return (a.arrivalTime.getTime() - b.arrivalTime.getTime()) * dir;
          default:
            return 0;
        }
      });
    }
    return ranked;
  }, [evaluationResult.ranked, state.filters]);

  const alternatives: Alternative[] = useMemo(() => {
    return evaluationResult.eligible;
  }, [evaluationResult.eligible]);

  const unreadCount = useMemo(
    () => state.notifications.filter((n) => !n.read).length,
    [state.notifications]
  );

  const contextValue: AppContextValue = useMemo(
    () => ({
      state,
      dispatch,
      candidateAlternatives: dynamicAlternatives,
      alternatives,
      rankedAlternatives,
      unreadCount,
      selectedTrip,
      activeTrip,
    }),
    [state, dynamicAlternatives, alternatives, rankedAlternatives, unreadCount, selectedTrip, activeTrip]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}

export function useAppDispatch() {
  const { dispatch } = useApp();
  return useCallback((action: AppAction) => dispatch(action), [dispatch]);
}
