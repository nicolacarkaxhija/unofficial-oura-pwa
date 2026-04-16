import { db } from '@/db/client'

// ─── Data export ──────────────────────────────────────────────────────────────
//
// Dumps every user-data table to a single JSON blob. Closes the data-ownership
// loop: what came in via GDPR export can leave again in a machine-readable
// form — after the user's own filtering/enrichment horizon, not Oura's.
//
// The meta table is deliberately excluded: its only large entry is the raw
// ZIP blob kept for Safari eviction recovery (not serialisable to JSON and
// redundant — the user already has the ZIP), and importStats is derivable.

export interface ExportPayload {
  format: 'unofficial-oura-pwa'
  /** Bump when the table shapes change incompatibly. */
  version: 1
  exportedAt: string
  tables: Record<string, unknown[]>
}

export async function buildExportPayload(): Promise<ExportPayload> {
  const [
    sleepDays,
    sleepSessions,
    readinessDays,
    resilienceDays,
    activityDays,
    workouts,
    meditations,
    stressPoints,
  ] = await Promise.all([
    db.sleepDays.toArray(),
    db.sleepSessions.toArray(),
    db.readinessDays.toArray(),
    db.resilienceDays.toArray(),
    db.activityDays.toArray(),
    db.workouts.toArray(),
    db.meditations.toArray(),
    db.stressPoints.toArray(),
  ])

  return {
    format: 'unofficial-oura-pwa',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      sleepDays,
      sleepSessions,
      readinessDays,
      resilienceDays,
      activityDays,
      workouts,
      meditations,
      stressPoints,
    },
  }
}

/** Serialise the payload and hand it to the browser as a file download. */
export async function downloadExport(): Promise<void> {
  const payload = await buildExportPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `oura-data-${payload.exportedAt.slice(0, 10)}.json`
    a.click()
  } finally {
    // Deferred revoke: some browsers cancel the download if the URL is
    // revoked synchronously before the click is processed.
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 10_000)
  }
}
