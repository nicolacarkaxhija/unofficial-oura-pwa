// ─── Readiness E2E ────────────────────────────────────────────────────────────
//
// Covers the /readiness list and /readiness/$date detail views.
// Data is seeded once in beforeAll via ZIP upload, shared across all tests
// in this file through a persistent browser context.

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
  const tmpDir = join(tmpdir(), `oura-readiness-${testInfo.parallelIndex}`)
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

test('navigating to /readiness shows a list with readiness scores', async () => {
  await seededPage.goto('/readiness')

  // Each day row is expected to render with data-testid="readiness-day-item".
  const items = seededPage.locator('[data-testid="readiness-day-item"]')
  await expect(items.first()).toBeVisible()
  expect(await items.count()).toBeGreaterThan(0)

  // The list should surface score values — at least one numeric score visible.
  // We use the i18n label "Readiness Score" as the anchor.
  // In list view this may be abbreviated; fall back to checking for "Score".
  await expect(seededPage.getByText(/\bScore\b/).first()).toBeVisible()
})

test('clicking a readiness day navigates to detail with contributor section', async () => {
  await seededPage.goto('/readiness')

  const firstItem = seededPage.locator('[data-testid="readiness-day-item"]').first()
  await firstItem.click()

  await expect(seededPage).toHaveURL(/\/readiness\/\d{4}-\d{2}-\d{2}/)

  // The detail page renders a contributors section.
  // i18n key readiness:contributors.title → "Contributors".
  await expect(seededPage.getByText('Contributors')).toBeVisible()

  // At least one contributor chip/row should be present.
  // The implementation renders items with data-testid="contributor-item".
  const contributors = seededPage.locator('[data-testid="contributor-item"]')
  await expect(contributors.first()).toBeVisible()
})
