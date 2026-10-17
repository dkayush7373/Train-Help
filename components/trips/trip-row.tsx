"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Trip } from "@/lib/types";
import { formatTimeWithDay, formatDate, formatCurrency } from "@/lib/format";
import { TrainStatusBadge } from "@/components/status/train-status-badge";

interface TripRowProps {
  trip: Trip;
  onViewBooking?: (trip: Trip) => void;
  isEarlier?: boolean;
}

export function TripRow({ trip, onViewBooking, isEarlier = false }: TripRowProps) {
  void onViewBooking;
  const segment = trip.segments[0];

  return (
    <article
      className={`border rounded-lg bg-surface interactive-row transition-all duration-150 ${
        isEarlier
          ? "border-hairline bg-surface/80 p-3.5 text-xs text-muted-foreground"
          : "border-border p-4 text-foreground"
      }`}
      aria-label={`${segment.trainName} from ${segment.departureStation.city} to ${segment.arrivalStation.city}`}
    >
      {/* Desktop Horizontal Row */}
      <div className="hidden md:flex items-center justify-between gap-4">
        {/* 1. Date Block */}
        <div className="w-20 shrink-0">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {formatDate(segment.departureTime).split(" ").slice(1, 3).join(" ")}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            PNR {trip.pnr}
          </p>
        </div>

        {/* 2. Train and Route */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-baseline gap-2">
            <h3 className="font-medium text-foreground text-sm truncate">
              <Link href={`/trips/${trip.id}`} className="hover:underline">
                {segment.departureStation.city} → {segment.arrivalStation.city}
              </Link>
            </h3>
            <span className="text-xs text-muted-foreground truncate">
              {segment.trainName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mt-0.5">
            <span>#{segment.trainNumber}</span>
            <span>•</span>
            <span>Class {trip.travelClass}</span>
            {trip.coach && (
              <>
                <span>•</span>
                <span>{trip.coach} · {trip.berth}</span>
              </>
            )}
          </div>
        </div>

        {/* 3. Mono Times */}
        <div className="w-44 shrink-0 text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatTimeWithDay(segment.departureTime)}
            </span>
            <span className="text-xs text-muted-foreground">→</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatTimeWithDay(segment.arrivalTime, segment.dayOffset)}
            </span>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
            {segment.departureStation.code} to {segment.arrivalStation.code}
          </p>
        </div>

        {/* 4. Dynamic Real-time Operational Status Badge */}
        <div className="w-44 shrink-0 flex items-center justify-start">
          <TrainStatusBadge
            departureTime={segment.departureTime}
            arrivalTime={segment.arrivalTime}
            tripStatus={trip.status}
            syncStatus={trip.syncStatus}
            isPendingSync={trip.isPendingSync}
            showDetail={false}
          />
        </div>

        {/* 5. Actions by status: Cancelled = Find Alternatives, Delayed = View Status, Other = View Trip */}
        <div className="w-36 shrink-0 flex items-center justify-end gap-2">
          {trip.status === "cancelled" ? (
            <Link
              href={`/recovery/${trip.id}`}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-primary rounded"
            >
              <span>Find Alternatives</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : trip.status === "delayed" ? (
            <Link
              href={`/trips/${trip.id}`}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-primary rounded"
            >
              <span>View Status</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : (
            <Link
              href={`/trips/${trip.id}`}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-primary rounded"
            >
              <span>View Trip</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Stacked Card (< 768px) */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-muted-foreground">
              {formatDate(segment.departureTime)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              · PNR {trip.pnr}
            </span>
          </div>
          <TrainStatusBadge
            departureTime={segment.departureTime}
            arrivalTime={segment.arrivalTime}
            tripStatus={trip.status}
            syncStatus={trip.syncStatus}
            isPendingSync={trip.isPendingSync}
          />
        </div>

        <div>
          <h3 className="font-medium text-foreground text-sm">
            <Link href={`/trips/${trip.id}`} className="hover:underline">
              {segment.departureStation.city} → {segment.arrivalStation.city}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {segment.trainName} · #{segment.trainNumber} · Class {trip.travelClass}
          </p>
        </div>

        {/* Departure & Arrival separated by hairline */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-hairline text-xs">
          <div>
            <span className="micro-label block">DEPARTURE</span>
            <span className="font-mono font-medium text-foreground">
              {formatTimeWithDay(segment.departureTime)}
            </span>
            <span className="text-muted-foreground font-mono block text-[11px]">
              {segment.departureStation.code}
            </span>
          </div>
          <div>
            <span className="micro-label block">ARRIVAL</span>
            <span className="font-mono font-medium text-foreground">
              {formatTimeWithDay(segment.arrivalTime, segment.dayOffset)}
            </span>
            <span className="text-muted-foreground font-mono block text-[11px]">
              {segment.arrivalStation.code}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          <span className="font-mono text-xs text-muted-foreground">
            {formatCurrency(trip.fare)}
          </span>
          {trip.status === "cancelled" ? (
            <Link
              href={`/recovery/${trip.id}`}
              className="text-xs font-medium text-primary hover:underline touch-target flex items-center"
            >
              Find Alternatives →
            </Link>
          ) : trip.status === "delayed" ? (
            <Link
              href={`/trips/${trip.id}`}
              className="text-xs font-medium text-primary hover:underline touch-target flex items-center"
            >
              View Status →
            </Link>
          ) : (
            <Link
              href={`/trips/${trip.id}`}
              className="text-xs font-medium text-primary hover:underline touch-target flex items-center"
            >
              View Trip →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
