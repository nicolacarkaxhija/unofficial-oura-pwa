// ─── Readiness Hooks ──────────────────────────────────────────────────────────
//
// Why useLiveQuery instead of useState + useEffect + db.readinessDays.toArray()?
//
// useLiveQuery subscribes to the underlying Dexie table and automatically
// re-renders the component whenever the table changes — e.g., the moment an
// import completes and bulkPut() lands new ReadinessDay rows, every component
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
import type { ReadinessDay, ResilienceDay } from '@/db/schema'

/** Returns the most recent `limit` readiness days, newest first. */
export function useReadinessDays(limit = 90): ReadinessDay[] | undefined {
  return useLiveQuery(
    () => db.readinessDays.orderBy('day').reverse().limit(limit).toArray(),
    // Re-run when limit changes (e.g., the user expands the date range).
    [limit],
  )
}

/** Returns the ReadinessDay summary for a single calendar date. */
export function useReadinessDay(date: string): ReadinessDay | undefined {
  return useLiveQuery(
    () => db.readinessDays.get(date),
    // Re-run when the date prop changes (navigation between days).
    [date],
  )
}

/**
 * Returns the ResilienceDay for a single calendar date.
 *
 * Resilience is a separate Oura concept from readiness: it measures how well
 * the body is recovering from stress over multi-day windows rather than
 * overnight recovery. Kept in its own table (resilienceDays) because it has
 * a different field set and Oura exposes it via a separate CSV export.
 */
export function useResilienceDay(date: string): ResilienceDay | undefined {
  return useLiveQuery(
    () => db.resilienceDays.get(date),
    [date],
  )
}
