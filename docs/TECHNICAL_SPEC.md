# Unofficial Oura PWA — Technical Specification

**Version:** 0.1.0  
**Status:** Draft  
**Last updated:** 2026-06-24

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  PWA (Vite + React + TypeScript)                                │
│  Hosting: Cloudflare Pages (free tier, unlimited bandwidth)     │
│                                                                 │
│  ┌───────────────┐    ┌─────────────────────────────────────┐  │
│  │ TanStack      │    │ Dexie.js (IndexedDB)                │  │
│  │ Router        │    │ ┌──────────────────────────────────┐ │  │
│  │ (type-safe    │    │ │ sleepDays | sleepSessions        │ │  │
│  │  :date params)│    │ │ readinessDays                    │ │  │
│  └───────────────┘    │ │ activityDays | workouts          │ │  │
│                       │ │ meditations  | stressPoints      │ │  │
│  ┌───────────────┐    │ │ meta (lastImport, zipBlob)       │ │  │
│  │ Web Worker    │───▶│ └──────────────────────────────────┘ │  │
│  │ JSZip         │    │  ↑ useLiveQuery (reactive reads)     │  │
│  │ Papa Parse    │    └─────────────────────────────────────┘  │
│  └───────────────┘                    │                         │
│         ▲                             ▼                         │
│   ZIP blob uploaded          React components                   │
│   by user from device        uPlot + Recharts                   │
└─────────────────────────────────────────────────────────────────┘

No network calls in v1. No backend. No server. No third-party data storage.
```

**Data flow:**
```
User selects ZIP file
  → main thread hands blob to Web Worker
  → Worker: JSZip.loadAsync() → extract CSVs
  → Worker: Papa.parse() per CSV → validate with Zod → transform to DB types
  → Worker: db.bulkPut() into Dexie tables
  → Worker: postMessage({ progress }) back to main thread
  → useLiveQuery hooks auto-update → React re-renders charts
