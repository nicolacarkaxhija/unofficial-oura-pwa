# Unofficial Oura PWA — Functional Specification

**Version:** 0.1.0  
**Status:** Draft  
**Last updated:** 2026-06-24

---

## 1. Purpose & Problem Statement

Oura Ring owners lose access to the majority of their biometric data — sleep stages, HRV trends, readiness contributors — when their Oura Membership lapses or is cancelled. The official app degrades to three opaque daily scores with no graphs, no history, and no detail.

Under GDPR Article 20 (Right to Data Portability) and the EU Data Act, Oura is legally required to provide users with their raw data in a structured, machine-readable format at no cost. This app is a client-side viewer for that legally-obtained data export.

**This app does not hack, scrape, or bypass Oura's servers.** It processes a ZIP file the user downloads from Oura's own portal.

---

## 2. Goals

| Goal | Description |
|------|-------------|
| **G1 — Paywall bypass** | Display sleep stages, HRV, readiness contributors, and activity detail that Oura locks behind a subscription |
| **G2 — Privacy by design** | Zero data leaves the device; no account, no backend, no analytics |
| **G3 — Mobile-first** | Installable as a PWA on iOS and Android; works offline after first install |
| **G4 — Zero cost** | Free to use and free to run; no server, no database, no metered hosting |
| **G5 — Openness** | Fully open source; users can verify exactly how their data is handled |

---

## 3. Non-Goals (v1)

- Automated sync (no cookie extraction, no Cloudflare Worker proxy — deferred to v2)
- Multi-service support (Whoop, Withings, Strava — architecture is extensible but out of scope now)
- AI/LLM health summaries
- Social features or data sharing
- Native iOS/Android app (PWA only, to avoid App Store risk)

---

## 4. Target Users

**Primary:** Oura Ring owners (Gen 3 or 4) whose membership has lapsed or who never activated one.

**Secondary:** Active members who prefer a privacy-first alternative viewer or want to explore their raw data beyond what the official app exposes.

**Technical assumption:** Users are comfortable following a short step-by-step guide to download a ZIP file from a web portal. No developer knowledge required.

---

## 5. Legal Basis

- **GDPR Article 20** — Right to Data Portability: users may request their personal data in a structured, commonly used, machine-readable format.
- **EU Data Act (2024)** — Reinforces data portability obligations for connected device manufacturers.
- Oura complies via `membership.ouraring.com/data-export`, which is accessible to all account holders regardless of subscription status.
- This app processes data the user obtained lawfully from Oura's own portal. It does not reverse-engineer, intercept, or modify Oura's systems.

---

## 6. User Flows

### 6.1 First Launch — Empty State

```
Open PWA
  └─ No data in IndexedDB
       └─ Show empty state screen
            ├─ Headline: "Connect your Oura data"
            ├─ Step-by-step guide (inline, no modal):
            │    1. Go to membership.ouraring.com/data-export
            │    2. Log in with your Oura credentials
            │    3. Tap "Request Data Export"
            │    4. Wait for the confirmation email (up to 2.5 hours)
            │    5. Download the ZIP file to your device
            │    6. Return here and tap "Import ZIP"
            └─ "Import ZIP" button → opens file picker
```

### 6.2 ZIP Import

```
User taps "Import ZIP"
  └─ File picker opens (accepts .zip only)
       └─ User selects file
            └─ Progress screen shown (indeterminate → percentage as rows parsed)
                 ├─ Success → redirect to Dashboard
                 └─ Error → inline error message with retry button
```

Import is non-destructive: re-importing a newer ZIP upserts records by primary key (`day` / session `id`). Existing records not present in the new ZIP are kept.

### 6.3 Returning User — Normal Launch

```
Open PWA
  └─ Data exists in IndexedDB
       └─ Go directly to Dashboard
```

### 6.4 Returning User — Data Evicted (iOS Safari)

