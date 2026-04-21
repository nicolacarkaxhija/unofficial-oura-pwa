import Dexie, { type Table } from 'dexie'
import type {
  SleepDay,
  SleepSession,
  ReadinessDay,
  ResilienceDay,
  ActivityDay,
  Workout,
  Meditation,
  StressPoint,
  MetaEntry,
} from './schema'

// ─── OuraPWA Database ─────────────────────────────────────────────────────────
//
// Why Dexie over raw IndexedDB:
//   1. Promise-based API instead of event callbacks
//   2. `useLiveQuery` hook — components subscribe to queries and re-render
//      automatically when records change, replacing an entire state layer
//   3. `bulkPut` for upsert semantics — re-importing a ZIP updates records
//      in place rather than duplicating them
//
// Schema version notes:
//   Only indexed fields appear in `stores()`. Every other field is stored
//   inside the object but cannot be queried directly — that's fine because
//   we always query by day (PK) or by FK index. Non-indexed fields are
//   accessed via .get() or .toArray() and filtered in JS.
//
//   When adding a new index: increment the version number and add a new
//   `db.version(N).stores({...})` block. Never modify version 1's schema —
//   this would break existing users' databases.

class OuraPWADatabase extends Dexie {
  sleepDays!: Table<SleepDay, string>
  sleepSessions!: Table<SleepSession, string>
  readinessDays!: Table<ReadinessDay, string>
  resilienceDays!: Table<ResilienceDay, string>
  activityDays!: Table<ActivityDay, string>
  workouts!: Table<Workout, string>
  meditations!: Table<Meditation, string>
  stressPoints!: Table<StressPoint, number>
  meta!: Table<MetaEntry, string>

  constructor() {
    super('OuraPWA')

    this.version(1).stores({
      // Primary key first; remaining comma-separated values are indexes.
      // 'day' alone means the PK is day and there are no additional indexes.
      sleepDays: 'day',
      // sleepSessions: PK is id, secondary index on day for `where('day').equals(date)`
      sleepSessions: 'id, day',
      readinessDays: 'day',
      resilienceDays: 'day',
      activityDays: 'day',
      workouts: 'id, day',
      meditations: 'id, day',
      // stressPoints: auto-increment PK (++id), compound index for
      // efficient date-range queries: `where('[day+timestamp]').between(...)`
      stressPoints: '++id, [day+timestamp]',
      meta: 'key',
    })

    // v2: standalone `day` index on stressPoints. Dexie's where('day') is NOT
    // satisfied by the compound [day+timestamp] index — the stress query in
    // useStressForDay threw a SchemaError, breaking ActivityDetail's stress section.
    this.version(2).stores({
      stressPoints: '++id, day, [day+timestamp]',
    })
  }
}

// Singleton export — import `db` everywhere; never instantiate OuraPWADatabase
// directly. Dexie manages the connection lifecycle.
export const db = new OuraPWADatabase()
