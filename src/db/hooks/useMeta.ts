// ─── Meta Hooks ───────────────────────────────────────────────────────────────
//
// Why useLiveQuery instead of useState + useEffect?
//
// useLiveQuery subscribes to the underlying Dexie table and automatically
// re-renders the component whenever the table changes — crucially, this means
// the import progress UI and the "has data" gate both update the instant the
// import writes its final stats to the meta table, with zero manual signalling.
// With useState/useEffect you would need an event bus, a Zustand store action,
// or a polling mechanism. useLiveQuery eliminates that entire coordination
// layer: the database IS the state.
//
// Return type: T | undefined
//   undefined signals "query in flight" (first render before IndexedDB responds).
//   The import progress screen and the onboarding gate should treat undefined
//   as a loading state and avoid flashing empty content.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/client'
import type { ImportStats } from '@/db/schema'

/**
 * Returns the most recent ImportStats written after a successful import.
 *
 * The meta table stores arbitrary singleton values keyed by string. The
 * 'importStats' entry holds an ImportStats object in its `value` field.
 * We cast `value as ImportStats` here because the MetaEntry schema uses
 * `value: unknown` to allow heterogeneous keys — the import connector
 * guarantees it writes a valid ImportStats shape for this key.
 *
 * Returns undefined while loading, or undefined if no import has run yet.
 */
export function useImportStats(): ImportStats | undefined {
  return useLiveQuery(async () => {
    const entry = await db.meta.get('importStats')
    // Return undefined (not null) when the key doesn't exist yet so the
    // caller's `if (!stats)` guard covers both the loading and the "no import"
    // cases identically.
    return entry ? (entry.value as ImportStats) : undefined
  })
}

/**
 * Returns whether the database contains any data.
 *
 * Used to gate the onboarding flow: if false (or undefined while loading),
 * show the import prompt rather than the dashboard. Querying sleepDays.count()
 * is the cheapest proxy for "has any data" — if sleep data exists, the rest
 * of the import has run too.
 *
 * Returns undefined while the count query is in flight (first render only).
 */
export function useHasData(): boolean | undefined {
  return useLiveQuery(async () => {
    const count = await db.sleepDays.count()
    return count > 0
  })
}
