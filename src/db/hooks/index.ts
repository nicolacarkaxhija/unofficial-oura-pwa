// ─── DB Hooks Barrel ──────────────────────────────────────────────────────────
//
// Single import point for all Dexie reactive hooks.
// Usage: import { useSleepDays, useHasData } from '@/db/hooks'
//
// Each domain module keeps its hooks co-located with its query logic;
// this barrel exists solely for ergonomic imports in page components.

export { useSleepDays, useSleepDay, useSleepSession } from './useSleep'
export { useReadinessDays, useReadinessDay, useResilienceDay } from './useReadiness'
export {
  useActivityDays,
  useActivityDay,
  useWorkoutsForDay,
  useMeditationsForDay,
  useStressForDay,
} from './useActivity'
export { useImportStats, useHasData } from './useMeta'