```

---

## 2. Why These Technology Choices

This section exists so the reasoning is never lost as the codebase evolves. Every choice below was made during the design phase and has a concrete justification.

### 2.1 Vite over Create React App / Next.js

Next.js is built around server-side rendering and serverless function deployment. This app has no server, no public pages to index, and no SSR benefit — every screen reads from local IndexedDB. Next.js would add Server Component vs Client Component cognitive overhead with zero payoff. Vite produces a pure static SPA with native ES module output, native Web Worker support (`new Worker(new URL('./worker.ts', import.meta.url))`), and the fastest HMR in the ecosystem.

### 2.2 TanStack Router over React Router v6

This was a deliberate choice over the more common React Router, worth explaining in full:

The `:date` path parameter (e.g. `/sleep/2024-06-15`) feeds directly into Dexie queries. With React Router, `params.date` is typed as `string | undefined` — you must manually validate and parse it before touching the database, or risk querying with a garbage string. With TanStack Router, the route definition includes a `params.parse` function that runs at navigation time, throwing a typed error for invalid dates before the component even mounts. This is not a cosmetic convenience — it eliminates an entire class of runtime bug where a malformed URL corrupts a database query.

TanStack Query (React Query), by contrast, was **not** adopted. We use Dexie's `useLiveQuery` hook as the reactive data layer. React Query is designed to cache server responses; we have no server responses to cache. Using it here would duplicate state (React Query cache + IndexedDB) and create a synchronisation problem we don't need.

### 2.3 Dexie.js over raw IndexedDB

Raw IndexedDB has a callback-based, verbose API. Dexie wraps it with Promises and — critically — provides `useLiveQuery`, a React hook that re-renders components automatically when the underlying IndexedDB data changes. This replaces an entire state management layer: when the import worker writes new records, every chart that reads those records re-renders without any manual event system.

### 2.4 uPlot for time series, Recharts for score cards

Sleep phase, HR, and HRV data at 5-minute resolution over 90 days is ~25,000 data points. SVG-based libraries (Recharts, Victory, Nivo) create one DOM element per data point. Panning or zooming a 25k-point SVG chart on a mobile browser causes layout thrashing and frame drops below 60fps. uPlot renders to a single `<canvas>` element — 25k points costs the same as 25 points. It is used by Grafana for exactly this class of problem.

Recharts is kept for the simpler score cards and contributor bar charts (≤365 points per chart, no interaction beyond hover) because its React component API is significantly more ergonomic than uPlot's imperative API for small static charts.

### 2.5 Web Worker for ZIP parsing

Parsing a multi-year Oura export — potentially hundreds of thousands of CSV rows across sleep sessions, activity samples, and stress time series — is CPU-bound. Running it on the main thread blocks React's render loop, causing the UI to freeze visibly on mid-range mobile hardware. The Web Worker runs on a separate OS thread, leaving the main thread free to render a live progress bar during import.

### 2.6 Storing the ZIP blob in IndexedDB

Safari's WebKit enforces a 7-day inactivity eviction policy: if the user doesn't open the PWA for 7 consecutive days, IndexedDB (and service worker caches) can be wiped entirely. With no backend to re-fetch from, the only recovery without user action is re-parsing from a stored copy of the original ZIP. Storing the ZIP blob in the `meta` table (under the key `zipBlob`) as a `Blob` object costs ~5–10MB for a year of data — well within Safari's ~50MB soft cap when combined with compact parsed records.

### 2.7 Changesets for versioning

Changesets was chosen over conventional commits + semantic-release because it separates the *intent* of a change (captured in a changeset file written by the developer) from the *mechanism* of bumping versions (automated by CI). This is better for a project where individual features may span multiple PRs and the changelog should read like a product changelog, not a git log.

---

## 3. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Build | Vite | ^6 | Static SPA build, native ESM, native Worker support |
| UI | React | ^19 | Component model |
| Language | TypeScript | ^5.5 | Strict mode throughout |
| PWA | vite-plugin-pwa | ^0.21 | Service worker generation, manifest, offline caching |
| Router | TanStack Router | ^1 | Type-safe route params (see §2.2) |
| Validation | Zod | ^3 | CSV row schema validation in import worker |
| Local DB | Dexie.js | ^4 | IndexedDB wrapper + `useLiveQuery` (see §2.3) |
| ZIP parsing | JSZip | ^3 | Browser-native ZIP decompression in Worker |
| CSV parsing | Papa Parse | ^5 | Worker-mode CSV streaming |
| Time series charts | uPlot | ^1 | Canvas-based, 60fps at 25k+ points (see §2.4) |
| Score charts | Recharts | ^2 | SVG, React-native API, ≤365 data points |
| LTTB | `@graphite-software/lttb` | ^1 | Downsampling for multi-month time series views |
| Styling | Tailwind CSS | ^4 | Utility-first, zero runtime, `dark:` variants |
| Test runner | Vitest | ^2 | Vite-native, no ESM config overhead |
| Component tests | @testing-library/react | ^16 | Standard React testing utilities |
| IndexedDB mock | fake-indexeddb | ^6 | Dexie isolation in Node/jsdom (no browser needed) |
| Network mock | MSW | ^2 | Service worker intercepts, ready for v2 CF Worker |
| E2E | Playwright | ^1 | Real browser, drives ZIP upload against fixture |
| Linting | ESLint | ^9 | Flat config (`eslint.config.ts`) |
| Formatting | Prettier | ^3 | Single quotes, no semicolons, trailing comma |
| Git hooks | Husky + lint-staged | latest | Pre-commit: lint + typecheck on staged files only |
| Versioning | Changesets | ^2 | Semantic versioning with PR-level changelogs |
| CI/CD | GitHub Actions | — | See §10 |
| Hosting | Cloudflare Pages | — | Free tier, unlimited bandwidth, global CDN |

---

## 4. Project Structure

```
.
├── .changeset/
│   └── config.json                  # Changesets: targets 'main', uses semantic versioning
│
├── .github/
│   └── workflows/
│       ├── ci.yml                   # Runs on every PR: typecheck → lint → test → build
│       └── release.yml              # Runs on merge to main: changeset version → build → deploy
│
├── docs/
│   ├── FUNCTIONAL_SPEC.md
│   └── TECHNICAL_SPEC.md            # This file
│
├── src/
│   ├── connectors/
│   │   └── oura/                    # All Oura-specific logic is isolated here.
│   │       │                        # When a second connector (e.g. Withings) is added,
│   │       │                        # it gets its own sibling folder. No shared abstraction
│   │       │                        # until there are two real connectors to abstract over.
│   │       ├── parsers/
│   │       │   ├── sleep.ts         # CSV row → SleepDay + SleepSession
│   │       │   ├── readiness.ts     # CSV row → ReadinessDay + ResilienceDay
│   │       │   └── activity.ts      # CSV row → ActivityDay + Workout + Meditation + StressPoint
│   │       ├── schema.ts            # Zod schemas mirroring the Oura CSV column names exactly
│   │       └── index.ts             # Public API: parseOuraZip(blob) → ParsedExport
│   │
│   ├── db/
│   │   ├── schema.ts                # TypeScript interfaces for every Dexie table
│   │   ├── client.ts                # Singleton Dexie instance (imported everywhere)
│   │   └── hooks/                   # useLiveQuery wrappers — components never call Dexie directly
│   │       ├── useSleepDay.ts       # useSleepDay(date: string) → SleepDay | undefined
│   │       ├── useSleepSession.ts   # useSleepSessions(day: string) → SleepSession[]
│   │       ├── useReadinessDay.ts
│   │       ├── useActivityDay.ts
│   │       └── useStorageInfo.ts    # Reports IndexedDB usage for the Settings screen
│   │
│   ├── workers/
│   │   └── import.worker.ts         # ZIP → parse → validate → bulkPut → postMessage(progress)
│   │
│   ├── components/
│   │   ├── charts/
│   │   │   ├── Hypnogram.tsx        # uPlot: sleep_phase_5_min as colour-filled bands + HR overlay
│   │   │   ├── TimeSeriesChart.tsx  # Generic uPlot wrapper for HR, HRV, MET, stress
│   │   │   ├── ScoreCard.tsx        # Recharts: daily score with trend arrow
│   │   │   └── ContributorBars.tsx  # Recharts: horizontal bar chart for score contributors
│   │   ├── sleep/
│   │   │   ├── SleepSummaryStrip.tsx
│   │   │   └── SleepStageDonut.tsx
│   │   ├── readiness/
│   │   │   └── ResilienceBadge.tsx
│   │   ├── activity/
│   │   │   ├── WorkoutList.tsx
│   │   │   └── ActivityIntensityBar.tsx
│   │   ├── import/
│   │   │   ├── ImportDropzone.tsx   # File picker + drag-and-drop
│   │   │   ├── ImportProgress.tsx   # Progress bar fed by worker postMessage
│   │   │   └── OnboardingGuide.tsx  # Step-by-step instructions for downloading from Oura
│   │   └── ui/                      # Primitives: Button, Card, Badge, ProgressBar, Banner
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── sleep/
│   │   │   ├── SleepList.tsx
│   │   │   └── SleepDetail.tsx
│   │   ├── readiness/
│   │   │   ├── ReadinessList.tsx
│   │   │   └── ReadinessDetail.tsx
│   │   ├── activity/
│   │   │   ├── ActivityList.tsx
│   │   │   └── ActivityDetail.tsx
│   │   └── Settings.tsx
│   │
│   ├── router.ts                    # TanStack Router route tree (all routes defined here)
│   ├── App.tsx                      # Root: eviction check on mount, RouterProvider
│   └── main.tsx                     # Vite entry point
│
├── tests/
│   ├── fixtures/
│   │   ├── build-fixture.ts         # Script to generate oura_export.zip from seed data
│   │   ├── seed/
│   │   │   ├── sleep.csv            # ~30 rows of realistic synthetic data
│   │   │   ├── readiness.csv
│   │   │   └── activity.csv
│   │   └── oura_export.zip          # Pre-built fixture (committed); regenerate with build-fixture.ts
│   ├── unit/
│   │   ├── connectors/
│   │   │   └── oura/
│   │   │       ├── sleep.test.ts    # Parser: valid rows, missing fields, malformed dates
│   │   │       ├── readiness.test.ts
│   │   │       └── activity.test.ts
│   │   └── db/
│   │       └── hooks/               # Dexie hooks with fake-indexeddb
│   └── e2e/
│       ├── import.spec.ts           # Upload fixture ZIP → assert records in DB
│       ├── sleep-detail.spec.ts     # Navigate to /sleep/:date → assert hypnogram visible
│       └── eviction.spec.ts         # Simulate empty DB → assert auto-reparse banner
│
├── public/
│   └── icons/                       # 192px, 512px, maskable variants
│
├── eslint.config.ts                 # Flat config (ESLint v9)
├── prettier.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 5. Dexie Schema

