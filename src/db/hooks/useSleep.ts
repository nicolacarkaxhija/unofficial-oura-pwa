// ─── Sleep Hooks ──────────────────────────────────────────────────────────────
//
// Why useLiveQuery instead of useState + useEffect + db.sleepDays.toArray()?
//
// useLiveQuery subscribes to the underlying Dexie table and automatically
// re-renders the component whenever the table changes — e.g., the moment an
// import completes and bulkPut() lands 365 new SleepDay rows, every component
// using these hooks re-renders with fresh data. With useState/useEffect you
// would need an event bus, a Zustand store action, or an explicit refetch
// trigger to achieve the same thing. useLiveQuery eliminates that entire
// coordination layer: the database IS the state.
//
// Return type: T | undefined
//   undefined signals "query in flight" (first render before IndexedDB responds).
//   Pages should render a loading skeleton while the value is undefined.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/client'
import type { SleepDay, SleepSession } from '@/db/schema'

/** Returns the most recent `limit` sleep days, newest first. */
export function useSleepDays(limit = 90): SleepDay[] | undefined {
  return useLiveQuery(
    () => db.sleepDays.orderBy('day').reverse().limit(limit).toArray(),
    // Re-run the query when limit changes (e.g., the user expands the date range).
    [limit],
  )
}

/**
 * Returns the most recent SleepDay on record, or null when the table is empty.
 *
 * Why "latest" rather than "today": a GDPR export is always historical — its
 * newest row is at best yesterday, so querying today's date would never match.
 * `null` (empty table) is kept distinct from `undefined` (query in flight) so
 * callers can tell "no data" apart from "still loading".
 */
export function useLatestSleepDay(): SleepDay | null | undefined {
  return useLiveQuery(async () => {
    const row = await db.sleepDays.orderBy('day').reverse().first()
    return row ?? null
  }, [])
}

/** Returns the SleepDay summary for a single calendar date. */
export function useSleepDay(date: string): SleepDay | undefined {
  return useLiveQuery(
    () => db.sleepDays.get(date),
    // Re-run when the date prop changes (navigation between days).
    [date],
  )
}

/**
 * Returns the first SleepSession whose `day` field matches the given date.
 *
 * Uses the `day` index declared in client.ts (`sleepSessions: 'id, day'`)
 * rather than a full-table scan, so it stays fast even with thousands of
 * sessions stored. `.first()` picks the primary long-sleep session; if a
 * night contains a late-nap session too, the nap is excluded here — callers
 * that need all sessions for a night should query `.toArray()` instead.
 */
export function useSleepSession(date: string): SleepSession | undefined {
  return useLiveQuery(() => db.sleepSessions.where('day').equals(date).first(), [date])
}
