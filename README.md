# Unofficial Oura PWA

**View your Oura Ring data without a subscription — private, offline, yours.**

Oura locks most insights behind a monthly subscription, but under **GDPR Article 20** you have the right to your raw data for free. This app turns that export into a full dashboard: sleep, readiness, activity, trends, and personal records — entirely in your browser.

🔗 **Live app:** https://unofficial-oura-pwa.pages.dev

## Privacy — enforced, not promised

- **Your data never leaves your device.** Everything is parsed and stored locally (IndexedDB).
- **No server, no accounts, no analytics, no cookies.** There is nothing to breach.
- This is enforced technically: the app ships a [Content-Security-Policy](public/_headers) with `connect-src 'self'` — the _browser itself_ blocks any outbound request, including from a compromised dependency.
- One-click **export** (JSON) and **delete** of everything, anytime.

## How to use it

1. Go to [Oura's data export page](https://cloud.ouraring.com) → Data Export and request your GDPR export.
2. Wait for the confirmation email (can take a couple of hours) and download the ZIP.
3. Open the app and import the ZIP. Done — works offline from then on.

## Features

- **Dashboard** — latest sleep / readiness / activity scores, 7-day averages with week-over-week deltas, personal bests
- **Sleep** — 90-day+ history, hypnogram, HR/HRV time series, contributors
- **Readiness** — contributor radar, resilience, body temperature deviation
- **Activity** — MET chart, intensity breakdown, workouts, stress
- History range selector (30d / 90d / 1y / all), dark mode, English + Italiano, installable PWA

## Tech

Vite · React 19 · TypeScript (strict) · Dexie (IndexedDB) · TanStack Router · Tailwind v4 · Web Worker import pipeline (JSZip + Papa Parse + Zod) · uPlot + hand-rolled SVG charts · Vitest + Playwright · deployed on Cloudflare Pages with a fully gated CI/CD pipeline.

```bash
npm install
npm run dev        # dev server with "Load demo data" shortcut
npm test           # unit tests
npx playwright test
```

## Legal

This project is **not affiliated with, endorsed by, or connected to Oura Health Oy** in any way. It processes only data that you exported yourself through Oura's official GDPR data-portability process. "Oura" is a trademark of Oura Health Oy, used here solely to describe compatibility.

[MIT licensed](LICENSE).