```typescript
// src/db/schema.ts

// --- Sleep ---

export interface SleepDay {
  day: string                       // PK: "YYYY-MM-DD" (Oura's canonical date key)
  id: string
  score: number | null
  contributors: {
    deep_sleep: number | null
    efficiency: number | null
    latency: number | null
    rem_sleep: number | null
    restfulness: number | null
    timing: number | null
    total_sleep: number | null
  }
  optimalBedtime: { start: string; end: string } | null
  status: string | null
  spo2Percentage: number | null
  breathingDisturbanceIndex: number | null
}

export interface SleepSession {
  id: string                        // PK: Oura session UUID
  day: string                       // FK index → join to SleepDay
  bedtimeStart: string              // ISO 8601 datetime
  bedtimeEnd: string
  type: 'long_sleep' | 'late_nap' | 'rest' | string
  efficiency: number | null         // 0–100 %
  latency: number | null            // seconds
  totalSleepDuration: number | null // seconds
  deepSleepDuration: number | null
  remSleepDuration: number | null
  lightSleepDuration: number | null
  awakeTime: number | null
  averageHeartRate: number | null
  lowestHeartRate: number | null
  averageHrv: number | null
  averageBreath: number | null
  restlessPeriods: number | null
  // Time series (5-min resolution, one value per interval)
  // Stored as compact arrays, not JSON-stringified objects
  sleepPhase5Min: number[] | null   // 1=Awake,2=REM,3=Light,4=Deep per Oura encoding
  heartRate: number[] | null
  hrv: number[] | null
  movement30Sec: number[] | null    // 30-sec resolution
}

// --- Readiness ---

export interface ReadinessDay {
  day: string                       // PK
  id: string
  score: number | null
  temperatureDeviation: number | null
  temperatureTrendDeviation: number | null
  stressHigh: boolean | null
  recoveryHigh: boolean | null
  contributors: {
    activity_balance: number | null
    body_temperature: number | null
    hrv_balance: number | null
    previous_day_activity: number | null
    previous_night: number | null
    recovery_index: number | null
    resting_heart_rate: number | null
    sleep_balance: number | null
  }
}

export interface ResilienceDay {
  day: string                       // PK
  id: string
  level: 'exceptional' | 'strong' | 'solid' | 'adequate' | 'weak' | string
  sleepRecovery: number | null
  daytimeRecovery: number | null
  stress: number | null
}

// --- Activity ---

export interface ActivityDay {
  day: string                       // PK
  id: string
  score: number | null
  steps: number | null
  totalCalories: number | null
  activeCalories: number | null
  equivalentWalkingDistance: number | null
  nonWearTime: number | null        // seconds
  restingTime: number | null
  sedentaryTime: number | null
  highActivityTime: number | null
  mediumActivityTime: number | null
  lowActivityTime: number | null
  inactivityAlerts: number | null
  targetCalories: number | null
  targetMeters: number | null
  averageMetMinutes: number | null
  contributors: Record<string, number | null>
  // Time series
  class5Min: number[] | null        // activity class per 5-min interval
  met: number[] | null              // MET value per 5-min interval
}

export interface Workout {
  id: string                        // PK
  day: string                       // FK index
  startDatetime: string
  endDatetime: string
  activity: string
  calories: number | null
  distance: number | null
  intensity: string | null
  label: string | null
  source: string | null
}

export interface Meditation {
  id: string                        // PK
  day: string                       // FK index
  startDatetime: string
  endDatetime: string
  type: string | null
  mood: string | null
}

export interface StressPoint {
  id?: number                       // auto-increment PK
  day: string                       // index (derived from timestamp)
  timestamp: string                 // ISO 8601
  stressValue: number | null
  recoveryValue: number | null
}

// --- Meta ---

export interface MetaEntry {
  key: string                       // PK: 'lastImport' | 'zipBlob' | 'importStats'
  value: unknown
}
```

