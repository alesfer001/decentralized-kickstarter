"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchIndexerStatus } from "@/lib/api";
import { IndexerPhase, IndexerStatus } from "@/lib/types";

/** How often to re-check the indexer while it is waking up or syncing */
const POLL_INTERVAL_MS = 3000;

/** How long an unreachable indexer counts as "waking up" before it is shown as offline */
const GIVE_UP_AFTER_MS = 3 * 60 * 1000;

/** Past this, "usually takes under a minute" would read as wrong, so the wake-up copy changes */
const SLOW_WAKE_SECONDS = 60;

const INDEXER_BADGE: Record<IndexerPhase, { dot: string; label: string }> = {
  [IndexerPhase.Checking]: { dot: "bg-zinc-400", label: "Connecting" },
  [IndexerPhase.Waking]: { dot: "bg-amber-500 animate-pulse", label: "Waking up" },
  [IndexerPhase.Syncing]: { dot: "bg-amber-500 animate-pulse", label: "Syncing" },
  [IndexerPhase.Ready]: { dot: "bg-green-500", label: "Online" },
  [IndexerPhase.Offline]: { dot: "bg-red-500", label: "Offline" },
};

/**
 * Poll the indexer until it is ready to serve data.
 * The hosted indexer sleeps when idle and rebuilds its database on boot,
 * so a first visit can land while it is waking up or still syncing.
 * @returns the current phase, seconds spent waiting, and a retry function for the offline state
 */
export function useIndexerReady() {
  const [phase, setPhase] = useState<IndexerPhase>(IndexerPhase.Checking);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const ticker = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    async function poll() {
      const status = await fetchIndexerStatus();
      if (cancelled) return;

      if (status === IndexerStatus.Ready) {
        clearInterval(ticker);
        setPhase(IndexerPhase.Ready);
        return;
      }
      if (status === IndexerStatus.Unreachable && Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
        clearInterval(ticker);
        setPhase(IndexerPhase.Offline);
        return;
      }
      setPhase(status === IndexerStatus.Syncing ? IndexerPhase.Syncing : IndexerPhase.Waking);
      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      clearInterval(ticker);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setPhase(IndexerPhase.Checking);
    setElapsedSeconds(0);
    setAttempt((n) => n + 1);
  }, []);

  return { phase, elapsedSeconds, retry };
}

interface IndexerStatusBadgeProps {
  phase: IndexerPhase;
}

/**
 * Small dot + label showing indexer availability
 */
export function IndexerStatusBadge({ phase }: IndexerStatusBadgeProps) {
  const badge = INDEXER_BADGE[phase];
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${badge.dot}`} />
      <span className="text-sm text-ink-2">Indexer: {badge.label}</span>
    </div>
  );
}

interface IndexerWaitNoticeProps {
  phase: IndexerPhase;
  elapsedSeconds: number;
  onRetry: () => void;
}

/**
 * Explains why data isn't showing yet. Renders nothing once the indexer is ready.
 */
export function IndexerWaitNotice({ phase, elapsedSeconds, onRetry }: IndexerWaitNoticeProps) {
  if (phase === IndexerPhase.Offline) {
    return (
      <div className="mb-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-medium text-red-800 dark:text-red-200">{"Can't reach the indexer"}</p>
          <p className="text-sm text-red-700 dark:text-red-300">
            {"It hasn't answered for a few minutes. Campaigns will show up as soon as it's back."}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="shrink-0 px-4 py-2 font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (phase !== IndexerPhase.Waking && phase !== IndexerPhase.Syncing) return null;

  const waking = phase === IndexerPhase.Waking;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3"
    >
      <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-amber-300 dark:border-amber-700 border-t-amber-600 dark:border-t-amber-400 animate-spin" />
      <div className="flex-1">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          {waking ? "Waking up the indexer" : "Syncing campaigns from the chain"}
        </p>
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {!waking
            ? "Reading the latest campaigns and pledges. Almost there."
            : elapsedSeconds < SLOW_WAKE_SECONDS
              ? "The testnet indexer sleeps when nobody's using it. This usually takes under a minute."
              : "Taking a bit longer than usual. Still trying, no need to refresh."}
        </p>
      </div>
    </div>
  );
}
