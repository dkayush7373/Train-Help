"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useApp } from "@/context/app-context";
import { formatTimeWithDay, formatCurrency, formatDate } from "@/lib/format";
import { BookingModal } from "@/components/trips/booking-modal";
import { RefundTrackerCard } from "@/components/trips/refund-tracker-card";
import { TrainStatusBadge } from "@/components/status/train-status-badge";
import { TrainVibeMeter } from "@/components/vibe/train-vibe-meter";

interface TripDetailViewProps {
  tripId: string;
}

export function TripDetailView({ tripId }: TripDetailViewProps) {
  const { state } = useApp();
  const [bookingOpen, setBookingOpen] = useState(false);

  const trip = state.trips.find((t) => t.id === tripId);

  if (!trip) {
    return (
      <div className="py-12 text-center max-w-md mx-auto space-y-3">
        <h2 className="text-base font-medium text-foreground">
          Trip not found
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          We could not locate railway booking records for trip #{tripId}.
        </p>
        <Link
          href="/trips"
          className="h-10 px-4 rounded-[8px] bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover transition-colors inline-flex items-center justify-center"
        >
          Return to My Trips
        </Link>
      </div>
    );
  }

  const segment = trip.segments[0];
  const refund = trip.refund;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Trips</span>
        </Link>

        <button
          type="button"
          onClick={() => setBookingOpen(true)}
          className="h-8 px-3 rounded-[6px] border border-border bg-surface text-xs font-medium text-foreground hover:bg-background transition-colors"
        >
          View Ticket Details
        </button>
      </div>

      {/* Disruption Alert Panel if Cancelled or Delayed */}
      {trip.status === "cancelled" && (
        <section
          className="w-full bg-disruption-tint border border-disruption/30 rounded-xl p-6 text-foreground space-y-4"
          aria-labelledby="disruption-heading"
        >
          <div className="space-y-1">
            <span className="micro-label text-disruption font-semibold tracking-wider">
              DISRUPTION ALERT · CANCELLED
            </span>
            <h2 id="disruption-heading" className="text-xl font-display font-medium text-foreground">
              Your train has been cancelled
            </h2>
            <p className="text-xs text-foreground/90 leading-relaxed pt-1">
              {segment.trainName} ({segment.trainNumber}) from {segment.departureStation.name} to {segment.arrivalStation.name} was cancelled due to {trip.disruptionReason ? trip.disruptionReason.toLowerCase() : "track maintenance"}.
              {trip.neededByTime && ` Scheduled arrival deadline: ${formatTimeWithDay(trip.neededByTime, segment.dayOffset)}.`}
            </p>
          </div>

          {/* Refund Status */}
          {refund && <RefundTrackerCard refund={refund} />}

          {/* Action: Exactly ONE primary button in navy, never coral */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={`/recovery/${trip.id}`}
              className="h-10 px-5 rounded-[8px] bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover transition-colors inline-flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span>Find Alternative Trains</span>
              <ArrowRight className="w-4 h-4 stroke-[1.5]" />
            </Link>
            <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="h-10 px-4 rounded-[8px] border border-border bg-surface text-foreground text-xs font-medium hover:bg-background transition-colors"
            >
              View Ticket Details
            </button>
          </div>
        </section>
      )}

      {trip.status === "delayed" && (
        <section className="p-5 rounded-xl border border-warning/30 bg-warning-tint text-foreground space-y-2">
          <span className="micro-label text-warning font-semibold">
            TRAIN DELAYED
          </span>
          <p className="text-xs text-foreground/90 leading-relaxed">
            {segment.trainName} ({segment.trainNumber}) is running behind schedule.
            {trip.disruptionReason && ` Reason: ${trip.disruptionReason}.`}
          </p>
        </section>
      )}

      {/* Main Train Journey Details */}
      <article className="bg-surface rounded-xl border border-border p-6 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-4">
          <div>
            <span className="font-mono text-xs text-muted-foreground">
              PNR {trip.pnr}
            </span>
            <h1 className="text-2xl font-display font-medium text-foreground mt-0.5">
              {segment.departureStation.city} to {segment.arrivalStation.city}
            </h1>
          </div>
          <div>
            <TrainStatusBadge
              departureTime={segment.departureTime}
              arrivalTime={segment.arrivalTime}
              tripStatus={trip.status}
              syncStatus={trip.syncStatus}
              isPendingSync={trip.isPendingSync}
              showDetail={true}
            />
          </div>
        </div>

        {/* Route Line */}
        <div className="ticket-route-line my-2">
          <div className="w-full flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>{segment.departureStation.name}</span>
            <span>{segment.arrivalStation.name}</span>
          </div>
        </div>

        {/* Departure & Arrival: Label-over-value separated by hairline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-hairline text-xs">
          <div>
            <span className="micro-label block">DEPARTURE</span>
            <p className="font-mono text-base font-semibold text-foreground mt-0.5">
              {formatTimeWithDay(segment.departureTime)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {segment.departureStation.code} · {formatDate(segment.departureTime)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
              {segment.platform ?? "Platform 1"}
            </p>
          </div>

          <div>
            <span className="micro-label block">ARRIVAL</span>
            <p className="font-mono text-base font-semibold text-foreground mt-0.5">
              {formatTimeWithDay(segment.arrivalTime, segment.dayOffset)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {segment.arrivalStation.code} · {formatDate(segment.arrivalTime)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
              Platform TBA
            </p>
          </div>

          <div>
            <span className="micro-label block">PASSENGER</span>
            <p className="text-sm font-medium text-foreground mt-1">
              {trip.passengerName}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Adult (Confirmed)
            </p>
          </div>

          <div>
            <span className="micro-label block">BERTH & FARE</span>
            <p className="font-mono text-sm font-semibold text-foreground mt-1">
              {trip.coach ? `Coach ${trip.coach} · ${trip.berth}` : "Berth pending"}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Class {trip.travelClass} · {formatCurrency(trip.fare)}
            </p>
          </div>
        </div>
      </article>

      {/* Crowdsourced Coach Vibe & Cleanliness Meter */}
      <TrainVibeMeter
        trainNumber={segment.trainNumber}
        trainName={segment.trainName}
      />

      <BookingModal
        trip={trip}
        open={bookingOpen}
        onOpenChange={setBookingOpen}
      />
    </div>
  );
}