**Dexie version definition:**
```typescript
// src/db/client.ts
db.version(1).stores({
  sleepDays:      'day',
  sleepSessions:  'id, day',
  readinessDays:  'day',
  resilienceDays: 'day',
  activityDays:   'day',
  workouts:       'id, day',
  meditations:    'id, day',
  stressPoints:   '++id, [day+timestamp]',
  meta:           'key',
})
```

Only indexed fields are listed in `stores()`. All other fields are stored but not indexed — Dexie stores the full object, Dexie just won't query by non-indexed fields. Compound index `[day+timestamp]` on stressPoints supports efficient range queries like "all stress samples on 2024-06-15".

---

## 6. Routing

```typescript
// src/router.ts

// Why TanStack Router: the :date param feeds directly into Dexie queries.
// TanStack Router validates and parses params at the route level, so components
// receive a guaranteed-valid value — not a raw string that might be garbage.
// React Router provides no equivalent without manual runtime checks in every component.

import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router'
import { parseISO, isValid } from 'date-fns'

function parseDateParam(raw: string): string {
  const parsed = parseISO(raw)
  if (!isValid(parsed)) throw new Error(`Invalid date param: ${raw}`)
  return raw // keep as ISO string; Dexie PKs are "YYYY-MM-DD"
}

// Route tree:
// /                    → Dashboard
// /sleep               → SleepList
// /sleep/$date         → SleepDetail
// /readiness           → ReadinessList
// /readiness/$date     → ReadinessDetail
// /activity            → ActivityList
// /activity/$date      → ActivityDetail
// /settings            → Settings
```