```
Open PWA
  └─ Records missing from IndexedDB
       └─ ZIP blob found in meta store
            ├─ Silent auto-reparse (progress banner at top, non-blocking)
            └─ Dashboard shown immediately with loading state on charts

  └─ Records AND ZIP blob missing
       └─ Re-import banner shown (non-modal, dismissible)
            └─ "Import ZIP" → file picker
```

### 6.5 Re-import / Data Update

```
Settings → "Import New Export"
  └─ Same ZIP upload flow as 6.2
  └─ Records upserted; previous records retained
  └─ "Last imported: [date]" updated in Settings
```

### 6.6 Clear All Data

```
Settings → "Clear all data"
  └─ Confirmation dialog: "This will delete all your health data from this device. You can re-import at any time."
       ├─ Cancel → dismiss
       └─ Confirm → wipe all Dexie tables + meta → redirect to empty state (6.1)
```

---

## 7. Screens & Features

### 7.1 Dashboard

The entry point. Shows today's three scores at a glance (or the most recent day with data if today has no data).

**Content:**
- App header with date (today) and Settings gear icon
- Three score cards side by side: **Sleep**, **Readiness**, **Activity**
  - Each card: score (0–100), label, trend arrow vs previous day, colour band (red/amber/green)
- Tap any card → navigates to that domain's detail page for today's date

**Empty state:** if no data at all → redirect to onboarding (6.1).

---

### 7.2 Sleep List (`/sleep`)

Chronological reverse list of all nights with sleep data.

**Each row:**
- Date (e.g. "Mon, 23 Jun")
- Sleep score badge
- Total sleep duration (e.g. "7h 12m")
- Average HRV
- Deep sleep + REM sleep duration pill

**Tap row** → Sleep Detail for that date.

---

### 7.3 Sleep Detail (`/sleep/:date`)

The most feature-rich screen — this is the primary differentiator from Cracked Oura's basic score display.

**Content (scrollable):**

1. **Header:** Date, sleep score badge, "Good/Fair/Poor" label
2. **Summary strip:** Bedtime → Wake time | Total sleep | Efficiency %
3. **Hypnogram** (uPlot, full-width):
   - X-axis: time (bedtime → wake time)
   - Y-axis: 4 sleep stages (Awake / REM / Light / Deep) as colour-filled bands
   - Derived from `sleep_phase_5_min` field (one character per 5-minute interval)
   - HR curve overlaid on secondary Y-axis
4. **HRV curve** (uPlot, full-width): `hrv[]` array over the same time axis
5. **Sleep stage breakdown** (Recharts donut): Deep / REM / Light / Awake as % of time in bed
6. **Contributors** (Recharts horizontal bars): the sub-scores that make up the sleep score (deep sleep, efficiency, latency, REM sleep, restfulness, sleep timing, total sleep)
7. **Metrics grid:** Average HR | Lowest HR | Average HRV | Average breath | SpO₂ % | Breathing disturbance index | Restless periods

If the night has multiple sessions (e.g. nap + night), show a session selector at the top.

---

### 7.4 Readiness List (`/readiness`)

Chronological reverse list.

**Each row:**
- Date
- Readiness score badge
- Temperature deviation (°C, coloured)
- HRV balance indicator

**Tap row** → Readiness Detail.

---

### 7.5 Readiness Detail (`/readiness/:date`)

**Content:**

1. **Readiness score** + "Optimal / Good / Pay attention" label
2. **Contributors** (Recharts horizontal bars): Activity balance | Body temperature | HRV balance | Previous day activity | Previous night | Recovery index | Resting heart rate | Sleep balance
3. **Resilience level** badge: Exceptional / Strong / Solid / Adequate / Weak — from `level` field
4. **Resilience contributors**: Sleep recovery | Daytime recovery | Stress — shown as a small breakdown
5. **Temperature strip**: `temperature_deviation` + `temperature_trend_deviation` with a 7-day sparkline (uPlot)
6. **Stress/recovery indicators**: `stress_high` / `recovery_high` flags shown as contextual callouts

---

### 7.6 Activity List (`/activity`)

