// ─── Empty States E2E ─────────────────────────────────────────────────────────
//
// The onboarding gate only replaces the Dashboard route ('/'); every other
// route stays reachable with no data and must render its own empty state
// instead of crashing. These tests use a completely fresh context (empty
// IndexedDB) — exactly a first-time user who typed a deep URL.
//
// Also covers a minimal single-day export: the Dashboard must render score
// cards even when there is only one day of data on record.

import { test, expect } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

// i18n key common:noData — the shared empty-state string all three lists use.
const NO_DATA_TEXT = 'No data available for this date'

for (const route of ['/sleep', '/readiness', '/activity'] as const) {
  test(`${route} with no imported data shows the empty state, not a crash`, async ({ page }) => {
    await page.goto(route)

    // The list page's own heading must render (proves the route mounted) …
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // … alongside the shared empty-state copy, with zero day rows.
    await expect(page.getByText(NO_DATA_TEXT)).toBeVisible()
    await expect(page.locator('[data-testid$="-day-item"]')).toHaveCount(0)

    // The app shell (bottom nav) must still be present — no error boundary.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  })
}

test('settings is fully usable with no imported data', async ({ page }) => {
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  // Theme and language controls must work pre-import (that is the stated
  // reason the route is not behind the onboarding gate).
  // exact: true — the BottomNav theme toggle's aria-label "Switch to dark
  // mode" also substring-matches "Dark" under the default name matching.
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Italiano' })).toBeVisible()
})

test('dashboard renders score cards from a single-day export', async ({ page }, testInfo) => {
  const tmpDir = join(tmpdir(), `oura-empty-${String(testInfo.parallelIndex)}`)
  const zipPath = await createFixtureZipFile(tmpDir, { days: 1, startDate: '2025-02-10' })

  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // All three pillar cards must render — one day is enough for each pillar.
  await expect(page.getByText('Sleep Score')).toBeVisible()
  await expect(page.getByText('Readiness Score')).toBeVisible()
  await expect(page.getByText('Activity Score')).toBeVisible()

  // Each list then shows exactly one row.
  await page.goto('/sleep')
  await expect(page.locator('[data-testid="sleep-day-item"]')).toHaveCount(1)
})