---

## 7. Import Worker Protocol

The worker communicates with the main thread via a typed message protocol:

```typescript
// Inbound (main → worker)
type WorkerInput = {
  type: 'IMPORT'
  zipBlob: Blob
}

// Outbound (worker → main)
type WorkerOutput =
  | { type: 'PROGRESS'; phase: string; percent: number }
  | { type: 'COMPLETE'; stats: ImportStats }
  | { type: 'ERROR'; message: string }

type ImportStats = {
  sleepNights: number
  readinessDays: number
  activityDays: number
  workouts: number
  stressPoints: number
}
```

**Worker phases (emitted as PROGRESS events):**
1. `Decompressing ZIP` — JSZip.loadAsync
2. `Parsing sleep data` — Papa Parse sleep CSV
3. `Parsing readiness data`
4. `Parsing activity data`
5. `Writing to database` — Dexie bulkPut (largest phase for multi-year exports)
6. `Storing backup` — writing ZIP blob to `meta` table

---

## 8. Charting Architecture

### 8.1 uPlot (time series)

uPlot takes a `UPlotData` array (`number[][]`): first array is the X axis (Unix timestamps in seconds), subsequent arrays are Y-series values. The wrapper components handle:
1. Converting Oura's ISO datetime strings to Unix timestamps
2. LTTB downsampling when the viewport covers >90 days (reduces to ≤500 points)
3. Responsive resize via `ResizeObserver`

**Hypnogram specifics:** sleep phases are rendered as filled background bands using uPlot's `bands` plugin — not as a line. Each 5-minute interval with `phase === 4` (Deep) fills the Deep band with the Deep colour, etc. This is the most visually distinctive feature of the app.

### 8.2 LTTB downsampling

Applied in a `useMemo` before passing data to uPlot:
```
if (dataPoints.length > 500 && viewRange > 90_days) {
  return lttb(dataPoints, 500)
}
return dataPoints
```
LTTB (Largest Triangle Three Buckets) preserves the visual shape of the curve while discarding redundant intermediate points. It is perceptually indistinguishable from the full dataset at the zoom level being viewed.

### 8.3 Recharts (score cards)

Used only for: daily score cards (line chart of score over time), contributor bars (horizontal `<Bar>`), sleep stage donut (`<PieChart>`), activity intensity stacked bar. All have ≤365 data points and no pinch-zoom interaction.

---

## 9. Safari Eviction Strategy

```typescript
// src/App.tsx — runs on every mount

async function checkAndRepairData() {
  const count = await db.sleepDays.count()

  if (count > 0) return // data present, nothing to do

  const zipEntry = await db.meta.get('zipBlob')

  if (zipEntry?.value) {
    // ZIP blob survived eviction; re-parse silently
    // (useLiveQuery will update charts as records appear)
    showBanner('Restoring your data…')
    const worker = new ImportWorker()
    worker.postMessage({ type: 'IMPORT', zipBlob: zipEntry.value })
    return
  }

  // Both records and ZIP are gone
  showBanner('Your data was cleared by iOS. Import your ZIP to restore it.')
}
```

This runs before any route renders. The banner is non-blocking — the user can navigate freely while re-parse runs in the background.

---

## 10. CI/CD

### 10.1 `ci.yml` (runs on every PR)

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npx tsc --noEmit              # type errors fail the build
      - run: npx eslint .                  # lint errors fail the build
      - run: npx vitest run                # unit + integration tests
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test           # E2E against fixture ZIP
      - run: npx vite build                # ensures build doesn't break
```

### 10.2 `release.yml` (runs on merge to main)

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - uses: changesets/action@v1         # opens "Version Packages" PR or publishes
        with:
          publish: npm run release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: npx vite build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy dist --project-name=unofficial-oura-pwa
```

---

## 11. Linting & Code Quality

### 11.1 TypeScript

