import { useEffect, useMemo, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useTheme } from '@/theme/useTheme'

// ─── Why uPlot over Recharts for this component ───────────────────────────────
//
// HR and HRV at 5-minute resolution over 90 days ≈ 25,920 points.
// SVG libraries create one DOM element per point; panning a 25k-element SVG on
// mobile causes layout thrashing and drops below 60fps. uPlot renders to a
// single <canvas> — GPU compositing cost is constant regardless of point count.
//
// ─── Why canvas needs explicit dark-mode colours ──────────────────────────────
//
// Canvas drawing commands (strokeStyle, fillStyle) are immediate-mode: they
// never see the CSS cascade. SVG elements can use `color: var(--text)` because
// they live in the DOM and inherit styles. We must read resolvedTheme and
// hard-code hex values into the uPlot options. Changing theme destroys and
// re-creates the plot (the effect dependency array includes resolvedTheme).
//
// ─── Why LTTB over uniform downsampling ──────────────────────────────────────
//
// Uniform downsampling (e.g. keep every Nth point) discards data blindly: it
// will miss a short-duration HRV dip or HR spike if that event falls between
// the retained indices. LTTB (Largest-Triangle-Three-Buckets) works in
// perceptual buckets: within each bucket it retains the point that forms the
// largest triangle with its neighbours, thereby preserving the visual shape of
// peaks and valleys. The result is perceptually indistinguishable from the full
// dataset at the zoom level being viewed, while reducing DOM pressure and
// uPlot's internal path-rebuild cost.

// ─── LTTB (Largest-Triangle-Three-Buckets) downsampling ─────────────────────
//
// Standard algorithm by Sveinn Steinarsson (2013 MSc thesis).
// Reduces an array of {timestamp, value} points to `threshold` points while
// preserving the visual shape of the curve.

interface Point {
  timestamp: number
  value: number
}

function lttb(data: Point[], threshold: number): Point[] {
  const n = data.length
  if (n <= threshold) return data

  const sampled: Point[] = []
  // Always include the first and last points
  const first = data[0]
  const last = data[n - 1]
  if (!first || !last) return data

  sampled.push(first)

  // Bucket size — we fill threshold-2 buckets between the first and last points
  const bucketSize = (n - 2) / (threshold - 2)

  let prevSelected = 0

  for (let i = 0; i < threshold - 2; i++) {
    // Boundaries of the current bucket
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n - 1)

    // Average of the NEXT bucket (the "C" point in the triangle)
    const nextBucketStart = bucketEnd
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, n - 1)
    let avgX = 0
    let avgY = 0
    let avgCount = 0
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      const p = data[j]
      if (p) {
        avgX += p.timestamp
        avgY += p.value
        avgCount++
      }
    }
    if (avgCount > 0) {
      avgX /= avgCount
      avgY /= avgCount
    }

    // Find the point in the current bucket that forms the largest triangle
    // with the previously selected point (A) and the next-bucket average (C).
    const aPoint = data[prevSelected]
    const ax = aPoint?.timestamp ?? 0
    const ay = aPoint?.value ?? 0

    let maxArea = -1
    let maxIdx = bucketStart

    for (let j = bucketStart; j < bucketEnd; j++) {
      const p = data[j]
      if (!p) continue
      // Triangle area via the cross-product formula (sign doesn't matter)
      const area = Math.abs((ax - avgX) * (p.value - ay) - (ax - p.timestamp) * (avgY - ay)) * 0.5
      if (area > maxArea) {
        maxArea = area
        maxIdx = j
      }
    }

    const selected = data[maxIdx]
    if (selected) sampled.push(selected)
    prevSelected = maxIdx
  }

  sampled.push(last)
  return sampled
}

// ─── Colour palette ───────────────────────────────────────────────────────────

const PALETTE = {
  light: { grid: '#e5e7eb', axis: '#6b7280', text: '#111827' },
  dark: { grid: '#374151', axis: '#9ca3af', text: '#f9fafb' },
} as const

const DEFAULT_COLOR = '#3b82f6' // blue-500

// ─── LTTB threshold ──────────────────────────────────────────────────────────
//
// 500 is the practical limit where uPlot's path renderer stays under 1ms on a
// mid-range mobile device. Above 500 points on a narrow screen the individual
// samples are sub-pixel anyway, so LTTB introduces no perceptible loss.
const LTTB_THRESHOLD = 500

interface TimeSeriesChartProps {
  data: Array<{ timestamp: number; value: number }>
  label: string
  color?: string
  unit?: string
}

export default function TimeSeriesChart({
  data,
  label,
  color = DEFAULT_COLOR,
  unit,
}: TimeSeriesChartProps) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  // Apply LTTB before handing data to uPlot.
  // useMemo avoids re-running the O(n) algorithm on every render.
  const downsampled = useMemo(
    () => (data.length > LTTB_THRESHOLD ? lttb(data, LTTB_THRESHOLD) : data),
    [data],
  )

  useEffect(() => {
    if (!containerRef.current || downsampled.length === 0) return

    const palette = PALETTE[resolvedTheme]

    // uPlot AlignedData: [xSeries, ...ySeries]
    // Timestamps must be in Unix seconds (not milliseconds).
    const xs = downsampled.map((p) => p.timestamp / 1000)
    const ys: (number | null)[] = downsampled.map((p) => p.value)

    const uData: uPlot.AlignedData = [xs, ys]

    const axisLabel = unit ? `${label} (${unit})` : label

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: 200,
      pxAlign: true,
      cursor: { show: true },
      legend: { show: false },
      scales: {
        x: { time: true },
        y: { auto: true },
      },
      axes: [
        {
          stroke: palette.axis,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { stroke: palette.grid, width: 1 },
        },
        {
          stroke: palette.axis,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { stroke: palette.grid, width: 1 },
          label: axisLabel,
          labelSize: 16,
          labelFont: '11px sans-serif',
        },
      ],
      series: [
        {},
        {
          label,
          stroke: color,
          width: 2,
          fill: `${color}26`, // 15% opacity fill under the line (hex alpha)
          spanGaps: false,
        },
      ],
    }

    plotRef.current?.destroy()
    plotRef.current = new uPlot(opts, uData, containerRef.current)

    const ro = new ResizeObserver(([entry]) => {
      if (entry && plotRef.current) {
        plotRef.current.setSize({ width: entry.contentRect.width, height: 200 })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [downsampled, label, color, unit, resolvedTheme])

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        {label} — no data
      </div>
    )
  }

  return <div ref={containerRef} className="w-full" aria-label={label} role="img" />
}
