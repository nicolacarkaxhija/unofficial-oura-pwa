// ─── Onboarding E2E ──────────────────────────────────────────────────────────
//
// These tests cover the full first-run → import → data-persistence → clear
// lifecycle. Each test controls browser state explicitly: fresh contexts get
// no data, seeded contexts receive a real fixture ZIP via file upload.
//
// Why we don't mock IndexedDB here:
//   The whole point of onboarding is that the import worker writes to Dexie
//   and the app then reads from it. Mocking either direction would reduce these
//   to smoke tests. Instead we upload a real ZIP and wait for the UI to react.

import { test, expect } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

// ─── Shared fixture path ──────────────────────────────────────────────────────

// Workers run in parallel; each gets a unique sub-dir based on its index to
// avoid file-system races when writing the fixture ZIP.
const tmpDir = (workerIndex: number) => join(tmpdir(), `oura-e2e-${String(workerIndex)}`)

// ─── Tests ────────────────────────────────────────────────────────────────────

test('fresh visit with no data shows onboarding screen with import button', async ({
  page,
  context,
}) => {
  // A brand-new browser context has empty IndexedDB — exactly the state a
  // first-time user would have. No setup needed.
  await context.clearCookies()
  await context.clearPermissions()

  await page.goto('/')

  // The onboarding title key is onboarding:title ("Connect your Oura data").
  // We test by aria role + text content derived from the i18n value so a
  // future translation rename will break the test loudly instead of silently.
  await expect(page.getByText('Connect your Oura data')).toBeVisible()

  // The import button renders with the i18n key onboarding:importBtn.
  await expect(page.getByRole('button', { name: 'Import ZIP' })).toBeVisible()
})

// workerInfo is not a Playwright fixture — parallelIndex lives on testInfo
// (the second argument to test callbacks).
test('uploading fixture ZIP shows progress bar then dashboard with scores', async ({
  page,
}, testInfo) => {
  const zipPath = await createFixtureZipFile(tmpDir(testInfo.parallelIndex))

  await page.goto('/')

  // Confirm we are on onboarding before interacting.
  await expect(page.getByText('Connect your Oura data')).toBeVisible()

  // The file input that accepts the ZIP. The implementation is expected to
  // render an <input type="file" data-testid="zip-input"> (hidden, activated
  // by the visible Import ZIP button).
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)

  // A progress bar (role="progressbar") should appear while the import worker
  // is processing — we don't assert aria-valuenow because it changes rapidly.
  await expect(page.getByRole('progressbar')).toBeVisible()

  // After processing, the app navigates to the dashboard. We give it up to
  // 30 s because the import worker parses CSV and writes to Dexie in a tight
  // loop — large fixtures are measurably slow on CI.
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // The dashboard is expected to show score cards for all three pillars.
  // We look for the i18n keys: sleep:score, readiness:score, activity:score.
  await expect(page.getByText('Sleep Score')).toBeVisible()
  await expect(page.getByText('Readiness Score')).toBeVisible()
  await expect(page.getByText('Activity Score')).toBeVisible()
})

test('after import, refresh page persists data (no onboarding)', async ({ page }, testInfo) => {
  const zipPath = await createFixtureZipFile(tmpDir(testInfo.parallelIndex))

  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)

  // Wait for import to complete: onboarding disappears.
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // Full page reload — IndexedDB persists across navigations in the same
  // browser context, so the app should skip onboarding entirely.
  await page.reload()

  await expect(page.getByText('Connect your Oura data')).not.toBeVisible()
  await expect(page.getByText('Sleep Score')).toBeVisible()
})

test('clearing all data in Settings causes onboarding to reappear', async ({ page }, testInfo) => {
  const zipPath = await createFixtureZipFile(tmpDir(testInfo.parallelIndex))

  // Seed data first.
  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // Navigate to Settings.
  await page.goto('/settings')
  // Role-anchored: plain getByText('Settings') also matches text inside the
  // TanStack Router devtools panel in dev mode.
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Trigger "Clear all data" — i18n key settings:data.clearAll.
  await page.getByRole('button', { name: 'Clear all data' }).click()

  // A confirmation prompt must appear before any destructive action.
  // i18n key settings:data.clearConfirm includes "delete all your health data".
  await expect(page.getByText('delete all your health data', { exact: false })).toBeVisible()

  // Accept the confirmation.
  await page.getByRole('button', { name: 'Clear all data' }).last().click()

  // App should redirect to '/' and show onboarding.
  await expect(page.getByText('Connect your Oura data')).toBeVisible({ timeout: 10_000 })
})
