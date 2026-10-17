/**
 * lib/data/__tests__/sync-queue.test.ts
 * Unit tests for Offline-First Transactional Sync Queue.
 *
 * Verifies:
 * 1. Transactional mutation queuing in localStorage (enqueueBooking, deduplication).
 * 2. Successful sync execution with Supabase sync API route (status 200).
 * 3. Resilient retry behavior on HTTP 500 errors (retry count increment, retained in queue).
 * 4. Network disconnection / throw resilience.
 * 5. Multi-item batch synchronization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enqueueBooking,
  enqueueStatusUpdate,
  getPendingSyncs,
  getAllSyncItems,
  clearSyncQueue,
  processSyncQueue,
  SYNC_QUEUE_STORAGE_KEY,
} from "../sync-queue";
import type { Trip } from "@/lib/types";

const localStorageStore: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    localStorageStore[key] = String(val);
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    for (const key in localStorageStore) delete localStorageStore[key];
  }),
  key: vi.fn(() => null),
  length: 0,
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

describe("Offline Sync Queue: Mutation Queuing", () => {
  const mockTrip: Trip = {
    id: "trip-sync-001",
    pnr: "9876543210",
    passengerName: "Ananya Sharma",
    travelClass: "3A",
    fare: 1540,
    coach: "B2",
    berth: "24",
    status: "on-time",
    syncStatus: "pending",
    isPendingSync: true,
    segments: [
      {
        trainName: "Vande Bharat Express",
        trainNumber: "20608",
        departureStation: { code: "SBC", city: "Bengaluru", name: "KSR Bengaluru" },
        arrivalStation: { code: "MAS", city: "Chennai", name: "MGR Chennai Central" },
        departureTime: new Date("2026-10-20T06:00:00Z"),
        arrivalTime: new Date("2026-10-20T10:30:00Z"),
        status: "on-time",
        travelClass: "3A",
      },
    ],
  };

  beforeEach(() => {
    mockLocalStorage.clear();
    clearSyncQueue();
  });

  afterEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  it("enqueues a trip booking into localStorage with pending status and 0 retries", () => {
    enqueueBooking(mockTrip);

    const pending = getPendingSyncs();
    expect(pending).toHaveLength(1);

    const item = pending[0];
    expect(item.type).toBe("BOOK_TRIP");
    expect(item.status).toBe("pending");
    expect(item.retryCount).toBe(0);
    expect(item.payload.trip?.id).toBe("trip-sync-001");
    expect(item.payload.trip?.pnr).toBe("9876543210");
    expect(item.createdAt).toBeDefined();

    // Verify raw localStorage entry
    const raw = mockLocalStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(item.id);
  });

  it("prevents duplicate pending queuing for the exact same trip", () => {
    enqueueBooking(mockTrip);
    enqueueBooking(mockTrip);

    const allItems = getAllSyncItems();
    expect(allItems).toHaveLength(1);
    expect(getPendingSyncs()).toHaveLength(1);
  });

  it("enqueues a trip status update mutation", () => {
    enqueueStatusUpdate("trip-sync-001", "cancelled", "disruption-flood-123");

    const pending = getPendingSyncs();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe("UPDATE_TRIP_STATUS");
    expect(pending[0].payload.tripId).toBe("trip-sync-001");
    expect(pending[0].payload.status).toBe("cancelled");
    expect(pending[0].payload.disruptionId).toBe("disruption-flood-123");
  });
});

describe("Offline Sync Queue: Sync Processing & Execution", () => {
  const mockTripA: Trip = {
    id: "trip-a",
    pnr: "1111111111",
    passengerName: "Rahul Dravid",
    travelClass: "2A",
    fare: 2400,
    status: "on-time",
    segments: [
      {
        trainName: "Karnataka Express",
        trainNumber: "12627",
        departureStation: { code: "SBC", city: "Bengaluru", name: "KSR Bengaluru" },
        arrivalStation: { code: "NDLS", city: "New Delhi", name: "New Delhi" },
        departureTime: new Date("2026-10-21T19:20:00Z"),
        arrivalTime: new Date("2026-10-23T10:30:00Z"),
        status: "on-time",
      },
    ],
  };

  const mockTripB: Trip = {
    id: "trip-b",
    pnr: "2222222222",
    passengerName: "Pooja Hegde",
    travelClass: "1A",
    fare: 4200,
    status: "on-time",
    segments: [
      {
        trainName: "Rajdhani Express",
        trainNumber: "22691",
        departureStation: { code: "SBC", city: "Bengaluru", name: "KSR Bengaluru" },
        arrivalStation: { code: "NDLS", city: "New Delhi", name: "New Delhi" },
        departureTime: new Date("2026-10-22T20:00:00Z"),
        arrivalTime: new Date("2026-10-24T05:30:00Z"),
        status: "on-time",
      },
    ],
  };

  beforeEach(() => {
    mockLocalStorage.clear();
    clearSyncQueue();
  });

  afterEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  it("successfully processes pending mutations when server returns HTTP 200", async () => {
    enqueueBooking(mockTripA);

    // Mock successful fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, tripId: "trip-a" }),
    } as unknown as Response);

    const result = await processSyncQueue();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Check that pending queue is now empty
    const pending = getPendingSyncs();
    expect(pending).toHaveLength(0);

    // Check item marked synced
    const all = getAllSyncItems();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("synced");
    expect(all[0].syncedAt).toBeDefined();
    expect(all[0].error).toBeUndefined();
  });

  it("returns 0 synced and 0 failed when queue is empty", async () => {
    const result = await processSyncQueue();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("handles retry behavior and increments retryCount on HTTP 500 errors", async () => {
    enqueueBooking(mockTripA);

    // 1st attempt: Mock 500 Internal Server Error
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Supabase database timeout",
    } as unknown as Response);

    const result1 = await processSyncQueue();

    expect(result1.synced).toBe(0);
    expect(result1.failed).toBe(1);

    // Item must remain in pending sync queue!
    const pendingAfterFirstFail = getPendingSyncs();
    expect(pendingAfterFirstFail).toHaveLength(1);
    expect(pendingAfterFirstFail[0].status).toBe("failed");
    expect(pendingAfterFirstFail[0].retryCount).toBe(1);
    expect(pendingAfterFirstFail[0].error).toContain("HTTP 500: Supabase database timeout");

    // 2nd attempt: Still 500
    const result2 = await processSyncQueue();
    expect(result2.synced).toBe(0);
    expect(result2.failed).toBe(1);

    const pendingAfterSecondFail = getPendingSyncs();
    expect(pendingAfterSecondFail).toHaveLength(1);
    expect(pendingAfterSecondFail[0].retryCount).toBe(2);

    // 3rd attempt: Server recovers and returns 200 OK
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, tripId: "trip-a" }),
    } as unknown as Response);

    const result3 = await processSyncQueue();
    expect(result3.synced).toBe(1);
    expect(result3.failed).toBe(0);

    // Confirmed synced after recovery
    expect(getPendingSyncs()).toHaveLength(0);
    const finalItems = getAllSyncItems();
    expect(finalItems[0].status).toBe("synced");
    expect(finalItems[0].syncedAt).toBeDefined();
  });

  it("handles network rejection (offline/exception) gracefully and queues for retry", async () => {
    enqueueBooking(mockTripA);

    // Mock network fetch throwing TypeError: Failed to fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const result = await processSyncQueue();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);

    const pending = getPendingSyncs();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("failed");
    expect(pending[0].retryCount).toBe(1);
    expect(pending[0].error).toBe("Failed to fetch");
  });

  it("processes multiple items sequentially and records individual statuses", async () => {
    enqueueBooking(mockTripA);
    enqueueBooking(mockTripB);

    let callCount = 0;
    // Trip A succeeds, Trip B fails with 500
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Lock wait timeout",
      } as unknown as Response;
    });

    const result = await processSyncQueue();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);

    const all = getAllSyncItems();
    expect(all).toHaveLength(2);
    expect(all[0].status).toBe("synced");
    expect(all[1].status).toBe("failed");
    expect(all[1].retryCount).toBe(1);

    // Only Trip B remains in pending queue
    const pending = getPendingSyncs();
    expect(pending).toHaveLength(1);
    expect(pending[0].payload.trip?.id).toBe("trip-b");
  });
});