```json
// tsconfig.json (strict mode, no compromises)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,   // arr[0] is T | undefined, not T
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "paths": {
      "@/*": ["./src/*"]                 // import from '@/db/client' not '../../db/client'
    }
  }
}
```

### 11.2 ESLint (flat config)

```typescript
// eslint.config.ts
// Rules enabled beyond the defaults:
// - @typescript-eslint/no-explicit-any (never use `any`)
// - @typescript-eslint/consistent-type-imports (import type { Foo } not import { Foo })
// - react-hooks/exhaustive-deps (catches missing useLiveQuery dependencies)
// - import/order (consistent import ordering)
// - no-console (warn — use a logger abstraction instead)
```

### 11.3 Husky + lint-staged

```json
// package.json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md}": ["prettier --write"]
}
```

Pre-commit hook runs lint-staged on staged files only — fast enough to not interrupt flow.

### 11.4 Prettier

```typescript
// prettier.config.ts
export default {
  singleQuote: true,
  semi: false,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'], // sorts Tailwind class names
}
```

---

## 12. Testing Strategy

### 12.1 Philosophy

Because this app processes data through a clean pipeline (CSV → validated types → Dexie → UI), the test boundary is at the parser and database hook levels, not at the component level. Components are thin; logic is in parsers and hooks. This maps naturally to TDD: write the Zod schema and parser test first, make it pass, then wire the component.

### 12.2 Unit tests (Vitest)

**Parsers** (`src/connectors/oura/parsers/*.test.ts`):
- Valid row → correct typed output
- Missing optional fields → `null` (not thrown, not `undefined`)
- Malformed date → Zod error caught and re-thrown as `ParseError`
- Empty `sleep_phase_5_min` string → `null` stored
- `heart_rate` JSON array in CSV → correctly deserialized to `number[]`

**Dexie hooks** (`src/db/hooks/*.test.ts`):
- `fake-indexeddb` replaces real IndexedDB via `beforeEach(() => { Dexie.dependencies.indexedDB = new IDBFactory() })`
- Tests write fixture records directly to Dexie, then assert `useLiveQuery` returns them

### 12.3 Integration tests (Vitest)

**Import worker pipeline** (tested as pure functions, not via actual Worker messaging):
- `parseOuraZip(fixtureBlobBytes)` → `ImportStats` matches expected counts
- Duplicate import → records upserted not duplicated

### 12.4 E2E tests (Playwright)

**`import.spec.ts`:**
- Navigate to `/` → assert onboarding guide visible
- Upload `tests/fixtures/oura_export.zip`
- Assert redirect to Dashboard
- Assert sleep score card shows expected value from fixture

**`sleep-detail.spec.ts`:**
- Navigate to `/sleep/[fixture-date]`
- Assert hypnogram canvas element is present
- Assert session metrics grid shows expected duration

**`eviction.spec.ts`:**
- Clear IndexedDB via `page.evaluate(() => indexedDB.deleteDatabase('OuraPWA'))`
- Reload page
- Assert "Restoring your data…" banner visible (ZIP blob triggers auto-reparse)

### 12.5 MSW

Wired now, used in v2. In v1, MSW handlers are empty — they exist to establish the pattern so adding the Cloudflare Worker proxy mock in v2 requires only adding a handler, not restructuring the test setup.

---

## 13. Versioning (Changesets)

```json
// .changeset/config.json
{
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

**Workflow:**
1. Developer makes a user-facing change
2. Runs `npx changeset` → answers: major/minor/patch? what changed?
3. A `.changeset/xyz.md` file is committed with the PR
4. On merge to main, Changesets Action either:
   - Opens a "Version Packages" PR accumulating changelogs, OR
   - If that PR is merged, tags the release and triggers the Cloudflare deploy

---

## 14. v2 Roadmap (Out of Scope for v1)

| Feature | Technical approach |
|---------|-------------------|
| Automated sync | Cloudflare Worker as CORS proxy; user provides session cookie; Worker POSTs to `membership.ouraring.com/data-export`, polls for completion, downloads ZIP, returns parsed JSON |
| Cookie acquisition | Embedded iframe directed at Oura login; reads cookie context on completion (for desktop); step-by-step copy-paste guide (for mobile) |
| Multi-service | Add `src/connectors/withings/` and `src/connectors/strava/` alongside existing `oura/` — no shared abstraction until two connectors exist and a pattern emerges |
| Background sync | Service Worker Background Sync API + periodic sync (where browser supports it) to re-import on wake |
