import { useEffect } from 'react'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { BottomNav } from '@/components/ui'
import { useHasData } from '@/db/hooks'
import Onboarding from '@/pages/Onboarding'
import { checkAndRepair } from '@/lib/evictionRecovery'

// ─── Eviction Recovery ────────────────────────────────────────────────────────
//
// Safari's WebKit wipes IndexedDB if the PWA is not opened for 7 days.
// checkAndRepair() (see src/lib/evictionRecovery.ts) re-parses the stored ZIP
// blob if the data is gone, or signals Onboarding when the blob is gone too.
//
// This hook is a side-effect-only shell; the actual UI is rendered below.
// Mounting it at the root ensures the check runs before any page loads data.

// Not exported — only used inside this module. Exporting a hook from a .tsx
// file that also has a default component export triggers react-refresh warnings.
function useEvictionCheck() {
  useEffect(() => {
    void checkAndRepair()
  }, [])
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
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Still querying IndexedDB — render nothing (avoids flash of wrong state)
  if (hasData === undefined) {
    return null
  }

  // No data imported yet — show onboarding, but only in place of the Dashboard.
  // Other routes (Settings especially — theme/language are useful pre-import)
  // stay reachable; list pages simply render their own empty states.
  if (!hasData && pathname === '/') {
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
