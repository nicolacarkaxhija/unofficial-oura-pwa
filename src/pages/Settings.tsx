import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { useTheme } from '@/theme/useTheme'
import type { Theme } from '@/theme/ThemeContext'
import { useImportStats } from '@/db/hooks'
import { db } from '@/db/client'
import { format } from 'date-fns'

// ─── Settings Page ─────────────────────────────────────────────────────────────
//
// Three concerns handled here:
// 1. Data — re-import and clear (destructive, gated behind a confirmation)
// 2. Appearance — theme (system/light/dark) and language (EN/IT)
// 3. About — legal, privacy, version
//
// Theme is controlled by ThemeContext (writes 'dark' class to <html>).
// Language is controlled by i18next directly; react-i18next re-renders consumers.

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
]

const THEME_OPTIONS: { value: Theme; labelKey: string }[] = [
  { value: 'system', labelKey: 'appearance.themeSystem' },
  { value: 'light', labelKey: 'appearance.themeLight' },
  { value: 'dark', labelKey: 'appearance.themeDark' },
]

export default function Settings() {
  const { t } = useTranslation('settings')
  const { theme, setTheme } = useTheme()
  const importStats = useImportStats()
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function handleClearAll() {
    setClearing(true)
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()))
    })
    // Dispatch so the onboarding gate re-evaluates without a page reload.
    window.dispatchEvent(new CustomEvent('oura:eviction', { detail: 'no-zip' }))
    setClearing(false)
    setConfirmClear(false)
  }

  const lastImportDate = importStats?.importedAt
    ? format(new Date(importStats.importedAt), 'dd MMM yyyy HH:mm')
    : null

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 pb-[calc(5rem+var(--safe-area-bottom))]">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>

      {/* ── Data ──────────────────────────────────────────────────────────── */}
      <Section title={t('data.title')}>
        {lastImportDate ? (
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            {t('data.lastImport', { date: lastImportDate })}
          </p>
        ) : null}

        <label className="block">
          <span className="sr-only">{t('data.importNew')}</span>
          <input
            id="zip-input-settings"
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              // Re-import dispatches to App root's worker listener so the
              // worker lifecycle isn't duplicated in Settings.
              window.dispatchEvent(new CustomEvent('oura:reimport', { detail: file }))
            }}
          />
          <button
            type="button"
            onClick={() => document.getElementById('zip-input-settings')?.click()}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600 active:scale-95"
          >
            {t('data.importNew')}
          </button>
        </label>

        {!confirmClear ? (
          <button
            type="button"
            onClick={() => {
              setConfirmClear(true)
            }}
            className="mt-3 w-full rounded-xl border border-red-300 px-4 py-3 font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            {t('data.clearAll')}
          </button>
        ) : (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <p className="mb-3 text-sm text-red-700 dark:text-red-300">{t('data.clearConfirm')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmClear(false)
                }}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                disabled={clearing}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {clearing ? '…' : t('data.clearAll')}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Appearance ────────────────────────────────────────────────────── */}
      <Section title={t('appearance.title')}>
        <FieldRow label={t('appearance.theme')}>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, labelKey }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTheme(value)
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  theme === value
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </FieldRow>

        <FieldRow label={t('appearance.language')}>
          <div className="flex gap-2">
            {SUPPORTED_LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => void i18n.changeLanguage(code)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  i18n.language.startsWith(code)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </FieldRow>
      </Section>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <Section title={t('about.title')}>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          {t('about.version', { version: '0.1.0' })}
        </p>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t('about.legal')}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('about.privacy')}</p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
      <h2 className="mb-4 text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
        {title}
      </h2>
      {children}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
      {children}
    </div>
  )
}
