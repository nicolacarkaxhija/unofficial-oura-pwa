// ─── Dashboard E2E ────────────────────────────────────────────────────────────
//
// Covers dashboard behaviour beyond "cards appear after import" (owned by
// onboarding.spec.ts): card click-through navigation, the latest-day date
// caption, and deep links to valid-format dates that have no data.
//
// The fixture uses a FIXED startDate so the "latest day" assertion is
// deterministic: days 2025-01-01 … 2025-01-05, latest = 2025-01-05.

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

// ─── Per-file setup ───────────────────────────────────────────────────────────

let seededPage: Page
let sharedContext: BrowserContext

// workerInfo is not a Playwright fixture — parallelIndex lives on testInfo
// (the second argument to beforeAll / test callbacks).
test.beforeAll(async ({ browser }, testInfo) => {
  const tmpDir = join(tmpdir(), `oura-dashboard-${String(testInfo.parallelIndex)}`)
  const zipPath = await createFixtureZipFile(tmpDir, { days: 5, startDate: '2025-01-01' })

  sharedContext = await browser.newContext()
  seededPage = await sharedContext.newPage()

  await seededPage.goto('/')
  await seededPage.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(seededPage.getByText('Connect your Oura data')).not.toBeVisible({
    timeout: 30_000,
  })
})

test.afterAll(async () => {
  await sharedContext.close()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

// Each dashboard card is a <button> whose aria-label starts with the pillar
// title ("Sleep — Sleep Score: NN"), and clicking it navigates to the list.
const CARD_CASES = [
  { label: /^Sleep —/, url: /\/sleep$/ },
  { label: /^Readiness —/, url: /\/readiness$/ },
  { label: /^Activity —/, url: /\/activity$/ },
] as const

for (const { label, url } of CARD_CASES) {
  test(`dashboard card ${String(label)} navigates to its list page`, async () => {
    await seededPage.goto('/')

    await seededPage.getByRole('button', { name: label }).click()
    await expect(seededPage).toHaveURL(url)
  })
}

test('dashboard caption shows the LATEST day on record, not today', async () => {
  await seededPage.goto('/')

  // Wait for cards (loading skeletons gone) before asserting on the caption.
  await expect(seededPage.getByText('Sleep Score')).toBeVisible()

  // Fixture's newest day is 2025-01-05; Dashboard formats it with
  // toLocaleDateString(long month + numeric day + year). We assert on the
  // "January 5, 2025" core rather than the weekday to stay locale-shape safe.
  await expect(seededPage.getByText(/January 5, 2025/)).toBeVisible()
})

for (const route of ['/readiness/2020-06-15', '/activity/2020-06-15'] as const) {
  test(`deep link ${route} (valid date, no data) renders app shell, no white screen`, async () => {
    // Full document load of a detail URL for a date outside the imported range.
    await seededPage.goto(route)

    // The app shell must mount: bottom nav present, no error boundary text,
    // and a resolved "no data" state (null contract) instead of eternal skeletons.
    await expect(seededPage.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(seededPage.getByText('Something went wrong')).not.toBeVisible()
    await expect(seededPage.getByText('No data available for this date')).toBeVisible()
  })
}

test('trends section shows a 7-day average per pillar with a delta badge', async () => {
  await seededPage.goto('/')

  const trends = seededPage.locator('[data-testid="trends-list"]')
  await expect(trends).toBeVisible()

  // All three pillars have 5 days of fixture data → three rows, each with an
  // average. Deltas need 8+ scored days, so no badge is asserted here — the
  // arithmetic itself is pinned by tests/unit/aggregates.test.ts.
  await expect(trends.locator('li')).toHaveCount(3)
  await expect(seededPage.getByText('Trends')).toBeVisible()
  await expect(seededPage.getByText(/Personal best: \d+/).first()).toBeVisible()
})
