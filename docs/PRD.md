# Product Requirements Document — Unofficial Oura PWA

**Version**: 0.1.0  
**Status**: In development  
**Last updated**: 2026-06-25

---

## 1. Problem Statement

Oura Ring hardware ships with full biometric sensing capability. Owners who let their subscription lapse (or never subscribed) lose access to the historical data they generated — even though that data was captured by their own hardware, stored under their account, and is legally theirs under GDPR Article 20 (Right to Data Portability).

This PWA restores that access. It parses the GDPR export archive Oura provides on request and presents sleep, readiness, and activity data in a native-quality mobile interface with no recurring fee.

---

## 2. Legal Basis

Oura allows users to export all of their data at `membership.ouraring.com/data-export`. This export right is guaranteed by:

- **GDPR Article 20** — Right to data portability (EU residents)
- **CCPA** — Right to know / right to access (California residents)
- **Oura's own Privacy Policy** — explicitly acknowledges the export mechanism

This PWA processes data that the user has legitimately obtained from Oura. It does not scrape Oura's servers, does not intercept session tokens, and does not make any API calls to Oura's infrastructure at runtime.

---

## 3. Target Users

| Persona | Context |
|---|---|
| Lapsed subscriber | Paid for Oura and cancelled; still owns the ring and wants their history |
| New ring owner in evaluation period | Has data but hasn't decided on a subscription yet |
| Privacy-conscious quantified-self user | Prefers local-first data ownership over cloud subscriptions |

---

## 4. Core Principles

1. **Zero server footprint** — no backend, no analytics, no telemetry. Data lives on the user's device only.
2. **Privacy by design** — the import worker runs entirely in a browser Web Worker; no data touches a network.
3. **Offline-first** — service worker caches all app assets; the app works with no network after first load.
4. **Native-quality feel** — installable to home screen, bottom tab bar, safe-area insets, 60 fps charts.

---

## 5. Data Import Flow

### v1 — Manual ZIP upload (shipped)
1. User visits `membership.ouraring.com/data-export` and requests their archive.
2. Oura sends a download link by email within ~2.5 hours.
3. User downloads the ZIP to their device.
4. User opens this PWA and taps "Import ZIP".
5. A Web Worker parses the ZIP off the main thread; the UI shows a progress bar.
6. Parsed records are written to IndexedDB via Dexie. The raw ZIP blob is also stored for eviction recovery.

### Safari Eviction Recovery
Safari purges IndexedDB after 7 days of PWA inactivity. On every launch, if records are missing but the ZIP blob survives, the import worker re-parses silently. If both are gone, a re-import banner is shown.

### v2 — Automated download (roadmap)
A Cloudflare Worker acting as a CORS proxy + a headless browser session (Playwright on a server) could automate step 1–3. Deferred to v2; requires careful legal review per jurisdiction.

---

## 6. Feature Scope

### v1 (this release)

| Feature | Notes |
|---|---|
| ZIP import with progress | Web Worker + JSZip + Papa Parse |
| Dashboard | Today's sleep, readiness, activity score cards |
| Sleep list (90 days) | Scores, total sleep time, score trend chart |
| Sleep detail | Hypnogram, HR curve, HRV curve, contributors, stats |
| Readiness list (90 days) | Scores, temperature deviation |
| Readiness detail | Contributors radar, resilience level, temperature |
| Activity list (90 days) | Scores, steps, active calories |
| Activity detail | MET curve, intensity breakdown, workouts, stress timeline |
| Settings | Theme toggle, language selector, re-import, clear data |
| Dark mode | System / light / dark, persisted to localStorage |
| Multilingual | English and Italian; extensible to more languages |
| Offline-first | vite-plugin-pwa service worker, precached assets |
| Installable PWA | Manifest, home screen icon, standalone display |
| WCAG 2.1 AA | ARIA labels, keyboard navigation, colour contrast |

### Out of scope for v1

- Strava or other third-party service integration
- Cloud sync or cross-device access
- Live ring data via BLE (requires proprietary SDK)
- Social sharing or data export from this app

### v2 Roadmap

- Automated ZIP download via Cloudflare Worker proxy
- Heart-rate zone training analysis
- Weekly/monthly summary view
- Additional languages (DE, FR, ES)
- Strava workout overlay on activity charts

---

## 7. Technical Constraints

| Constraint | Decision |
|---|---|
| Must work offline after first load | Service worker with Workbox precaching |
| 25k+ data points per sleep session | uPlot (canvas) not Recharts (SVG) |
| Safari IndexedDB eviction | Store ZIP blob in `meta` table as fallback |
| Type safety across CSV→DB pipeline | Zod schemas validate CSV rows before DB write |
| No backend | Cloudflare Pages static hosting |

Full rationale in `docs/TECHNICAL_SPEC.md`.

---

## 8. Success Metrics

Since this is a personal/open-source tool with no analytics, success is measured by:

- Zero data-loss bugs (all CSV fields parsed or explicitly null — no silent truncation)
- Build size ≤ 500 kB gzipped (uPlot is 40 kB; Recharts is heavier but tree-shakes well)
- Lighthouse PWA score ≥ 90
- Typecheck + lint + tests pass in CI on every push