Chronological reverse list.

**Each row:**
- Date
- Activity score badge
- Steps (formatted: "8,432")
- Active calories

**Tap row** → Activity Detail.

---

### 7.7 Activity Detail (`/activity/:date`)

**Content:**

1. **Activity score** + contributors (Recharts bars): Meet daily targets | Move every hour | Recovery time | Stay active | Training frequency | Training volume
2. **Stats grid**: Steps | Total calories | Active calories | Distance | Non-wear time
3. **Activity intensity curve** (uPlot): `class_5_min[]` as a stacked colour bar across the day (Rest / Low / Medium / High)
4. **MET curve** (uPlot): `met[]` metabolic equivalent over the day
5. **Time breakdown** (Recharts stacked bar): High / Medium / Low / Sedentary / Resting / Non-wear
6. **Workout list**: for each workout — type icon, duration, calories, distance, intensity label
7. **Meditation sessions**: type, duration, mood
8. **Stress/recovery time series** (uPlot): `stress_value` and `recovery_value` over the day

---

### 7.8 Settings (`/settings`)

**Sections:**

**Data:**
- Last import date and record counts (sleep nights, readiness days, activity days)
- "Import New Export" button
- "Clear all data" (destructive, requires confirmation)
- Storage usage indicator: IndexedDB used / Safari soft cap (50MB), with warning if >40MB

**About:**
- App version (from `package.json`)
- Link to GitHub repository
- Legal notice: "This app processes data you exported from Oura's official portal under GDPR Article 20. It is not affiliated with Oura Health."
- Privacy statement: "No data ever leaves your device. We have no server, no database, and no analytics."

---

## 8. Error States

| Situation | UI Treatment |
|-----------|-------------|
| Wrong file type uploaded | Inline error: "Please upload a .zip file exported from membership.ouraring.com" |
| ZIP is corrupted / unreadable | Inline error: "Could not read this ZIP file. Try re-downloading from Oura." |
| ZIP has no recognised CSV files | Inline error: "This doesn't look like an Oura export. Expected sleep.csv, readiness.csv, or activity.csv." |
| No data for selected date | Inline message: "No data available for [date]" with back button |
| Safari storage quota warning (>40MB) | Persistent banner in Settings: "Storage is nearly full. Consider clearing old data or re-importing a shorter date range." |
| Data evicted, ZIP available | Silent auto-reparse with non-blocking top banner |
| Data evicted, ZIP also gone | Dismissible banner: "Your data was cleared by iOS. Import your ZIP to restore it." |

---

## 9. Offline Behaviour

- Full offline support after first install (service worker pre-caches app shell and static assets)
- All data reads from IndexedDB — no network needed for any chart or detail view
- ZIP import works from local device storage (no network needed)
- "Last imported: [date]" shown in Settings so user knows data freshness
- If user is offline and tries to navigate to a missing route, service worker serves the app shell and React Router handles the 404

---

## 10. PWA Manifest & Installation

| Property | Value |
|----------|-------|
| `display` | `standalone` (hides browser chrome after install) |
| `orientation` | `portrait-primary` |
| `theme_color` | Oura-adjacent dark tone (TBD with design) |
| `background_color` | Same as app background |
| Icons | 192×192 and 512×512 PNG + maskable variants |
| iOS meta tags | `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` |

---

## 11. Accessibility

- WCAG 2.1 AA compliance target
- All charts include accessible text summaries (e.g. "Deep sleep: 1h 23m, 19% of total sleep")
- Bottom tab bar labels always visible (no icon-only navigation)
- Colour-blind safe palette for sleep stage colours (not relying on red/green alone)
- Minimum tap target: 44×44px
- Dark mode support via `prefers-color-scheme` media query (Tailwind `dark:` variants)

---

## 12. Versioning & Releases

Versioned with [Changesets](https://github.com/changesets/changesets). Every PR that changes user-facing behaviour includes a changeset file. The version shown in Settings is injected at build time from `package.json`.
