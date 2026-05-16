import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { BottomNav } from '@/components/ui'
import { useHasData } from '@/db/hooks'
import { db } from '@/db/client'
import Onboarding from '@/pages/Onboarding'

// ─── Eviction Recovery ────────────────────────────────────────────────────────
//
// Safari's WebKit wipes IndexedDB if the PWA is not opened for 7 days.
// On every mount we check for records and — if missing — attempt to re-parse
// from the ZIP blob stored in the `meta` table during the last import.
//
// This hook is a side-effect-only shell; the actual UI is rendered below.
// Mounting it at the root ensures the check runs before any page loads data.
//
// If the ZIP is gone too (both records and blob cleared), we dispatch a
// custom event so the Onboarding page can show a "re-import required" banner.
// A custom event is used here rather than a context or Zustand store because
// this is a one-shot signal at boot — context would add a Provider and a
// separate hook import chain just to pass a boolean.

// Not exported — only used inside this module. Exporting a hook from a .tsx
// file that also has a default component export triggers react-refresh warnings.
function useEvictionCheck() {
  useEffect(() => {
    void checkAndRepair()
  }, [])
}

async function checkAndRepair(): Promise<void> {
  const count = await db.sleepDays.count()
  if (count > 0) return // data intact — nothing to recover

  // Dexie's Table<MetaEntry, string>.get() already returns MetaEntry | undefined;
  // no cast needed — the type is inferred from the table's generic parameter.
  const zipEntry = await db.meta.get('zipBlob')
  if (!zipEntry?.value) {
    // Both the records and the ZIP are gone (full Safari eviction).
    // Signal to Onboarding.tsx that a re-import is required.
    window.dispatchEvent(new CustomEvent('oura:eviction', { detail: 'no-zip' }))
    return
  }

  // ZIP blob survived; trigger silent re-import via the worker.
  // The blob is passed in the detail object (not as a top-level CustomEventInit
  // property, which doesn't exist in the DOM type) so the Onboarding listener
  // can extract it via e.detail.blob.
  window.dispatchEvent(
    new CustomEvent('oura:eviction', { detail: { type: 'reparse', blob: zipEntry.value } }),
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
//
// Two render paths:
//   1. No data (useHasData() === false): show <Onboarding /> full-screen.
//      Once the import completes, useLiveQuery updates useHasData() → true and
//      React automatically re-renders to path 2 without any imperative navigation.
//   2. Has data: render the full app shell — BottomNav + the matched route's page
//      via <Outlet />.
//
// While useHasData() is undefined (first render, IndexedDB not yet queried),
// we show nothing to avoid a flash of the onboarding screen before confirming
// there is actually no data. The flash would only last one frame but it's
// jarring on fast devices that have already imported data.

export default function App() {
  useEvictionCheck()
  const hasData = useHasData()

  // Still querying IndexedDB — render nothing (avoids flash of wrong state)
  if (hasData === undefined) {
    return null
  }

  // No data imported yet — show onboarding + import flow
  if (!hasData) {
    return <Onboarding />
  }

  // Normal app shell: persistent bottom nav + current page via TanStack Router
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      {/* Main content area — padded at the bottom so content scrolls above the nav */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      {/* BottomNav is fixed-positioned internally, but we render it here at the
          root so it persists across all child route transitions */}
      <BottomNav />
    </div>
  )
}
