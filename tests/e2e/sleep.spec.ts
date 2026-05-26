// ─── Sleep E2E ────────────────────────────────────────────────────────────────
//
// Covers the /sleep list and /sleep/$date detail views plus the error path for
// an invalid date param. The fixture ZIP is uploaded once in beforeAll and
// shared across tests in the file — this is safe because these tests are
// read-only (they don't mutate IndexedDB).
//
// Worker isolation: each Playwright worker has its own browser context, so
// there is no state leakage between this file's tests and other spec files
// running in parallel.

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

// ─── Per-file setup ───────────────────────────────────────────────────────────

let seededPage: Page
let sharedContext: BrowserContext
let zipPath: string

// workerInfo is not a Playwright fixture — parallelIndex lives on testInfo
// (the second argument to beforeAll / test callbacks).
test.beforeAll(async ({ browser }, testInfo) => {
  const tmpDir = join(tmpdir(), `oura-sleep-${testInfo.parallelIndex}`)
  zipPath = await createFixtureZipFile(tmpDir)

  // Create a single persistent context so IndexedDB survives across tests.
  sharedContext = await browser.newContext()
  seededPage = await sharedContext.newPage()

  // Upload ZIP to seed data.
  await seededPage.goto('/')
  await seededPage.setInputFiles('[data-testid="zip-input"]', zipPath)
  // Wait for import to finish before any test in this file starts.
  await expect(seededPage.getByText('Connect your Oura data')).not.toBeVisible({
    timeout: 30_000,
  })
})

test.afterAll(async () => {
  await sharedContext.close()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

test('navigating to /sleep shows a list of sleep days', async () => {
  await seededPage.goto('/sleep')

  // The list page renders one item per imported day. We assert at least one
  // entry is present. The item role is expected to be listitem or a link inside
  // a list; either way there must be something with data-testid="sleep-day-item".
  const items = seededPage.locator('[data-testid="sleep-day-item"]')
  await expect(items.first()).toBeVisible()
  expect(await items.count()).toBeGreaterThan(0)
})

test('clicking a sleep day navigates to detail with hypnogram canvas', async () => {
  await seededPage.goto('/sleep')

  // Click the first day entry — it should navigate to /sleep/YYYY-MM-DD.
  const firstItem = seededPage.locator('[data-testid="sleep-day-item"]').first()
  await firstItem.click()

  // Detail page URL should match /sleep/<date>.
  await expect(seededPage).toHaveURL(/\/sleep\/\d{4}-\d{2}-\d{2}/)

  // The hypnogram is rendered as a <canvas> element. We assert it is present
  // and has non-zero dimensions (which would indicate it actually rendered).
  const canvas = seededPage.locator('[data-testid="hypnogram-canvas"]')
  await expect(canvas).toBeVisible()
})

test('sleep detail page shows a sleep score element', async () => {
  await seededPage.goto('/sleep')

  const firstItem = seededPage.locator('[data-testid="sleep-day-item"]').first()
  await firstItem.click()
  await expect(seededPage).toHaveURL(/\/sleep\/\d{4}-\d{2}-\d{2}/)

  // i18n key sleep:score → "Sleep Score". The score value itself is dynamic,
  // so we check for the label, not the number.
  await expect(seededPage.getByText('Sleep Score')).toBeVisible()
})

test('invalid date in URL /sleep/not-a-date shows an error message', async ({ browser }) => {
  // Use a fresh page for the error scenario — we don't want to contaminate the
  // shared seeded context with a router error state that might persist.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  // Seed data so we can reach the /sleep route tree.
  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  await page.goto('/sleep/not-a-date')

  // TanStack Router's parseDateParam throws on invalid input, which activates
  // the nearest error boundary. We look for the i18n error text or a generic
  // error indicator — either the common:error.invalidDate or error.generic key.
  //
  // We use a union locator so the test passes whichever message the error
  // boundary renders without enumerating all possibilities in separate expects.
  const errorLocator = page
    .getByText('Invalid date')
    .or(page.getByText('Something went wrong'))
    .or(page.getByText('Data non valida')) // Italian fallback in case locale bled through

  await expect(errorLocator.first()).toBeVisible({ timeout: 5_000 })

  await ctx.close()
})
