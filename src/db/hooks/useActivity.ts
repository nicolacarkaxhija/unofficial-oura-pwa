// ─── Activity Hooks ───────────────────────────────────────────────────────────
//
// Why useLiveQuery instead of useState + useEffect + db.activityDays.toArray()?
//
// useLiveQuery subscribes to the underlying Dexie table and automatically
// re-renders the component whenever the table changes — e.g., the moment an
// import completes and bulkPut() lands new ActivityDay, Workout, or StressPoint
// rows, every component using these hooks re-renders with fresh data. With
// useState/useEffect you would need an event bus, a Zustand store action, or an
// explicit refetch trigger. useLiveQuery eliminates that entire coordination
// layer: the database IS the state.
//
// Return type: T | undefined
//   undefined signals "query in flight" (first render before IndexedDB responds).
//   Pages should render a loading skeleton while the value is undefined.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/client'
import type { ActivityDay, Workout, Meditation, StressPoint } from '@/db/schema'
import { computeDailyStressAverages, type DailyStressAverage } from '@/lib/aggregates'

/** Returns the most recent `limit` activity days, newest first. */
export function useActivityDays(limit = 90): ActivityDay[] | undefined {
  return useLiveQuery(
    () => db.activityDays.orderBy('day').reverse().limit(limit).toArray(),
    // Re-run when limit changes (e.g., the user expands the date range).
    [limit],
  )
}

/**
 * Returns the most recent ActivityDay on record, or null when the table is
 * empty. See useLatestSleepDay for the "latest vs today" rationale.
 */
export function useLatestActivityDay(): ActivityDay | null | undefined {
  return useLiveQuery(async () => {
    const row = await db.activityDays.orderBy('day').reverse().first()
    return row ?? null
  }, [])
}

/** Returns the ActivityDay summary for a single calendar date. */
export function useActivityDay(date: string): ActivityDay | null | undefined {
  // null = no record for this date (vs undefined = query in flight).
  return useLiveQuery(async () => (await db.activityDays.get(date)) ?? null, [date])
}

/**
 * Returns all Workouts logged on a given calendar date.
 *
 * Uses the `day` index declared in client.ts (`workouts: 'id, day'`)
 * rather than a full-table scan, keeping this fast for users with years of
 * data. Multiple workouts per day (e.g., morning run + evening swim) are
 * returned in insertion order — callers sort if a specific order is needed.
 */
export function useWorkoutsForDay(date: string): Workout[] | undefined {
  return useLiveQuery(() => db.workouts.where('day').equals(date).toArray(), [date])
}

/**
 * Returns all Meditations logged on a given calendar date.
 *
 * Uses the `day` index (`meditations: 'id, day'`) for efficient lookup.
 */
export function useMeditationsForDay(date: string): Meditation[] | undefined {
  return useLiveQuery(() => db.meditations.where('day').equals(date).toArray(), [date])
}

/**
 * Returns all StressPoints for a given calendar date, sorted chronologically.
 *
 * StressPoints are sub-day measurements (typically every few minutes) so
 * a single day can have dozens of rows. The compound index `[day+timestamp]`
 * declared in client.ts (`stressPoints: '++id, [day+timestamp]'`) is used
 * here: `.where('day').equals(date)` hits that index for an O(log n) range
 * scan, then `.sortBy('timestamp')` orders results chronologically for chart
 * rendering without requiring a secondary JS sort.
 */
export function useStressForDay(date: string): StressPoint[] | undefined {
  return useLiveQuery(() => db.stressPoints.where('day').equals(date).sortBy('timestamp'), [date])
}

/**
 * Daily average stress/recovery for the most recent `windowDays` days on
 * record (not counting back from today — exports are historical).
 *
 * Query strategy: find the newest stress day, then range-scan the standalone
 * `day` index from the window's cutoff. This touches only the rows in the
 * window instead of loading a potentially multi-year stress table (sub-day
 * resolution makes stressPoints by far the largest table).
 *
 * undefined = query in flight; [] = no stress data on record (the caller
 * skips the chart entirely).
 */
export function useDailyStressAverages(windowDays = 90): DailyStressAverage[] | undefined {
  return useLiveQuery(async () => {
    const newest = await db.stressPoints.orderBy('day').last()
    if (!newest) return []

    // Cutoff is windowDays-1 before the newest day, inclusive on both ends.
    const cutoffDate = new Date(`${newest.day}T00:00:00Z`)
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - (windowDays - 1))
    const cutoff = cutoffDate.toISOString().slice(0, 10)

    const points = await db.stressPoints
      .where('day')
      .between(cutoff, newest.day, true, true)
      .toArray()
    return computeDailyStressAverages(points, windowDays)
  }, [windowDays])
}
