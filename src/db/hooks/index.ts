// ─── DB Hooks Barrel ──────────────────────────────────────────────────────────
//
// Single import point for all Dexie reactive hooks.
// Usage: import { useSleepDays, useHasData } from '@/db/hooks'
//
// Each domain module keeps its hooks co-located with its query logic;
// this barrel exists solely for ergonomic imports in page components.

export { useSleepDays, useSleepDay, useLatestSleepDay, useSleepSession } from './useSleep'
export {
  useReadinessDays,
  useReadinessDay,
  useLatestReadinessDay,
  useResilienceDay,
} from './useReadiness'
export {
  useActivityDays,
  useActivityDay,
  useLatestActivityDay,
  useWorkoutsForDay,
  useMeditationsForDay,
  useStressForDay,
  useDailyStressAverages,
} from './useActivity'
export { useImportStats, useHasData } from './useMeta'
