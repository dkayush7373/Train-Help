import { NextResponse } from "next/server";
import { createTrip, updateTripStatus } from "@/lib/data/trips";
import type { DbTrip } from "@/lib/data/types";
import type { SyncItem } from "@/lib/data/sync-queue";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const item: SyncItem = body.item || body;

    if (!item || !item.type) {
      return NextResponse.json(
        { error: "Invalid sync request: mutation item is required." },
        { status: 400 }
      );
    }

    if (item.type === "BOOK_TRIP") {
      const trip = item.payload.trip;
      if (!trip) {
        return NextResponse.json(
          { error: "Missing trip payload for BOOK_TRIP mutation." },
          { status: 400 }
        );
      }

      const segment = trip.segments?.[0];
      const dbTrip: Omit<DbTrip, "id" | "created_at"> = {
        schedule_id: null,
        passenger_id: "default-passenger",
        passenger_name: trip.passengerName || "Passenger",
        train_number: segment?.trainNumber || "00000",
        from_station_code: segment?.departureStation?.code || "SBC",
        to_station_code: segment?.arrivalStation?.code || "NDLS",
        status: "CONFIRMED",
        pnr: trip.pnr,
        seat_info: {
          coach: trip.coach || "B1",
          berth: trip.berth || "1",
          class: trip.travelClass || "3A",
        },
        departure_time: segment?.departureTime
          ? new Date(segment.departureTime).toISOString()
          : new Date().toISOString(),
        arrival_time: segment?.arrivalTime
          ? new Date(segment.arrivalTime).toISOString()
          : new Date().toISOString(),
        booked_at: new Date().toISOString(),
      };

      const created = await createTrip(dbTrip);

      return NextResponse.json({
        success: true,
        mutationId: item.id,
        tripId: trip.id,
        dbTrip: created,
      });
    }

    if (item.type === "UPDATE_TRIP_STATUS") {
      const { tripId, status, disruptionId } = item.payload;
      if (!tripId || !status) {
        return NextResponse.json(
          { error: "Missing tripId or status for UPDATE_TRIP_STATUS mutation." },
          { status: 400 }
        );
      }

      const dbStatus =
        status === "recovered" || status === "rebooked"
          ? "REBOOKED"
          : status === "cancelled"
          ? "CANCELLED"
          : status === "delayed"
          ? "DELAYED"
          : "CONFIRMED";

      const updated = await updateTripStatus(tripId, dbStatus, disruptionId ?? null);

      return NextResponse.json({
        success: true,
        mutationId: item.id,
        tripId,
        updated,
      });
    }

    return NextResponse.json(
      { error: `Unsupported mutation type: ${item.type}` },
      { status: 400 }
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error processing sync item:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error during sync processing." },
      { status: 500 }
    );
  }
}
