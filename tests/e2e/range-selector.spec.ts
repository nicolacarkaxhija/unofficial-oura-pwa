// ─── Range selector E2E ───────────────────────────────────────────────────────
//
// A 120-day fixture makes the windows distinguishable: 30d → 30 rows,
// the default 90d → 90 rows, All → 120 rows. (1y is indistinguishable from
// All at this fixture size, so it isn't asserted separately.)

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFixtureZipFile } from './helpers/fixtureZip'

let ctx: BrowserContext
let page: Page

test.beforeAll(async ({ browser }, testInfo) => {
  const tmpDir = join(tmpdir(), `oura-range-${String(testInfo.parallelIndex)}`)
  const zipPath = await createFixtureZipFile(tmpDir, { days: 120 })

  ctx = await browser.newContext()
  page = await ctx.newPage()
  await page.goto('/')
  await page.setInputFiles('[data-testid="zip-input"]', zipPath)
  await expect(page.getByText('Connect your Oura data')).not.toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  await ctx.close()
})

test('sleep list defaults to 90 days and switches to 30d and All', async () => {
  await page.goto('/sleep')
  const rows = page.locator('[data-testid="sleep-day-item"]')

  // Default window is 90d.
  await expect(rows).toHaveCount(90)

  await page.getByRole('button', { name: '30d', exact: true }).click()
  await expect(rows).toHaveCount(30)

  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(rows).toHaveCount(120)
})

test('range selector is present on readiness and activity lists too', async () => {
  for (const [route, testid] of [
    ['/readiness', 'readiness-day-item'],
    ['/activity', 'activity-day-item'],
  ] as const) {
    await page.goto(route)
    await page.getByRole('button', { name: '30d', exact: true }).click()
    await expect(page.locator(`[data-testid="${testid}"]`)).toHaveCount(30)
  }
})
