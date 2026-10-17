"use client";

import { useMemo } from "react";
import { classifyTrainOperationalStatus, TrainOperationalStatus } from "@/lib/status/departure-engine";
import { TripStatus } from "@/lib/types";

interface TrainStatusBadgeProps {
  departureTime: Date | string | number;
  arrivalTime: Date | string | number;
  tripStatus?: TripStatus;
  syncStatus?: "synced" | "pending" | "failed";
  isPendingSync?: boolean;
  showDetail?: boolean;
  className?: string;
}

export function TrainStatusBadge({
  departureTime,
  arrivalTime,
  tripStatus,
  syncStatus,
  isPendingSync,
  showDetail = false,
  className = "",
}: TrainStatusBadgeProps) {
  const opStatus: TrainOperationalStatus = useMemo(() => {
    return classifyTrainOperationalStatus(departureTime, arrivalTime);
  }, [departureTime, arrivalTime]);

  // Offline mutation queue sync indicator
  if (syncStatus === "pending" || isPendingSync) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 animate-pulse ${className}`}
        title="Saved offline in local transaction queue. Syncing upon network availability."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" aria-hidden="true" />
        <span>Saved offline - syncing...</span>
      </div>
    );
  }

  // If explicitly cancelled, cancellation badge takes priority
  if (tripStatus === "cancelled") {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" aria-hidden="true" />
        <span>CANCELLED</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide ${opStatus.badgeClass} ${className}`}
      title={opStatus.detail}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${opStatus.dotClass}`} aria-hidden="true" />
      <span>{opStatus.label}</span>
      {showDetail && (
        <span className="text-[10px] font-normal opacity-85 ml-1 border-l border-current/30 pl-1.5">
          {opStatus.detail}
        </span>
      )}
    </div>
  );
}
