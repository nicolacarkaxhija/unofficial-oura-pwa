// ─── BottomNav ────────────────────────────────────────────────────────────────
//
// Why bottom nav instead of a sidebar?
//
//   This is a mobile-first PWA installed on phones — a sidebar requires
//   a "hamburger" button or permanent screen real-estate that shrinks the content
//   area. Bottom tab bars place navigation controls within easy thumb reach on
//   large-screen phones (the "thumb zone" is the lower 60% of the screen). Both
//   iOS and Android native apps use this pattern heavily (iOS UITabBar,
//   Material NavigationBar), so users arrive with existing mental models. A
//   sidebar would fight convention and make the app feel unpolished.
//
// Active tab detection:
//   We use `useRouterState` to read the current pathname rather than a wrapping
//   <NavLink> component, because TanStack Router's Link doesn't expose an
//   `activeClassName` shortcut — we need to compute it manually anyway.

import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { ReactElement } from 'react'

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────
//
// We inline SVGs instead of importing an icon library (lucide-react, heroicons,
// etc.) to keep the initial bundle small. Each icon is ~200 bytes vs. ~30 kB
// for a full icon set — significant at PWA install time on mobile networks.

function DashboardIcon({ active }: { active: boolean }): ReactElement {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function SleepIcon({ active }: { active: boolean }): ReactElement {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  )
}

function ReadinessIcon({ active }: { active: boolean }): ReactElement {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Heart-rate / pulse waveform */}
      <polyline points="3 12 6 12 8 5 10 19 12 12 15 12" />
      <polyline points="15 12 17 12 19 8 21 12" />
    </svg>
  )
}

function ActivityIcon({ active }: { active: boolean }): ReactElement {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Flame icon for activity */}
      <path d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-4-3-7-3-7z" />
      <path d="M12 18c0 0-2-2-2-4" />
    </svg>
  )
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'sleep' | 'readiness' | 'activity'

interface TabDef {
  id: TabId
  path: string
  // Strict match for '/' so /sleep doesn't also activate dashboard
  exact?: boolean
  Icon: ({ active }: { active: boolean }) => ReactElement
}

const TABS: TabDef[] = [
  { id: 'dashboard', path: '/', exact: true, Icon: DashboardIcon },
  { id: 'sleep', path: '/sleep', Icon: SleepIcon },
  { id: 'readiness', path: '/readiness', Icon: ReadinessIcon },
  { id: 'activity', path: '/activity', Icon: ActivityIcon },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function BottomNav(): ReactElement {
  const { t } = useTranslation('common')
  const { location } = useRouterState()
  const pathname = location.pathname

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      // pb uses a CSS calc to add OS safe-area padding above the home indicator
      // on iPhone. --safe-area-bottom is set in styles.css from env(safe-area-inset-bottom).
      style={{ paddingBottom: 'calc(1rem + var(--safe-area-bottom))' }}
      aria-label={t('nav.dashboard')}
    >
      <ul className="flex items-center justify-around pt-2">
        {TABS.map(({ id, path, exact, Icon }) => {
          const isActive = exact ? pathname === path : pathname.startsWith(path)

          return (
            <li key={id}>
              <Link
                to={path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon active={isActive} />
                <span>{t(`nav.${id}`)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
