import { useEffect } from 'react'
import { db } from '@/db/client'
import type { MetaEntry } from '@/db/schema'

// ─── Eviction Recovery ────────────────────────────────────────────────────────
//
// Safari's WebKit wipes IndexedDB if the PWA is not opened for 7 days.
// On every mount, we check for records and — if missing — attempt to re-parse
// from the ZIP blob stored in the `meta` table during the last import.
//
// This component is a logic shell only; the router's Outlet renders the UI.
// Mounting it at the root ensures the check runs before any page loads data.
//
// The banner UI is handled by pages/Dashboard.tsx (which reads a zustand-free
// `evictionState` atom exposed via a simple context — added in Wave 2).

export function useEvictionCheck() {
  useEffect(() => {
    void checkAndRepair()
  }, [])
}

async function checkAndRepair(): Promise<void> {
  const count = await db.sleepDays.count()
  if (count > 0) return // data intact

  const zipEntry = (await db.meta.get('zipBlob')) as MetaEntry | undefined
  if (!zipEntry?.value) {
    // Both records and ZIP are gone — show re-import banner.
    // Banner state is managed by the Settings page and a lightweight context;
    // we dispatch a custom event here so no context is needed at this layer.
    window.dispatchEvent(new CustomEvent('oura:eviction', { detail: 'no-zip' }))
    return
  }

  // ZIP blob survived; dispatch to trigger silent re-import via the worker.
  window.dispatchEvent(new CustomEvent('oura:eviction', { detail: 'reparse', blob: zipEntry.value }))
}
