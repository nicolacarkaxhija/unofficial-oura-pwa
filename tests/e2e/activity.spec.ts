// ─── Activity E2E ─────────────────────────────────────────────────────────────
//
// Covers the /activity list (scores + steps) and /activity/$date detail
// (MET chart canvas). Data is seeded once in beforeAll, shared via a
// persistent browser context. These tests are intentionally read-only so
// sharing a seeded context is safe.

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
  const tmpDir = join(tmpdir(), `oura-activity-${testInfo.parallelIndex}`)
  const zipPath = await createFixtureZipFile(tmpDir)

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

test('navigating to /activity shows a list with activity scores and steps', async () => {
  await seededPage.goto('/activity')

  // Each day row is expected to have data-testid="activity-day-item".
  const items = seededPage.locator('[data-testid="activity-day-item"]')
  await expect(items.first()).toBeVisible()
  expect(await items.count()).toBeGreaterThan(0)

  // The list should surface step counts. i18n key activity:stats.steps → "Steps".
  // We check for the label text; the numeric value is fixture-dependent.
  await expect(seededPage.getByText('Steps').first()).toBeVisible()
})

test('clicking an activity day navigates to detail with MET chart canvas', async () => {
  await seededPage.goto('/activity')

  const firstItem = seededPage.locator('[data-testid="activity-day-item"]').first()
  await firstItem.click()

  await expect(seededPage).toHaveURL(/\/activity\/\d{4}-\d{2}-\d{2}/)

  // The MET time-series is rendered as a <canvas> element.
  // The implementation is expected to add data-testid="met-chart-canvas".
  const canvas = seededPage.locator('[data-testid="met-chart-canvas"]')
  await expect(canvas).toBeVisible()
})
