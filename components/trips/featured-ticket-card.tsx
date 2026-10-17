"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Trip } from "@/lib/types";
import { formatTimeWithDay, formatDate, formatCurrency } from "@/lib/format";

interface FeaturedTicketCardProps {
  trip: Trip;
  onViewBooking?: (trip: Trip) => void;
}

export function FeaturedTicketCard({ trip, onViewBooking }: FeaturedTicketCardProps) {
  const segment = trip.segments[0];
  const isCancelled = trip.status === "cancelled";

  return (
    <article
      className="w-full bg-disruption-tint border border-disruption/30 rounded-xl p-6 text-foreground relative overflow-hidden transition-colors duration-150"
      aria-labelledby={`featured-trip-${trip.id}`}
    >
      {/* Top Meta Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-disruption/20 text-xs">
        <div className="flex items-center gap-2">
          {trip.syncStatus === "pending" || trip.isPendingSync ? (
            <span className="micro-label text-amber-600 dark:text-amber-400 font-semibold tracking-wider animate-pulse">
              SAVED OFFLINE · SYNCING...
            </span>
          ) : (
            <span className="micro-label text-disruption font-semibold tracking-wider">
              {isCancelled ? "NEEDS ATTENTION · CANCELLED" : "NEEDS ATTENTION · DELAYED"}
            </span>
          )}
          <span className="text-muted-foreground">•</span>
          <span className="font-mono text-muted-foreground">
            PNR {trip.pnr}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground">{segment.trainName}</span>
          <span className="font-mono text-muted-foreground">#{segment.trainNumber}</span>
          <span className="font-mono font-medium text-foreground">Class {trip.travelClass}</span>
        </div>
      </div>

      {/* Main Ticket Section: Route Headline & Route Line */}
      <div className="pt-4 pb-2 space-y-4">
        {/* Route Headline in Newsreader Display font 28px */}
        <h2
          id={`featured-trip-${trip.id}`}
          className="text-[26px] md:text-[28px] font-display text-foreground tracking-tight leading-tight"
        >
          {segment.departureStation.city} to {segment.arrivalStation.city}
        </h2>

        {/* Railway Route Line with Station Codes & Train Icon */}
        <div className="ticket-route-line my-3">
          <div className="w-full flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>{segment.departureStation.name}</span>
            <span>{segment.arrivalStation.name}</span>
          </div>
        </div>

        {/* Departure & Arrival: Label-over-value separated by hairline, not nested boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-hairline">
          <div>
            <span className="micro-label block">DEPARTURE</span>
            <p className="font-mono text-lg font-semibold text-foreground mt-0.5">
              {formatTimeWithDay(segment.departureTime)}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {segment.departureStation.code} · {formatDate(segment.departureTime)}
            </p>
          </div>

          <div>
            <span className="micro-label block">ARRIVAL</span>
            <p className="font-mono text-lg font-semibold text-foreground mt-0.5">
              {formatTimeWithDay(segment.arrivalTime, segment.dayOffset)}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {segment.arrivalStation.code} · {formatDate(segment.arrivalTime)}
            </p>
          </div>

          <div>
            <span className="micro-label block">PASSENGER</span>
            <p className="text-sm font-medium text-foreground mt-1">
              {trip.passengerName}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {trip.coach ? `Coach ${trip.coach} · ${trip.berth}` : "Berth pending"}
            </p>
          </div>

          <div>
            <span className="micro-label block">STATUS & FARE</span>
            <p className="font-mono text-sm font-semibold text-disruption mt-1">
              {formatCurrency(trip.fare)} Refundable
            </p>
            <p className="text-xs text-muted-foreground">
              Zero cancellation deduction
            </p>
          </div>
        </div>

        {/* Explanation Reason */}
        <div className="pt-2 text-xs text-foreground/90 leading-relaxed">
          <span className="font-medium text-disruption">Disruption reason: </span>
          <span>{trip.disruptionReason ?? "Emergency track maintenance and safety interlocking works."}</span>
          {trip.neededByTime && (
            <span className="ml-1 text-muted-foreground">
              (Meeting deadline: {formatTimeWithDay(trip.neededByTime, segment.dayOffset)})
            </span>
          )}
        </div>
      </div>

      {/* Signature Element: Dashed Stub Divider with Notch Cutouts */}
      <div className="relative flex items-center my-4 -mx-6" aria-hidden="true">
        <div className="w-3.5 h-6 bg-background border-y border-r border-disruption/30 rounded-r-full -ml-px flex-shrink-0" />
        <div className="flex-1 border-t border-dashed border-disruption/30 mx-2" />
        <div className="w-3.5 h-6 bg-background border-y border-l border-disruption/30 rounded-l-full -mr-px flex-shrink-0" />
      </div>

      {/* Action Bar: Exactly ONE primary button, ONE secondary button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="text-xs text-muted-foreground">
          {trip.refund ? (
            <span>Refund of <strong className="text-foreground font-mono">{formatCurrency(trip.refund.refundAmount)}</strong> is in progress to original payment mode.</span>
          ) : (
            <span>Automatic rail manifest rebooking available.</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onViewBooking ? (
            <button
              type="button"
              onClick={() => onViewBooking(trip)}
              className="w-full sm:w-auto h-10 px-4 rounded-[8px] border border-border bg-surface text-sm font-medium text-foreground hover:bg-background transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              View booking
            </button>
          ) : (
            <Link
              href={`/trips/${trip.id}`}
              className="w-full sm:w-auto h-10 px-4 rounded-[8px] border border-border bg-surface text-sm font-medium text-foreground hover:bg-background transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              View booking
            </Link>
          )}

          <Link
            href={`/recovery/${trip.id}`}
            className="w-full sm:w-auto h-10 px-5 rounded-[8px] bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span>Find Alternatives</span>
            <ArrowRight className="w-4 h-4 stroke-[1.5]" />
          </Link>
        </div>
      </div>
    </article>
  );
}
