import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useTheme } from '@/theme/ThemeContext'

// ─── Why uPlot here, not Recharts ────────────────────────────────────────────
//
// A full night of sleep at 5-minute resolution produces ~100 data points, but
// a multi-night view can easily reach 25k+. SVG-based libraries (Recharts, Nivo)
// create one DOM element per data point. Panning a 25k-point SVG chart on a
// mobile browser causes layout thrashing and visible frame drops. uPlot renders
// to a single <canvas> element — 25k points costs the same GPU compositing pass
// as 25 points. This is the same reason Grafana uses uPlot for time-series.
//
// ─── Why canvas needs explicit dark-mode colours ──────────────────────────────
//
// SVG elements inherit CSS custom properties (e.g. `color: var(--text)`) because
// they live in the DOM. Canvas drawing calls (strokeStyle, fillStyle) are
// immediate-mode; they never see the CSS cascade. We must therefore read the
// resolved theme and pass explicit hex colours when building the uPlot options
// object. Changing the theme requires destroying and re-creating the plot.

// ─── Sleep-stage colour palette ──────────────────────────────────────────────
//
// Colours chosen to match common Oura app conventions so users recognise them.
// We define both light and dark variants; dark values are lightened slightly
// to remain readable against a dark background.

const STAGE_COLOURS = {
  light: {
    awake: '#f97316', // orange-500
    rem: '#8b5cf6', // violet-500
    lightSleep: '#60a5fa', // blue-400
    deep: '#1d4ed8', // blue-700
    grid: '#e5e7eb', // gray-200
    axis: '#6b7280', // gray-500
    text: '#111827', // gray-900
  },
  dark: {
    awake: '#fb923c', // orange-400 — lightened for dark bg
    rem: '#a78bfa', // violet-400
    lightSleep: '#93c5fd', // blue-300
    deep: '#3b82f6', // blue-500
    grid: '#374151', // gray-700
    axis: '#9ca3af', // gray-400
    text: '#f9fafb', // gray-50
  },
} as const

// Oura sleep-phase encoding: 1=Awake, 2=REM, 3=Light, 4=Deep
const STAGE_VALUES = { awake: 1, rem: 2, light: 3, deep: 4 } as const

interface HypnogramChartProps {
  /** Oura sleep_phase_5_min values: 1=Awake 2=REM 3=Light 4=Deep */
  phases: number[]
  /** ISO 8601 datetime of the first interval */
  startTime: string
  /** Minutes between each sample — Oura default is 5 */
  intervalMinutes?: number
}

export default function HypnogramChart({
  phases,
  startTime,
  intervalMinutes = 5,
}: HypnogramChartProps) {
  const { t } = useTranslation('sleep')
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!containerRef.current || phases.length === 0) return

    const palette = STAGE_COLOURS[resolvedTheme]
    const startMs = new Date(startTime).getTime()
    const intervalMs = intervalMinutes * 60 * 1000

    // Build x-axis: Unix timestamps in seconds (uPlot convention)
    const xs = phases.map((_, i) => (startMs + i * intervalMs) / 1000)

    // Build y-axis: raw phase values (1–4). uPlot treats null as a gap.
    // We cast to (number | null)[] to satisfy the AlignedData type.
    const ys: (number | null)[] = phases.map((p) => (p >= 1 && p <= 4 ? p : null))

    const data: uPlot.AlignedData = [xs, ys]

    // Stage colours for the step-line fill areas, keyed by phase value
    const colourForPhase = (phase: number): string => {
      switch (phase) {
        case STAGE_VALUES.awake:
          return palette.awake
        case STAGE_VALUES.rem:
          return palette.rem
        case STAGE_VALUES.light:
          return palette.lightSleep
        case STAGE_VALUES.deep:
          return palette.deep
        default:
          return palette.axis
      }
    }

    // The hypnogram is rendered as a step-line with segment colours per phase.
    // We use a custom drawLayer hook to paint filled rectangles for each
    // contiguous run of the same phase value, which produces the distinctive
    // colour-banded hypnogram appearance.
    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      // Height is modest — the hypnogram is a compact header above HR/HRV panels
      height: 160,
      pxAlign: true,
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: { time: true },
        y: {
          // Invert so Awake (1) is at top and Deep (4) is at bottom — matches
          // the Oura app convention where deeper = lower on the chart.
          range: [4.5, 0.5],
          auto: false,
        },
      },
      axes: [
        {
          // X-axis: time labels
          stroke: palette.axis,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { stroke: palette.grid, width: 1 },
        },
        {
          // Y-axis: sleep stage labels
          stroke: palette.axis,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { show: false },
          values: [
            [1, t('stages.awake')],
            [2, t('stages.rem')],
            [3, t('stages.light')],
            [4, t('stages.deep')],
          ],
          size: 56, // fixed px width so labels never clip
        },
      ],
      series: [
        // Series 0 is always the x-axis in uPlot; no options needed
        {},
        {
          // The visible step-line series — we paint it as filled bands below
          stroke: palette.axis,
          width: 1,
          // step-before interpolation matches the "current phase for this
          // 5-minute window" semantics (phase doesn't change mid-interval).
          // uPlot.paths.stepped is typed as optional but is always present at
          // runtime (it ships with the uPlot bundle). The non-null assertion
          // avoids PathBuilder | undefined which exactOptionalPropertyTypes rejects.
          paths: uPlot.paths.stepped!({ align: 1 }),
          fill: (self, seriesIdx) => {
            // Return a canvas gradient that picks the fill colour per-segment.
            // We abuse the fill callback to return a CanvasGradient whose stops
            // correspond to phase transitions across the x domain.
            const ctx = self.ctx
            const { left, top, width, height: h } = self.bbox

            const grad = ctx.createLinearGradient(left, top, left + width, top)

            const xData = self.data[0] as number[]
            const yData = self.data[seriesIdx] as (number | null)[]
            const xMin = xData[0] ?? 0
            const xMax = xData[xData.length - 1] ?? 1
            const xRange = xMax - xMin || 1

            let prev: number | null = null

            yData.forEach((phase, i) => {
              if (phase === prev) return
              const stop = ((xData[i] ?? 0) - xMin) / xRange
              if (phase !== null) {
                grad.addColorStop(Math.max(0, Math.min(1, stop)), colourForPhase(phase))
              }
              prev = phase ?? null
            })

            return grad
          },
        },
      ],
    }

    // Destroy any previous instance before creating a new one.
    // This is necessary when the theme changes — canvas colour props must be
    // baked into the opts object at construction time; there is no CSS cascade.
    plotRef.current?.destroy()
    plotRef.current = new uPlot(opts, data, containerRef.current)

    // ResizeObserver keeps the chart width in sync with its container.
    // uPlot's internal resize event watcher only fires on window resize;
    // panel layout changes (sidebars collapsing, tab switches) require this.
    const ro = new ResizeObserver(([entry]) => {
      if (entry && plotRef.current) {
        plotRef.current.setSize({
          width: entry.contentRect.width,
          height: 160,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [phases, startTime, intervalMinutes, resolvedTheme, t])

  if (phases.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        {t('stages.title')} — {t('stages.awake')}
      </div>
    )
  }

  return <div ref={containerRef} className="w-full" aria-label={t('stages.title')} role="img" data-testid="hypnogram-canvas" />
}
