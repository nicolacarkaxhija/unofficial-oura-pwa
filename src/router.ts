import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { lazy, Suspense } from 'react'
import { parseISO, isValid } from 'date-fns'

// ─── Why TanStack Router (not React Router v6) ────────────────────────────────
//
// The :date param in /sleep/$date, /readiness/$date, /activity/$date feeds
// directly into Dexie queries. With React Router, params.date is `string` — you
// must manually validate it in every component before touching the DB.
// With TanStack Router's `parseParams`, validation runs at route level and a
// bad URL never reaches the component. This eliminates an entire class of bug.

// ─── Page components (lazy-loaded for code splitting) ─────────────────────────
const Dashboard = lazy(() => import('./pages/Dashboard'))
const SleepList = lazy(() => import('./pages/sleep/SleepList'))
const SleepDetail = lazy(() => import('./pages/sleep/SleepDetail'))
const ReadinessList = lazy(() => import('./pages/readiness/ReadinessList'))
const ReadinessDetail = lazy(() => import('./pages/readiness/ReadinessDetail'))
const ActivityList = lazy(() => import('./pages/activity/ActivityList'))
const ActivityDetail = lazy(() => import('./pages/activity/ActivityDetail'))
const Settings = lazy(() => import('./pages/Settings'))

// ─── Shared date param parser ─────────────────────────────────────────────────
// Used by all three detail routes. Throws on an invalid date string, causing
// TanStack Router to show the nearest error boundary instead of passing
// garbage to a Dexie query.
function parseDateParam(raw: Record<string, string>): { date: string } {
  const date = raw['date']
  if (!date) throw new Error('Missing date parameter')
  const parsed = parseISO(date)
  if (!isValid(parsed)) throw new Error(`Invalid date: ${date}`)
  return { date }
}

// ─── Route tree ───────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  // The root renders the persistent app shell (bottom tab bar + header).
  // <Outlet /> is replaced by the matched child route's component.
  // TanStackRouterDevtools renders only in development (it tree-shakes in prod).
  component: () => (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading…</div>}>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </Suspense>
  ),
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
})

// ─── Sleep routes ─────────────────────────────────────────────────────────────

const sleepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sleep',
  component: SleepList,
})

const sleepDetailRoute = createRoute({
  getParentRoute: () => sleepRoute,
  path: '$date',
  parseParams: parseDateParam,
  component: SleepDetail,
})

// ─── Readiness routes ─────────────────────────────────────────────────────────

const readinessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/readiness',
  component: ReadinessList,
})

const readinessDetailRoute = createRoute({
  getParentRoute: () => readinessRoute,
  path: '$date',
  parseParams: parseDateParam,
  component: ReadinessDetail,
})

// ─── Activity routes ──────────────────────────────────────────────────────────

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  component: ActivityList,
})

const activityDetailRoute = createRoute({
  getParentRoute: () => activityRoute,
  path: '$date',
  parseParams: parseDateParam,
  component: ActivityDetail,
})

// ─── Settings ─────────────────────────────────────────────────────────────────

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings,
})

// ─── Router instance ──────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  sleepRoute.addChildren([sleepDetailRoute]),
  readinessRoute.addChildren([readinessDetailRoute]),
  activityRoute.addChildren([activityDetailRoute]),
  settingsRoute,
])

export const router = createRouter({ routeTree })

// Registers the router type globally so `useParams`, `Link`, and `navigate`
// are fully typed throughout the app without prop drilling.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
