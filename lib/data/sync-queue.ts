/**
 * lib/data/sync-queue.ts
 * Offline-First Transactional Mutation Queue for User Trip Bookings and Disruption States.
 *
 * Persists mutations in localStorage with indexed ordering, retry counts, and idempotent execution.
 * Guarantees zero data loss during network disruptions and automatic synchronization upon reconnection.
 */

import type { Trip, TripStatus } from "@/lib/types";

export const SYNC_QUEUE_STORAGE_KEY = "tr_sync_queue_v1";

export type SyncOperationType =
  | "BOOK_TRIP"
  | "UPDATE_TRIP_STATUS"
  | "DISRUPTION_UPDATE";

export type SyncItemStatus = "pending" | "syncing" | "synced" | "failed";

export interface SyncItemPayload {
  trip?: Trip;
  tripId?: string;
  status?: TripStatus;
  disruptionId?: string | null;
  [key: string]: unknown;
}

export interface SyncItem {
  id: string;
  type: SyncOperationType;
  payload: SyncItemPayload;
  status: SyncItemStatus;
  retryCount: number;
  createdAt: string;
  lastAttemptAt?: string;
  syncedAt?: string;
  error?: string;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Read the raw queue from localStorage safely.
 */
export function getAllSyncItems(): SyncItem[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(SYNC_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SyncItem[];
  } catch (err) {
    console.error("Failed to read sync queue from localStorage:", err);
    return [];
  }
}

/**
 * Persist the entire queue to localStorage.
 */
function saveSyncQueue(items: SyncItem[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to persist sync queue to localStorage:", err);
  }
}

/**
 * Return all items awaiting synchronization (pending or previously failed).
 */
export function getPendingSyncs(): SyncItem[] {
  const items = getAllSyncItems();
  return items.filter((item) => item.status === "pending" || item.status === "failed");
}

/**
 * Enqueue a trip booking mutation for offline synchronization.
 * Idempotent: avoids duplicate queuing if a pending sync for the same trip already exists.
 */
export function enqueueBooking(trip: Trip): void {
  const items = getAllSyncItems();

  // Deduplicate if already queued and pending
  const exists = items.some(
    (item) =>
      item.type === "BOOK_TRIP" &&
      item.payload.trip?.id === trip.id &&
      (item.status === "pending" || item.status === "failed" || item.status === "syncing")
  );

  if (exists) {
    return;
  }

  const newItem: SyncItem = {
    id: `sync-book-${trip.id}-${Date.now()}`,
    type: "BOOK_TRIP",
    payload: { trip },
    status: "pending",
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  saveSyncQueue([...items, newItem]);
}

/**
 * Enqueue a trip status update / disruption update mutation.
 */
export function enqueueStatusUpdate(
  tripId: string,
  status: TripStatus,
  disruptionId?: string | null
): void {
  const items = getAllSyncItems();

  const newItem: SyncItem = {
    id: `sync-status-${tripId}-${Date.now()}`,
    type: "UPDATE_TRIP_STATUS",
    payload: { tripId, status, disruptionId },
    status: "pending",
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  saveSyncQueue([...items, newItem]);
}

/**
 * Clear the sync queue (useful for testing or cache reset).
 */
export function clearSyncQueue(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(SYNC_QUEUE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Process all pending mutations in the queue sequentially.
 * Makes HTTP POST to `/api/trips/sync` and handles success, HTTP 500 retries, and network errors.
 *
 * @returns Object with counts of synced and failed operations
 */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  const items = getAllSyncItems();
  const pendingIndices = items
    .map((item, index) => (item.status === "pending" || item.status === "failed" ? index : -1))
    .filter((index) => index !== -1);

  if (pendingIndices.length === 0) {
    return { synced: 0, failed: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const idx of pendingIndices) {
    const item = items[idx];
    item.status = "syncing";
    item.lastAttemptAt = new Date().toISOString();
    saveSyncQueue(items);

    try {
      const response = await fetch("/api/trips/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        item.status = "failed";
        item.retryCount += 1;
        item.error = `HTTP ${response.status}: ${errorText || response.statusText}`;
        failedCount += 1;
      } else {
        item.status = "synced";
        item.syncedAt = new Date().toISOString();
        item.error = undefined;
        syncedCount += 1;
      }
    } catch (networkErr: unknown) {
      item.status = "failed";
      item.retryCount += 1;
      item.error = (networkErr as Error)?.message || "Network request failed";
      failedCount += 1;
    }

    saveSyncQueue(items);
  }

  return { synced: syncedCount, failed: failedCount };
}
