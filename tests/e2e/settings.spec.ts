// ─── Settings E2E ─────────────────────────────────────────────────────────────
//
// Covers the Settings page: import/clear UI, language switching, and theme
// switching. Language and theme changes affect global state (localStorage +
// CSS class on <html>) so each test that modifies those gets its own fresh
// page to avoid test-order coupling.
//
// The "clear all data" test needs an already-seeded context; the others only
// need the Settings page to be reachable (no data required for UI appearance).

import { test, expect } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

// ─── Tests ────────────────────────────────────────────────────────────────────

test('navigating to /settings shows import button and theme selector', async ({ page }) => {
  // Settings page must be reachable regardless of data state. If the app
  // redirects to onboarding when there is no data, navigate from onboarding
  // first — but since Settings is a top-level route it should render directly.
  await page.goto('/settings')

  // i18n key settings:data.importBtn → "Import ZIP export" (post-import label)
  // or settings:data.clearAll if data exists. We check for either import button.
  // On first visit (no data) the import button label comes from onboarding:importBtn.
  const importBtn = page.getByRole('button', { name: /import/i })
  await expect(importBtn.first()).toBeVisible()

  // i18n key settings:appearance.theme → "Theme". The selector for theme
  // should be a combobox or group of radio buttons.
  await expect(page.getByText('Theme')).toBeVisible()
})

test('switching language to Italian changes nav labels to Italian', async ({ page }) => {
  await page.goto('/settings')

  // The language selector is a segmented button group; each language renders
  // as a button labelled with its own endonym ("Italiano", "English").
  const italianBtn = page.getByRole('button', { name: 'Italiano' })
  await expect(italianBtn).toBeVisible()

  // Select Italian.
  await italianBtn.click()

  // After the language change, the nav labels should switch to Italian.
  // i18n key common:nav.sleep in Italian → "Sonno".
  // We poll briefly because react-i18next applies the new language asynchronously
  // after storing it in localStorage and reloading the locale JSON.
  await expect(page.getByText('Sonno')).toBeVisible({ timeout: 5_000 })

  // Verify another nav item: common:nav.activity in Italian → "Attività".
  await expect(page.getByText('Attività')).toBeVisible()
})

test('switching theme to dark adds the dark class to <html>', async ({ page }) => {
  await page.goto('/settings')

  // ThemeContext applies the `dark` class to <html> synchronously on theme
  // change. The theme selector is a segmented button group
  // (settings:appearance.themeDark → "Dark").
  const darkBtn = page.getByRole('button', { name: 'Dark' })
  await expect(darkBtn).toBeVisible()

  await darkBtn.click()

  // Check that <html> has the `dark` class. This is what activates Tailwind's
  // dark: variants throughout the app.
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
})

// workerInfo is not a Playwright fixture — parallelIndex lives on testInfo
// (the second argument to test callbacks).
test('clear all data → confirmation prompt → data cleared → onboarding shown', async ({
  browser,
}, testInfo) => {
  // This test needs seeded data so "Clear all data" has something to clear.
  const tmpDir = join(tmpdir(), `oura-settings-clear-${String(testInfo.parallelIndex)}`)
  const zipPath = await createFixtureZipFile(tmpDir)

  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  // Seed data.
  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // Navigate to Settings.
  await page.goto('/settings')

  // Click the destructive action — i18n key settings:data.clearAll → "Clear all data".
  await page.getByRole('button', { name: 'Clear all data' }).click()

  // A confirmation dialog must appear before any data is removed.
  // i18n key settings:data.clearConfirm contains "delete all your health data".
  const confirmText = page.getByText('delete all your health data', { exact: false })
  await expect(confirmText).toBeVisible()

  // Confirm the destructive action. The implementation may render the confirm
  // button with the same label or a distinct one ("Confirm" / "Delete" / "Yes").
  // We click the last "Clear all data" button, which is the one in the dialog.
  const clearBtns = page.getByRole('button', { name: 'Clear all data' })
  await clearBtns.last().click()

  // After clearing, the app should route to '/' and show onboarding.
  await expect(page.getByText('Connect your Oura data')).toBeVisible({ timeout: 10_000 })

  await ctx.close()
})

test('import summary shows coverage range and counts; re-import shows confirmation', async ({
  browser,
}, testInfo) => {
  const tmpDir = join(tmpdir(), `oura-settings-summary-${String(testInfo.parallelIndex)}`)
  // Fixed 10-day window so the asserted range and counts are deterministic:
  // sleep/readiness/activity 10 rows each, workouts every 3rd day = 4,
  // meditations every 5th = 2, stress 4/day = 40.
  const zipPath = await createFixtureZipFile(tmpDir, { days: 10, startDate: '2025-02-01' })

  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  // Seed via onboarding (first import).
  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // The summary lives in Settings under "Last imported" — onboarding unmounts
  // reactively on import success, so Settings is the durable feedback surface.
  await page.goto('/settings')
  const summary = page.locator('[data-testid="import-summary"]')
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('Covers 01 Feb 2025 – 10 Feb 2025')
  await expect(summary).toContainText('10 sleep nights')
  await expect(summary).toContainText('4 workouts')
  await expect(summary).toContainText('40 stress samples')

  // Re-import the same ZIP from Settings → transient inline confirmation.
  await page.setInputFiles('#zip-input-settings', zipPath)
  await expect(page.locator('[data-testid="reimport-success"]')).toBeVisible({ timeout: 30_000 })

  await ctx.close()
})
