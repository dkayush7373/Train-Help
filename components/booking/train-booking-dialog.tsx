"use client";

import { useState, useId, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Train,
  ArrowRight,
  ArrowLeftRight,
  Calendar,
  ArrowLeft,
} from "lucide-react";
import { SuggestionCombobox, type SuggestionItem } from "@/components/ui/suggestion-combobox";
import {
  TravelClass,
  BookingQuota,
  BookingPassenger,
  Trip,
  Station,
  BookingBerthPreference,
} from "@/lib/types";
import {
  calculateFareBreakdown,
  generatePNR,
  assignBerths,
  saveBookingToStorage,
} from "@/lib/booking/booking-engine";
import { enqueueBooking } from "@/lib/data/sync-queue";
import { formatTimeWithDay } from "@/lib/format";
import { useApp, useAppDispatch } from "@/context/app-context";
import {
  getTodayIST,
  formatISTDate,
  parseISTDate,
  type JourneyItinerary,
  type JourneyClassOption,
} from "@/lib/journeys";
import { trainRepository } from "@/lib/data/train-repository";
import type { TrainWithStops } from "@/lib/data/types";

export const ADVANCE_RESERVATION_DAYS = 60; // Current Indian Railways booking window

async function fetchJourneysApi(params: {
  fromCode: string;
  toCode: string;
  date: string;
  includeNearby?: boolean;
}): Promise<{ direct: JourneyItinerary[]; connecting: JourneyItinerary[] }> {
  const q = new URLSearchParams({
    from: params.fromCode,
    to: params.toCode,
    date: params.date,
    includeNearby: params.includeNearby ? "true" : "false",
  });
  const res = await fetch(`/api/journeys?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`Journey search failed: ${res.statusText}`);
  }
  const data = (await res.json()) as { direct: JourneyItinerary[]; connecting: JourneyItinerary[] };

  const reviveItinerary = (it: JourneyItinerary): JourneyItinerary => ({
    ...it,
    departureTime: new Date(it.departureTime),
    arrivalTime: new Date(it.arrivalTime),
    legs: (it.legs || []).map((leg) => ({
      ...leg,
      departureTime: new Date(leg.departureTime),
      arrivalTime: new Date(leg.arrivalTime),
      originDate: new Date(leg.originDate),
      boardingDate: new Date(leg.boardingDate),
    })),
  });

  return {
    direct: (data.direct || []).map(reviveItinerary),
    connecting: (data.connecting || []).map(reviveItinerary),
  };
}

interface TrainBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainInfo?: {
    trainNumber: string;
    trainName: string;
    fromStation: Station;
    toStation: Station;
    departureTime: Date;
    arrivalTime: Date;
    defaultClass?: TravelClass;
  };
  onBookingSuccess?: (newTrip: Trip) => void;
}

export function TrainBookingDialog({
  open,
  onOpenChange,
  trainInfo,
  onBookingSuccess,
}: TrainBookingDialogProps) {
  const { state } = useApp();
  const dispatch = useAppDispatch();
  const formId = useId();

  // Route & Date selection state
  const todayIST = useMemo(() => getTodayIST(), []);
  const maxDateIST = useMemo(() => {
    const today = parseISTDate(todayIST);
    const maxDate = new Date(today.getTime() + ADVANCE_RESERVATION_DAYS * 86_400_000);
    return formatISTDate(maxDate);
  }, [todayIST]);

  const [fromStation, setFromStation] = useState<Station | null>(() =>
    trainInfo ? trainInfo.fromStation : { code: "SBC", name: "KSR Bengaluru", city: "Bengaluru" }
  );
  const [toStation, setToStation] = useState<Station | null>(() =>
    trainInfo ? trainInfo.toStation : { code: "NDLS", name: "New Delhi", city: "Delhi" }
  );
  const [journeyDate, setJourneyDate] = useState<string>(() => {
    if (trainInfo) return formatISTDate(trainInfo.departureTime);
    // Sensible default: today
    return todayIST;
  });
  const [includeNearby, setIncludeNearby] = useState<boolean>(() =>
    Boolean(state.preferences.includeNearbyStations)
  );

  // Train search results state
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<{
    direct: JourneyItinerary[];
    connecting: JourneyItinerary[];
    searched: boolean;
  }>({ direct: [], connecting: [], searched: false });

  const initialBerthPreference = useMemo<BookingBerthPreference>(() => {
    const pref = state.preferences.berthPreference;
    if (pref === "lower") return "LB";
    if (pref === "middle") return "MB";
    if (pref === "upper") return "UB";
    if (pref === "side-lower") return "SL";
    if (pref === "side-upper") return "SU";
    return "LB";
  }, [state.preferences.berthPreference]);

  // Selected journey for booking
  const [selectedJourney, setSelectedJourney] = useState<JourneyItinerary | null>(null);
  const [selectedClass, setSelectedClass] = useState<TravelClass>(() => {
    return (state.preferences.classes?.[0] as TravelClass) || "3A";
  });
  const [selectedQuota, setSelectedQuota] = useState<BookingQuota>("GN");

  // Train shortcut mismatch resolver state
  const [trainMismatchAlert, setTrainMismatchAlert] = useState<{
    train: TrainWithStops;
    message: string;
  } | null>(null);

  // Multi-step booking state
  const [step, setStep] = useState<"search" | "passengers" | "summary" | "confirmed">("search");
  const [passengers, setPassengers] = useState<BookingPassenger[]>([
    {
      id: "p-1",
      name: "",
      age: 30,
      gender: "M",
      berthPreference: initialBerthPreference,
    },
  ]);
  const [contactMobile, setContactMobile] = useState("9876543210");
  const [contactEmail, setContactEmail] = useState("vikram.patel@example.com");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [confirmedTrip, setConfirmedTrip] = useState<Trip | null>(null);

  // Execute journey search
  const executeSearch = useCallback((fCode: string, tCode: string, date: string, nearby: boolean) => {
    if (!fCode || !tCode || fCode === tCode) return;
    setIsSearching(true);
    fetchJourneysApi({
      fromCode: fCode,
      toCode: tCode,
      date,
      includeNearby: nearby,
    })
      .then((res) => {
        setSearchResults({
          direct: res.direct,
          connecting: res.connecting,
          searched: true,
        });
        setIsSearching(false);
      })
      .catch((err) => {
        console.error("Failed to search journeys:", err);
        setSearchResults({ direct: [], connecting: [], searched: true });
        setIsSearching(false);
      });
  }, []);

  // Trigger search on mount or when from/to/date changes (deferred asynchronously)
  useEffect(() => {
    let isCancelled = false;
    if (open && fromStation?.code && toStation?.code && fromStation.code !== toStation.code) {
      const timer = setTimeout(() => {
        setIsSearching(true);
        fetchJourneysApi({
          fromCode: fromStation.code,
          toCode: toStation.code,
          date: journeyDate,
          includeNearby,
        })
          .then((res) => {
            if (!isCancelled) {
              setSearchResults({
                direct: res.direct,
                connecting: res.connecting,
                searched: true,
              });
              setIsSearching(false);
            }
          })
          .catch((err) => {
            if (!isCancelled) {
              console.error("Failed to search journeys:", err);
              setSearchResults({ direct: [], connecting: [], searched: true });
              setIsSearching(false);
            }
          });
      }, 0);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
      };
    }
  }, [open, fromStation?.code, toStation?.code, journeyDate, includeNearby]);

  // Handle train shortcut selection
  async function handleTrainShortcutSelect(item: SuggestionItem) {
    const trainNumber = item.id;
    try {
      const train = await trainRepository.getTrainWithStops(trainNumber);
      if (!train || !train.stops || train.stops.length < 2) return;

      const fCode = fromStation?.code.toUpperCase();
      const tCode = toStation?.code.toUpperCase();

      const fromIdx = train.stops.findIndex((s) => s.station_code === fCode);
      const toIdx = train.stops.findIndex((s) => s.station_code === tCode);

      if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
        // Train serves this exact route in correct order!
        setTrainMismatchAlert(null);
        executeSearch(fCode!, tCode!, journeyDate, includeNearby);
      } else {
        // Does not serve route. Offer user to choose from this train's stops
        setTrainMismatchAlert({
          train,
          message: `Train ${train.train_name} (#${train.train_number}) does not run between ${fromStation?.city || fCode} and ${toStation?.city || tCode}.`,
        });
      }
    } catch (err) {
      console.error("Train shortcut error:", err);
    }
  }

  function handleSwapStations() {
    const prevFrom = fromStation;
    const prevTo = toStation;
    setFromStation(prevTo);
    setToStation(prevFrom);
  }

  function handleSelectJourney(journey: JourneyItinerary, classOpt: JourneyClassOption) {
    setSelectedJourney(journey);
    setSelectedClass(classOpt.travelClass);
    setStep("passengers");
  }

  function handleShiftDate(days: number) {
    const current = parseISTDate(journeyDate);
    const shifted = new Date(current.getTime() + days * 86_400_000);
    const shiftedStr = formatISTDate(shifted);
    if (shiftedStr >= todayIST && shiftedStr <= maxDateIST) {
      setJourneyDate(shiftedStr);
    }
  }

  // Fare calculations based on real distance
  const currentDistanceKm = selectedJourney?.totalDistanceKm || 500;
  const currentTrainType = selectedJourney?.legs[0]?.trainType || "Superfast";
  const fareDetails = useMemo(() => {
    return calculateFareBreakdown(
      selectedClass,
      selectedQuota,
      passengers,
      currentDistanceKm,
      currentTrainType
    );
  }, [selectedClass, selectedQuota, passengers, currentDistanceKm, currentTrainType]);

  function handleAddPassenger() {
    if (passengers.length >= 6) {
      setErrors((prev) => ({ ...prev, general: "Maximum 6 passengers permitted per booking manifest." }));
      return;
    }
    const defaultBerth = (state.preferences.berthPreference as BookingBerthPreference) || "LB";
    setPassengers((prev) => [
      ...prev,
      {
        id: `p-${prev.length + 1}`,
        name: "",
        age: 28,
        gender: "M",
        berthPreference: defaultBerth,
      },
    ]);
  }

  function handleRemovePassenger(index: number) {
    if (passengers.length <= 1) {
      setErrors((prev) => ({ ...prev, general: "At least 1 passenger is required." }));
      return;
    }
    setPassengers((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.general;
      delete copy[`p-name-${index}`];
      delete copy[`p-age-${index}`];
      return copy;
    });
  }

  function updatePassenger(index: number, updates: Partial<BookingPassenger>) {
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  }

  function validatePassengers(): boolean {
    const errs: Record<string, string> = {};

    if (passengers.length === 0) {
      errs.general = "Please add at least 1 passenger.";
    }

    passengers.forEach((p, idx) => {
      const trimmed = p.name.trim();
      if (!trimmed) {
        errs[`p-name-${idx}`] = "Passenger name is required.";
      } else if (trimmed.length < 2) {
        errs[`p-name-${idx}`] = "Name must be at least 2 characters.";
      } else if (!/^[a-zA-Z\s.'-]+$/.test(trimmed)) {
        errs[`p-name-${idx}`] = "Name contains invalid characters.";
      }

      if (isNaN(p.age) || p.age < 1 || p.age > 120) {
        errs[`p-age-${idx}`] = "Age must be between 1 and 120.";
      }
    });

    if (!/^\d{10}$/.test(contactMobile.replace(/\s+/g, ""))) {
      errs.mobile = "Please enter a valid 10-digit mobile number.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      errs.email = "Please enter a valid email address.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleConfirmBooking() {
    if (!selectedJourney) return;
    const pnr = generatePNR();
    const berthInfo = assignBerths(selectedClass, passengers);
    const primaryPassenger = passengers[0]?.name || "Traveler";

    const newTrip: Trip = {
      id: `trip-bk-${pnr}`,
      pnr,
      passengerName:
        passengers.length > 1 ? `${primaryPassenger} +${passengers.length - 1} more` : primaryPassenger,
      travelClass: selectedClass,
      fare: fareDetails.totalFare,
      coach: berthInfo.coach,
      berth: berthInfo.berths.join(", "),
      status: "on-time",
      neededByTime: new Date(selectedJourney.arrivalTime),
      segments: selectedJourney.legs.map((leg) => ({
        trainName: leg.trainName,
        trainNumber: leg.trainNumber,
        departureStation: {
          code: leg.fromStationCode,
          name: leg.fromStationName,
          city: leg.fromStationName,
        },
        arrivalStation: {
          code: leg.toStationCode,
          name: leg.toStationName,
          city: leg.toStationName,
        },
        departureTime: leg.departureTime instanceof Date ? leg.departureTime : new Date(leg.departureTime),
        arrivalTime: leg.arrivalTime instanceof Date ? leg.arrivalTime : new Date(leg.arrivalTime),
        dayOffset: leg.arrivalDayLabel || undefined,
        status: "on-time",
        travelClass: selectedClass,
        coach: berthInfo.coach,
        berth: berthInfo.berths.join(", "),
        platform: leg.platform || "Platform TBA",
      })),
      syncStatus: typeof navigator !== "undefined" && !navigator.onLine ? "pending" : "synced",
      isPendingSync: typeof navigator !== "undefined" && !navigator.onLine,
    };

    dispatch({ type: "ADD_TRIP", trip: newTrip });
    enqueueBooking(newTrip);
    saveBookingToStorage(newTrip);

    setConfirmedTrip(newTrip);
    setStep("confirmed");

    if (onBookingSuccess) {
      onBookingSuccess(newTrip);
    }
  }

  function resetDialog() {
    setStep("search");
    setSelectedJourney(null);
    setPassengers([
      {
        id: "p-1",
        name: "",
        age: 30,
        gender: "M",
        berthPreference: (state.preferences.berthPreference as BookingBerthPreference) || "LB",
      },
    ]);
    setErrors({});
    setConfirmedTrip(null);
    setTrainMismatchAlert(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetDialog();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-w-2xl bg-surface p-4 sm:p-6 rounded-2xl border border-border max-h-[92vh] overflow-y-auto shadow-2xl">
        <DialogHeader className="gap-1 pb-3 border-b border-hairline">
          <div className="flex items-center justify-between">
            <span className="micro-label">NEW RESERVATION MANIFEST</span>
            <span className="text-[11px] font-mono text-muted-foreground">
              {step === "search" && "Step 1 of 3: Train Selection"}
              {step === "passengers" && "Step 2 of 3: Passengers & Class"}
              {step === "summary" && "Step 3 of 3: Review & Pay"}
              {step === "confirmed" && "Reservation Confirmed"}
            </span>
          </div>
          <DialogTitle className="text-xl font-display font-medium text-foreground flex items-center gap-2">
            <Train className="w-5 h-5 text-primary stroke-[1.5]" />
            Route-Aware Railway Booking
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Search authentic trains serving your verified origin, destination, and journey calendar date.
          </DialogDescription>
        </DialogHeader>

        {/* ── STEP 1: ROUTE & TRAIN SEARCH ── */}
        {step === "search" && (
          <div className="space-y-4 py-2">
            {/* Origin & Destination with Swap */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-end">
              <div>
                <SuggestionCombobox
                  type="station"
                  label="From (Origin Station or City)"
                  placeholder="e.g. Bangalore, SBC, Delhi..."
                  value={fromStation ? `${fromStation.name} (${fromStation.code})` : ""}
                  onSelect={(item) => {
                    const st = item.meta as Record<string, unknown> | undefined;
                    setFromStation({
                      code: item.id,
                      name: item.title,
                      city: (st?.city as string) || (st?.state as string) || item.title,
                    });
                  }}
                />
              </div>

              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={handleSwapStations}
                  className="p-2 rounded-full border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-target"
                  aria-label="Swap origin and destination stations"
                >
                  <ArrowLeftRight className="w-4 h-4 stroke-[1.5]" />
                </button>
              </div>

              <div>
                <SuggestionCombobox
                  type="station"
                  label="To (Destination Station or City)"
                  placeholder="e.g. Chennai, MAS, Mumbai..."
                  value={toStation ? `${toStation.name} (${toStation.code})` : ""}
                  onSelect={(item) => {
                    const st = item.meta as Record<string, unknown> | undefined;
                    setToStation({
                      code: item.id,
                      name: item.title,
                      city: (st?.city as string) || (st?.state as string) || item.title,
                    });
                  }}
                />
              </div>
            </div>

            {/* Date Picker & Nearby Stations Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-background/50 p-3 rounded-xl border border-hairline">
              <div>
                <label
                  htmlFor={`${formId}-date`}
                  className="font-medium text-foreground text-xs block mb-1 flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Journey Date (Real IST)
                </label>
                <input
                  id={`${formId}-date`}
                  type="date"
                  min={todayIST}
                  max={maxDateIST}
                  value={journeyDate}
                  onChange={(e) => setJourneyDate(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  Advance Reservation Window: 60 Days (Max {maxDateIST})
                </span>
              </div>

              <div className="flex flex-col justify-center">
                <span className="text-xs font-medium text-foreground mb-1">Route Flexibility</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={includeNearby}
                    onChange={(e) => setIncludeNearby(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary border-border"
                  />
                  <span>Include nearby city terminals (e.g. SBC/YPR/SMVB, NDLS/NZM)</span>
                </label>
              </div>
            </div>

            {/* Train Shortcut Search (Optional) */}
            <div className="border-t border-hairline pt-3">
              <SuggestionCombobox
                type="train"
                label="Direct Train Shortcut (Optional)"
                placeholder="Jump directly to a specific train (e.g. 22691, 12028, Shatabdi)..."
                onSelect={handleTrainShortcutSelect}
              />
            </div>

            {/* Mismatch Modal / Alert if user picked incompatible train */}
            {trainMismatchAlert && (
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs space-y-2 animate-in fade-in">
                <div className="flex items-start gap-2 text-destructive font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p>{trainMismatchAlert.message}</p>
                    <p className="text-[11px] font-normal text-muted-foreground mt-0.5">
                      Select boarding and destination stations directly from this train&apos;s itinerary:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                      Boarding Station
                    </label>
                    <select
                      className="w-full h-8 rounded border border-border bg-background text-xs px-2 text-foreground"
                      onChange={(e) => {
                        const stop = trainMismatchAlert.train.stops.find((s) => s.station_code === e.target.value);
                        if (stop) {
                          setFromStation({ code: stop.station_code, name: stop.station_name, city: stop.station_name });
                        }
                      }}
                    >
                      <option value="">Choose Boarding...</option>
                      {trainMismatchAlert.train.stops.slice(0, -1).map((s) => (
                        <option key={s.station_code} value={s.station_code}>
                          {s.seq}. {s.station_name} ({s.station_code}) - {s.departure_formatted || "Dep"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                      Destination Station
                    </label>
                    <select
                      className="w-full h-8 rounded border border-border bg-background text-xs px-2 text-foreground"
                      onChange={(e) => {
                        const stop = trainMismatchAlert.train.stops.find((s) => s.station_code === e.target.value);
                        if (stop) {
                          setToStation({ code: stop.station_code, name: stop.station_name, city: stop.station_name });
                          setTrainMismatchAlert(null);
                        }
                      }}
                    >
                      <option value="">Choose Destination...</option>
                      {trainMismatchAlert.train.stops.slice(1).map((s) => (
                        <option key={s.station_code} value={s.station_code}>
                          {s.seq}. {s.station_name} ({s.station_code}) - {s.arrival_formatted || "Arr"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Results Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span>Available Trains</span>
                  {searchResults.searched && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                      {searchResults.direct.length} direct
                    </span>
                  )}
                </h3>

                {/* Day Stepper */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleShiftDate(-1)}
                    disabled={journeyDate <= todayIST}
                    className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-40"
                  >
                    -1 Day
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShiftDate(1)}
                    disabled={journeyDate >= maxDateIST}
                    className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-40"
                  >
                    +1 Day
                  </button>
                </div>
              </div>

              {isSearching ? (
                <div className="py-8 text-center space-y-2 text-muted-foreground">
                  <Train className="w-8 h-8 animate-pulse text-primary mx-auto" />
                  <p className="text-xs">Searching verified railway schedules for {journeyDate}...</p>
                </div>
              ) : searchResults.direct.length > 0 ? (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {searchResults.direct.map((j) => {
                    const leg = j.legs[0];
                    return (
                      <div
                        key={j.id}
                        className="p-3.5 rounded-xl border border-border bg-background hover:border-primary/50 transition-all space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground text-sm">
                                {leg.trainName}
                              </span>
                              <span className="font-mono text-xs text-primary font-medium">
                                #{leg.trainNumber}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                                {leg.trainType}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {leg.fromStationName} ({leg.fromStationCode}) → {leg.toStationName} ({leg.toStationCode})
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-mono font-semibold text-foreground flex items-center gap-1.5">
                              <span>{leg.departureFormatted}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span>{leg.arrivalFormatted}</span>
                              {leg.arrivalDayLabel && (
                                <span className="text-[10px] text-amber-500 font-bold">
                                  {leg.arrivalDayLabel}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {Math.floor(leg.durationMin / 60)}h {leg.durationMin % 60}m · {leg.distanceKm} km
                            </span>
                          </div>
                        </div>

                        {/* Class options pills */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                          {j.classes.map((c) => (
                            <button
                              key={c.travelClass}
                              type="button"
                              onClick={() => handleSelectJourney(j, c)}
                              className="p-2 rounded-lg border border-border bg-surface hover:border-primary hover:bg-primary/5 text-left transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-xs text-foreground group-hover:text-primary">
                                  {c.travelClass}
                                </span>
                                <span className="text-xs font-semibold text-foreground">
                                  ₹{c.fare}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span
                                  className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                                    c.availability.status === "AVAILABLE"
                                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                      : c.availability.status === "RAC"
                                      ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                                      : "text-rose-600 dark:text-rose-400 bg-rose-500/10"
                                  }`}
                                >
                                  {c.availability.badge}
                                </span>
                                <span className="text-[9px] text-muted-foreground">Estimated</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : searchResults.searched ? (
                /* Empty state with connecting journey options */
                <div className="p-4 rounded-xl border border-dashed border-border bg-background/50 text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                    <Train className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      No direct trains found for {fromStation?.code} → {toStation?.code} on {journeyDate}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The selected stations do not share a direct operational route on this calendar weekday.
                    </p>
                  </div>

                  {searchResults.connecting.length > 0 && (
                    <div className="pt-2 text-left border-t border-hairline">
                      <p className="text-xs font-semibold text-primary mb-2">
                        1-Change Connecting Journeys Available:
                      </p>
                      <div className="space-y-2">
                        {searchResults.connecting.slice(0, 3).map((conn) => (
                          <div
                            key={conn.id}
                            className="p-3 rounded-lg border border-border bg-surface flex items-center justify-between"
                          >
                            <div>
                              <p className="text-xs font-medium text-foreground">
                                Via {conn.interchangeStationName} ({conn.interchangeStation}) · Layover {conn.layoverMin}m
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Train #{conn.legs[0].trainNumber} → Train #{conn.legs[1].trainNumber} ({conn.totalDistanceKm} km)
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectJourney(conn, conn.classes[0])}
                              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover"
                            >
                              Select Route
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleShiftDate(1)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-muted"
                    >
                      Check Next Day (+1d)
                    </button>
                    {!includeNearby && (
                      <button
                        type="button"
                        onClick={() => setIncludeNearby(true)}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"
                      >
                        Expand to Nearby Stations
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── STEP 2: PASSENGERS & CLASS SELECTION ── */}
        {step === "passengers" && selectedJourney && (
          <div className="space-y-4 py-2">
            {/* Selected Journey Header Banner */}
            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    {selectedJourney.legs[0].trainName}
                  </span>
                  <span className="font-mono text-xs text-primary font-medium">
                    #{selectedJourney.legs[0].trainNumber}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedJourney.fromStationCode} → {selectedJourney.toStationCode} · {journeyDate} · {selectedJourney.departureFormatted} - {selectedJourney.arrivalFormatted}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep("search")}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Train
              </button>
            </div>

            {/* Travel Class & Quota Pill Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Selected Travel Class
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {selectedJourney.classes.map((cls) => (
                    <button
                      key={cls.travelClass}
                      type="button"
                      onClick={() => setSelectedClass(cls.travelClass)}
                      className={`h-9 rounded-lg font-mono text-xs font-medium border transition-colors flex flex-col items-center justify-center ${
                        selectedClass === cls.travelClass
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span>{cls.travelClass}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor={`${formId}-quota`} className="text-xs font-medium text-foreground block mb-1.5">
                  Booking Quota
                </label>
                <select
                  id={`${formId}-quota`}
                  value={selectedQuota}
                  onChange={(e) => setSelectedQuota(e.target.value as BookingQuota)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="GN">General Quota (GN)</option>
                  <option value="TQ">Tatkal Quota (TQ)</option>
                  <option value="LD">Ladies Quota (LD)</option>
                  <option value="SS">Senior Citizen / Lower Berth (SS)</option>
                  <option value="HP">Divyangjan / Concession (HP)</option>
                </select>
              </div>
            </div>

            {/* Passengers Form */}
            <div className="space-y-3 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Passenger Details</h4>
                  <p className="text-[11px] text-muted-foreground">Up to 6 travelers per reservation ticket</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddPassenger}
                  disabled={passengers.length >= 6}
                  className="text-xs text-primary font-medium flex items-center gap-1 hover:underline disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Traveler
                </button>
              </div>

              {errors.general && (
                <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                  {errors.general}
                </div>
              )}

              <div className="space-y-2.5">
                {passengers.map((p, idx) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl border border-border bg-background space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">Passenger {idx + 1}</span>
                      {passengers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePassenger(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={`Remove passenger ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          placeholder="Full Name (as per Govt ID)"
                          value={p.name}
                          onChange={(e) => updatePassenger(idx, { name: e.target.value })}
                          className={`w-full h-8 px-2.5 rounded border text-xs bg-surface text-foreground ${
                            errors[`p-name-${idx}`] ? "border-destructive" : "border-border"
                          }`}
                        />
                        {errors[`p-name-${idx}`] && (
                          <span className="text-[10px] text-destructive mt-0.5 block">
                            {errors[`p-name-${idx}`]}
                          </span>
                        )}
                      </div>

                      <div>
                        <input
                          type="number"
                          placeholder="Age"
                          value={p.age || ""}
                          min={1}
                          max={120}
                          onChange={(e) => updatePassenger(idx, { age: parseInt(e.target.value, 10) || 0 })}
                          className={`w-full h-8 px-2.5 rounded border text-xs bg-surface text-foreground ${
                            errors[`p-age-${idx}`] ? "border-destructive" : "border-border"
                          }`}
                        />
                      </div>

                      <div>
                        <select
                          value={p.gender}
                          onChange={(e) => updatePassenger(idx, { gender: e.target.value as "M" | "F" | "O" })}
                          className="w-full h-8 px-2 rounded border border-border bg-surface text-xs text-foreground"
                        >
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                          <option value="O">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Berth Preference:</span>
                      <select
                        value={p.berthPreference}
                        onChange={(e) =>
                          updatePassenger(idx, { berthPreference: e.target.value as BookingBerthPreference })
                        }
                        className="h-7 px-2 rounded border border-border bg-surface text-[11px] text-foreground"
                      >
                        <option value="LB">Lower Berth (LB)</option>
                        <option value="MB">Middle Berth (MB)</option>
                        <option value="UB">Upper Berth (UB)</option>
                        <option value="SL">Side Lower (SL)</option>
                        <option value="SU">Side Upper (SU)</option>
                        <option value="NONE">No Preference</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-hairline">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Mobile Number (SMS Updates)
                </label>
                <input
                  type="tel"
                  value={contactMobile}
                  onChange={(e) => setContactMobile(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-border bg-background text-xs text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Email ID (E-Ticket PDF)
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-border bg-background text-xs text-foreground"
                />
              </div>
            </div>

            {/* Footer with Fare Total & Proceed */}
            <div className="flex items-center justify-between pt-3 border-t border-hairline">
              <div>
                <span className="text-xs text-muted-foreground block">Total Ticket Fare</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-bold text-foreground">
                    ₹{fareDetails.totalFare}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    (₹{fareDetails.baseFarePerPassenger} × {passengers.length} + GST)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("search")}
                  className="px-3 py-2 rounded-lg border border-border text-xs text-foreground hover:bg-muted"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (validatePassengers()) {
                      setStep("summary");
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover shadow-sm"
                >
                  Proceed to Summary
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: SUMMARY & CONFIRM ── */}
        {step === "summary" && selectedJourney && (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl border border-border bg-background space-y-3">
              <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                <div>
                  <h4 className="font-semibold text-foreground text-sm">
                    {selectedJourney.legs[0].trainName} (#{selectedJourney.legs[0].trainNumber})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Class {selectedClass} · Quota {selectedQuota} · {journeyDate}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono font-medium">
                  Verified Route
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">DEPARTURE</span>
                  <p className="font-medium text-foreground">{selectedJourney.fromStationName}</p>
                  <p className="font-mono text-muted-foreground">{selectedJourney.departureFormatted} IST</p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">ARRIVAL</span>
                  <p className="font-medium text-foreground">{selectedJourney.toStationName}</p>
                  <p className="font-mono text-muted-foreground">
                    {selectedJourney.arrivalFormatted} IST{" "}
                    {selectedJourney.arrivalDayLabel && (
                      <span className="text-amber-500 font-bold">({selectedJourney.arrivalDayLabel})</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-hairline">
                <span className="text-muted-foreground text-[11px] block mb-1">TRAVELERS</span>
                <div className="space-y-1">
                  {passengers.map((p, i) => (
                    <div key={p.id} className="text-xs flex items-center justify-between text-foreground">
                      <span>
                        {i + 1}. {p.name} ({p.age}y, {p.gender})
                      </span>
                      <span className="text-muted-foreground font-mono">Pref: {p.berthPreference}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Calculated Fare Breakdown:</span>
                <span className="text-muted-foreground">Distance: {selectedJourney.totalDistanceKm} km</span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Base Passenger Fare ({passengers.length} travelers):</span>
                  <span>₹{fareDetails.totalBaseFare}</span>
                </div>
                <div className="flex justify-between">
                  <span>Superfast & Reservation Charges:</span>
                  <span>₹{fareDetails.superfastCharge + fareDetails.reservationCharge}</span>
                </div>
                {fareDetails.gstAmount > 0 && (
                  <div className="flex justify-between">
                    <span>GST (5% for AC Classes):</span>
                    <span>₹{fareDetails.gstAmount}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-foreground text-sm pt-1 border-t border-hairline">
                  <span>Total Amount Payable:</span>
                  <span>₹{fareDetails.totalFare}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep("passengers")}
                className="px-3 py-2 rounded-lg border border-border text-xs text-foreground hover:bg-muted"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmBooking}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm & Book Ticket
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: CONFIRMED MANIFEST ── */}
        {step === "confirmed" && confirmedTrip && (
          <div className="space-y-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[2]" />
            </div>

            <div>
              <h3 className="text-lg font-display font-medium text-foreground">
                Reservation Confirmed!
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ticket confirmed and synced to your TravelRescue My Trips manifest.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-left space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground">PNR NUMBER</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-foreground">
                      {confirmedTrip.pnr}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(confirmedTrip.pnr);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-1 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-foreground"
                      title="Copy PNR"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-mono text-muted-foreground">COACH & BERTH</span>
                  <p className="font-mono font-bold text-foreground text-sm">
                    {confirmedTrip.coach} / {confirmedTrip.berth}
                  </p>
                </div>
              </div>

              <div className="text-xs space-y-1 text-muted-foreground">
                <p>
                  <strong className="text-foreground">Train:</strong> {confirmedTrip.segments[0].trainName} (#{confirmedTrip.segments[0].trainNumber})
                </p>
                <p>
                  <strong className="text-foreground">Departure:</strong> {confirmedTrip.segments[0].departureStation.name} · {formatTimeWithDay(confirmedTrip.segments[0].departureTime)}
                </p>
                <p>
                  <strong className="text-foreground">Platform:</strong> Platform TBA (Official platform will be announced at station)
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  resetDialog();
                }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
