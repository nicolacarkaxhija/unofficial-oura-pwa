import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProgressBar } from '@/components/ui'

// DEV-only seed function — Vite's tree-shaker drops this import in production
// because it's only referenced inside `if (import.meta.env.DEV)` blocks.
const DEV = import.meta.env.DEV

// ─── Onboarding ───────────────────────────────────────────────────────────────
//
// Rendered by App.tsx when useHasData() returns false (no data in IndexedDB).
// Responsibility: explain how to get the data export from Oura and handle the
// ZIP import via a Web Worker.
//
// Worker lifecycle: we create a fresh worker per import attempt and terminate
// it on component unmount. We don't reuse a single worker because there is no
// practical import scenario where the user would import twice within the same
// page lifetime without navigating away.
//
// After a successful import, useHasData() in App.tsx becomes true → React
// re-renders the root → Onboarding unmounts and the normal app shell appears.
// No imperative navigation is needed; the reactive DB state drives everything.

interface WorkerMessage {
  type: 'progress' | 'done' | 'error'
  payload?: {
    pct?: number
    phase?: string
    message?: string
  }
}

export default function Onboarding() {
  const { t } = useTranslation('onboarding')

  // Import state machine: idle → importing → done / error
  const [importing, setImporting] = useState(false)
  const [pct, setPct] = useState(0)
  const [phase, setPhase] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Safari eviction: show a banner when the 'no-zip' event fires
  const [evicted, setEvicted] = useState(false)

  const [seeding, setSeeding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)

  // ── Dev seed ────────────────────────────────────────────────────────────
  // Bypasses the ZIP pipeline and writes synthetic data directly to IndexedDB.
  // Only rendered in development; excluded from production bundle by tree-shaking.
  async function handleSeedData() {
    if (!DEV) return
    setSeeding(true)
    try {
      const { seedDatabase } = await import('@/dev/seedDatabase')
      await seedDatabase()
      // useHasData() in App.tsx will react automatically — no navigation needed
    } finally {
      setSeeding(false)
    }
  }

  // Listen for the eviction event dispatched by App.tsx's checkAndRepair()
  useEffect(() => {
    function handleEviction(e: Event) {
      const evt = e as CustomEvent<string>
      if (evt.detail === 'no-zip') setEvicted(true)
    }
    window.addEventListener('oura:eviction', handleEviction)
    return () => {
      window.removeEventListener('oura:eviction', handleEviction)
    }
  }, [])

  // Terminate the worker if the component unmounts mid-import
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setPct(0)
    setPhase('')
    setError(null)
    setEvicted(false)

    // Spawn a new module worker for each import.
    // `import.meta.url` is resolved at bundle-build time by Vite's worker plugin,
    // giving us a code-split worker chunk that doesn't bloat the main bundle.
    const worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, payload } = event.data

      if (type === 'progress') {
        if (payload?.pct !== undefined) setPct(payload.pct)
        if (payload?.phase !== undefined) setPhase(payload.phase)
      } else if (type === 'done') {
        // Worker finished. useLiveQuery in App.tsx will detect the new data
        // and replace this component automatically — no navigation needed.
        worker.terminate()
        workerRef.current = null
      } else {
        // type === 'error' — the only remaining variant in the union
        setError(payload?.message ?? 'Unknown error')
        setImporting(false)
        worker.terminate()
        workerRef.current = null
      }
    }

    worker.onerror = (err) => {
      setError(err.message)
      setImporting(false)
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({ type: 'start', payload: { blob: file } })
  }

  const steps = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 dark:bg-slate-900">
      {/* Eviction banner — shown when Safari wiped IndexedDB and there's no ZIP */}
      {evicted && (
        <div
          className="mb-6 w-full max-w-md rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
          role="alert"
        >
          {t('eviction.noZip')}
        </div>
      )}

      {/* Oura logo placeholder + headline */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {/* Circular logo placeholder — replaced when a real SVG asset is added */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400 text-3xl font-bold text-white"
          aria-hidden="true"
        >
          O
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
      </div>

      {/* Step-by-step import instructions */}
      <div className="mb-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          {t('steps.heading')}
        </h2>
        <ol className="space-y-3">
          {steps.map((key, idx) => (
            <li
              key={key}
              className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300"
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                aria-hidden="true"
              >
                {idx + 1}
              </span>
              {t(`steps.${key}`)}
            </li>
          ))}
        </ol>
      </div>

      {/* Import button / progress */}
      <div className="w-full max-w-md space-y-4">
        {importing ? (
          <ProgressBar pct={pct} label={phase || t('importBtn')} />
        ) : (
          <>
            {/* Hidden native file input — triggered by the styled button below.
                We hide the input rather than style it because cross-browser
                file-input styling is unreliable and the button UX is cleaner. */}
            <input
              ref={fileInputRef}
              id="zip-input"
              data-testid="zip-input"
              type="file"
              accept=".zip"
              className="sr-only"
              /* The visible button below is the interactive control; keep the
                 hidden input out of the tab order and a11y tree so there aren't
                 two controls named "Import ZIP". */
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-2xl bg-emerald-400 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
            >
              {t('importBtn')}
            </button>
          </>
        )}

        {error && (
          <p className="text-center text-sm text-rose-500 dark:text-rose-400" role="alert">
            {error}
          </p>
        )}

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">{t('legal')}</p>

        {/* ── Dev-only shortcut ──────────────────────────────────────────
            Load 90 days of synthetic data without a real ZIP.
            Visible only in `npm run dev`; Vite removes this branch in builds. */}
        {DEV && (
          <div className="mt-6 border-t border-dashed border-slate-200 pt-6 dark:border-slate-700">
            <p className="mb-2 text-center text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Dev mode
            </p>
            <button
              type="button"
              onClick={() => void handleSeedData()}
              disabled={seeding}
              className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400"
            >
              {seeding ? 'Seeding 90 days…' : '⚡ Load demo data (dev only)'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
