import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

// Shared "no record for this date" state for the three detail pages.
// A resolved not-found (hook returned null) must look different from loading:
// an endless skeleton reads as a hang, while this tells the user the date
// simply isn't in their export and offers a way back.
export function NoDataForDate() {
  const { t } = useTranslation('common')
  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-16 pb-6 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('noData')}</p>
      <Link
        to="/"
        className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        {t('back')}
      </Link>
    </div>
  )
}
