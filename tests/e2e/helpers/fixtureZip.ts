// ─── E2E Fixture ZIP Helper ───────────────────────────────────────────────────
//
// Playwright tests run in two contexts: the Node.js test runner (where this
// helper executes) and the real Chromium browser (where the app lives).
//
// buildFixtureZip() produces a Blob — a browser API that Node.js lacks in the
// test runner process. We can't hand a Blob across the process boundary, so
// instead we write the ZIP bytes to a temp file on disk. Playwright's
// page.setInputFiles() then reads that file and delivers it to the browser as
// if the user had selected it via a native file picker.
//
// This avoids any need to mock fetch, IndexedDB, or the import worker.

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { buildFixtureZip, type FixtureZipOptions } from '../../fixtures/buildZip'

/**
 * Build a fixture ZIP and write it to a temp file. Returns the absolute path
 * so callers can pass it to `page.setInputFiles()`.
 *
 * Uses the OS temp dir supplied by Playwright's `workerInfo.parallelIndex` to
 * avoid collisions between parallel workers. If no dir is given, falls back to
 * the OS temp directory.
 */
export async function createFixtureZipFile(
  tmpDir: string,
  options: FixtureZipOptions = {},
): Promise<string> {
  // Ensure the dir exists — Playwright doesn't guarantee it pre-exists.
  mkdirSync(tmpDir, { recursive: true })

  const blob = await buildFixtureZip(options)

  // Blob → ArrayBuffer → Buffer is the only Node.js-safe conversion path.
  // `blob.arrayBuffer()` is available in Node 16+ (the target runtime for
  // Playwright workers) and avoids the deprecated FileReader API.
  const buffer = Buffer.from(await blob.arrayBuffer())

  const filePath = join(tmpDir, 'fixture.zip')
  writeFileSync(filePath, buffer)

  return filePath
}
