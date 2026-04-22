// ─── i18n E2E ─────────────────────────────────────────────────────────────────
//
// Full round-trip: switch to Italian in Settings, verify page titles across
// routes are translated, then switch back to English and verify the app
// returns to English copy. Runs on a single page sequentially because the
// language is global mutable state — parallel steps would race.
//
// Uses a seeded context so list pages carry real content (translated labels
// on rows), not just empty states.

import { test, expect } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

test('Italian applies across pages and switching back to English works', async ({
  page,
}, testInfo) => {
  const tmpDir = join(tmpdir(), `oura-i18n-${String(testInfo.parallelIndex)}`)
  const zipPath = await createFixtureZipFile(tmpDir, { days: 5 })

  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })

  // ── Switch to Italian ────────────────────────────────────────────────────
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Italiano' }).click()
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({
    timeout: 5_000,
  })

  // Page titles across the three pillar routes (it/{sleep,readiness,activity}.json).
  await page.goto('/sleep')
  await expect(page.getByRole('heading', { name: 'Sonno' })).toBeVisible()

  await page.goto('/readiness')
  await expect(page.getByRole('heading', { name: 'Prontezza' })).toBeVisible()

  await page.goto('/activity')
  await expect(page.getByRole('heading', { name: 'Attività' })).toBeVisible()
  // Row-level label is translated too (activity:stats.steps → "Passi").
  await expect(page.getByText('Passi').first()).toBeVisible()

  // Dashboard nav label (common:nav.dashboard → "Riepilogo").
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Riepilogo' })).toBeVisible()

  // ── Switch back to English ───────────────────────────────────────────────
  await page.goto('/settings')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 5_000 })

  await page.goto('/sleep')
  await expect(page.getByRole('heading', { name: 'Sleep', exact: true })).toBeVisible()
})
