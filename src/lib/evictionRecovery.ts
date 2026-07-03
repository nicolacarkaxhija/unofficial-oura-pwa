// ─── Eviction Recovery ────────────────────────────────────────────────────────
//
// Safari's WebKit wipes IndexedDB if the PWA is not opened for 7 days.
// On every boot App.tsx calls checkAndRepair(); if the data is gone we attempt
// to re-parse from the ZIP blob stored in the `meta` table during the last
// import.
//
// If the ZIP is gone too (both records and blob cleared), we dispatch a
// custom event so the Onboarding page can show a "re-import required" banner.
// A custom event is used here rather than a context or Zustand store because
// this is a one-shot signal at boot — context would add a Provider and a
// separate hook import chain just to pass a boolean.
//
// Lives in its own module (not App.tsx) so it can be unit-tested directly and
// so App.tsx keeps a single component export (react-refresh constraint).

import { db } from '@/db/client'

export async function checkAndRepair(): Promise<void> {
  // Sentinel: `importStats` is written as the final step of every successful
  // import, so its presence proves data was imported and survived. Keying on
  // db.sleepDays.count() (the previous check) was wrong: a valid export with
  // no sleep rows re-imported the entire ZIP on every single launch.
  const stats = await db.meta.get('importStats')
  if (stats !== undefined) return // data intact — nothing to recover

  // No sentinel. Either nothing was ever imported, or Safari evicted the DB.
  // Guard against a half-state (rows present but stats missing, e.g. an
  // interrupted import): if any pillar table has rows, don't clobber them
  // with a silent re-import — the user can re-import explicitly instead.
  const counts = await Promise.all([
    db.sleepDays.count(),
    db.readinessDays.count(),
    db.activityDays.count(),
  ])
  if (counts.some((c) => c > 0)) return

  // Dexie's Table<MetaEntry, string>.get() already returns MetaEntry | undefined;
  // no cast needed — the type is inferred from the table's generic parameter.
  const zipEntry = await db.meta.get('zipBlob')
  // instanceof narrows MetaEntry's `unknown` value — anything but a real Blob
  // (corrupted entry, old format) is treated the same as a missing one.
  if (!(zipEntry?.value instanceof Blob)) {
    // Both the records and the ZIP are gone (full Safari eviction).
    // Signal to Onboarding.tsx that a re-import is required.
    window.dispatchEvent(new CustomEvent('oura:eviction', { detail: 'no-zip' }))
    return
  }

  // ZIP blob survived: silently re-import it. No UI involvement needed —
  // useLiveQuery flips useHasData() as soon as rows land, and until then the
  // user sees Onboarding, which is accurate ("your data is being restored").
  // Failures degrade to the no-zip path: the user is asked to re-import manually.
  try {
    const { runImport } = await import('@/workers/runImport')
    await runImport(zipEntry.value)
  } catch {
    window.dispatchEvent(new CustomEvent('oura:eviction', { detail: 'no-zip' }))
  }
}
