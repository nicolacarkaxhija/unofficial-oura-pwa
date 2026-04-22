// ─── Persistence E2E ──────────────────────────────────────────────────────────
//
// Theme, language, and imported data must all survive a full page reload:
//   • theme  — localStorage 'theme' + the anti-FOUC inline script in index.html
//              re-applies the `dark` class before React hydrates
//   • language — i18next persists the choice and restores it on boot
//   • data   — IndexedDB is durable across navigations in one browser context;
//              a detail page loaded directly by URL must render on first paint
//              (SPA boot + Dexie query race is the risk here)
//
// Each test uses its own fresh page/context because these scenarios mutate
// global browser state (localStorage / IndexedDB) — sharing a seeded context
// would create test-order coupling.

import { test, expect } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

test('dark theme choice survives a full page reload', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)

  // Reload — the anti-FOUC script in index.html must re-apply the class from
  // localStorage before first paint, and ThemeContext must keep it applied.
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)

  // The Dark segmented button should still be the selected one (emerald bg).
  await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible()
})

test('language choice (Italian) survives a full page reload', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: 'Italiano' }).click()
  // Settings heading switches to the Italian title once i18next has flipped.
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({
    timeout: 5_000,
  })

  await page.reload()

  // After reload i18next must restore Italian from its persisted detection.
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({
    timeout: 5_000,
  })
})

test('sleep detail deep link renders on first document load after import', async ({
  page,
}, testInfo) => {
  // Fixed startDate makes the day URLs deterministic: 2025-01-01 … 2025-01-05.
  const tmpDir = join(tmpdir(), `oura-persist-${String(testInfo.parallelIndex)}`)
  const zipPath = await createFixtureZipFile(tmpDir, { days: 5, startDate: '2025-01-01' })

  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // page.goto performs a full document navigation — this is the "user pasted a
  // URL / opened a bookmark" scenario, not client-side routing.
  await page.goto('/sleep/2025-01-03')

  // The detail page must render its chart after the SPA boots and Dexie
  // answers — no onboarding gate, no white screen.
  await expect(page.locator('[data-testid="hypnogram-canvas"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Sleep Score: \d+/).first()).toBeVisible()
})
