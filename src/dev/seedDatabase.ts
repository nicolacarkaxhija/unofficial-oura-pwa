// ─── Dev-only database seeder ─────────────────────────────────────────────────
//
// Writes 90 days of realistic synthetic Oura data directly into IndexedDB,
// bypassing the ZIP import pipeline entirely. This lets developers preview
// every page and chart with data without owning an Oura ring.
//
// Guard: this file is only imported inside `if (import.meta.env.DEV)` blocks,
// so Vite's tree-shaker drops it from production bundles. Do not import it
// at the module top-level in any non-dev path.

import { db } from '@/db/client'
import { subDays, format, addMinutes, addSeconds } from 'date-fns'
import type {
  SleepDay,
  SleepSession,
  ReadinessDay,
  ResilienceDay,
  ActivityDay,
  Workout,
  Meditation,
  StressPoint,
  ImportStats,
} from '@/db/schema'

const DAYS = 90

// Deterministic pseudo-random: same seed → same UI on every reload.
// Avoids flicker and makes visual regression testing possible without snapshots.
function rand(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000
  return Math.floor((x - Math.floor(x)) * (max - min + 1)) + min
}

function randFloat(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000
  return (x - Math.floor(x)) * (max - min) + min
}

const SLEEP_PHASES = [1, 3, 3, 4, 4, 4, 3, 2, 2, 3, 3, 4, 4, 3, 2, 2, 1, 3, 3, 2, 2, 1]
const RESILIENCE_LEVELS: ResilienceDay['level'][] = [
  'exceptional', 'strong', 'solid', 'adequate', 'weak',
]
const WORKOUT_TYPES = ['running', 'cycling', 'strength_training', 'yoga', 'walking']

export async function seedDatabase(): Promise<void> {
  const today = new Date()

  const sleepDays: SleepDay[] = []
  const sleepSessions: SleepSession[] = []
  const readinessDays: ReadinessDay[] = []
  const resilienceDays: ResilienceDay[] = []
  const activityDays: ActivityDay[] = []
  const workouts: Workout[] = []
  const meditations: Meditation[] = []
  const stressPoints: StressPoint[] = []

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = subDays(today, i)
    const day = format(date, 'yyyy-MM-dd')
    const s = i * 7  // seed offset per day

    // ── Sleep ────────────────────────────────────────────────────────────
    const sleepScore = rand(s + 1, 58, 95)
    sleepDays.push({
      day,
      id: `sleep-day-${day}`,
      score: sleepScore,
      contributors: {
        deep_sleep: rand(s + 2, 60, 100),
        efficiency: rand(s + 3, 70, 100),
        latency: rand(s + 4, 50, 100),
        rem_sleep: rand(s + 5, 55, 100),
        restfulness: rand(s + 6, 60, 100),
        timing: rand(s + 7, 65, 100),
        total_sleep: rand(s + 8, 60, 100),
      },
      optimalBedtime: { start: '22:00', end: '06:30' },
      status: 'optimal',
      spo2Percentage: randFloat(s + 9, 95.0, 99.5),
      breathingDisturbanceIndex: rand(s + 10, 0, 8),
    })

    // Build sleep phase 5-min array (~90 entries = 7.5h)
    const phaseCount = 88 + rand(s + 11, -4, 4)
    const phases: number[] = []
    for (let p = 0; p < phaseCount; p++) {
      phases.push(SLEEP_PHASES[p % SLEEP_PHASES.length] ?? 3)
    }

    // HR 5-min array: lower during deep sleep, higher near wake
    const hr: number[] = phases.map((ph, idx) => {
      const base = ph === 4 ? 50 : ph === 2 ? 58 : 55
      return base + rand(s + idx, -3, 3)
    })

    // HRV 5-min array
    const hrv: number[] = phases.map((ph, idx) => {
      const base = ph === 4 ? 45 : ph === 2 ? 35 : 30
      return base + rand(s + idx + 100, -8, 8)
    })

    const bedtimeStart = new Date(date)
    bedtimeStart.setHours(22 + rand(s, -1, 1), rand(s + 20, 0, 59))
    const bedtimeEnd = addMinutes(bedtimeStart, phaseCount * 5 + rand(s + 21, 0, 30))

    sleepSessions.push({
      id: `sleep-session-${day}`,
      day,
      bedtimeStart: bedtimeStart.toISOString(),
      bedtimeEnd: bedtimeEnd.toISOString(),
      type: 'long_sleep',
      efficiency: rand(s + 12, 82, 98),
      latency: rand(s + 13, 300, 900),
      totalSleepDuration: phaseCount * 5 * 60 - rand(s + 14, 0, 1800),
      deepSleepDuration: rand(s + 15, 3600, 7200),
      remSleepDuration: rand(s + 16, 5400, 9000),
      lightSleepDuration: rand(s + 17, 7200, 10800),
      awakeTime: rand(s + 18, 300, 1800),
      timeInBed: phaseCount * 5 * 60 + rand(s + 19, 600, 1800),
      averageHeartRate: rand(s + 22, 52, 62),
      lowestHeartRate: rand(s + 23, 46, 54),
      averageHrv: rand(s + 24, 28, 55),
      averageBreath: randFloat(s + 25, 13.5, 16.5),
      restlessPeriods: rand(s + 26, 1, 8),
      sleepPhase5Min: phases,
      heartRate: hr,
      hrv,
      movement30Sec: Array.from({ length: phaseCount * 10 }, (_, idx) => rand(s + idx + 200, 0, 100)),
    })

    // ── Readiness ────────────────────────────────────────────────────────
    const readinessScore = rand(s + 30, 55, 95)
    readinessDays.push({
      day,
      id: `readiness-${day}`,
      score: readinessScore,
      temperatureDeviation: randFloat(s + 31, -0.5, 0.8),
      temperatureTrendDeviation: randFloat(s + 32, -0.3, 0.4),
      stressHigh: rand(s + 33, 0, 10) < 2,
      recoveryHigh: rand(s + 34, 0, 10) > 7,
      daySummary: 'optimal',
      contributors: {
        activity_balance: rand(s + 35, 60, 100),
        body_temperature: rand(s + 36, 85, 100),
        hrv_balance: rand(s + 37, 55, 100),
        previous_day_activity: rand(s + 38, 60, 100),
        previous_night: sleepScore,
        recovery_index: rand(s + 39, 60, 100),
        resting_heart_rate: rand(s + 40, 70, 100),
        sleep_balance: rand(s + 41, 60, 100),
      },
    })

    resilienceDays.push({
      day,
      id: `resilience-${day}`,
      level: RESILIENCE_LEVELS[rand(s + 42, 0, 4)] ?? 'solid',
      sleepRecovery: randFloat(s + 43, 60, 100),
      daytimeRecovery: randFloat(s + 44, 55, 95),
      stress: randFloat(s + 45, 10, 60),
    })

    // ── Activity ─────────────────────────────────────────────────────────
    const activityScore = rand(s + 50, 50, 98)
    const steps = rand(s + 51, 3000, 14000)

    // MET 5-min array for the day (288 intervals = 24h)
    const met: number[] = Array.from({ length: 288 }, (_, idx) => {
      // Sleep period (0–60): MET ≈ 0.9; daytime (70–220): peaks; evening: low
      if (idx < 60 || idx > 240) return randFloat(s + idx, 0.8, 1.1)
      if (idx > 140 && idx < 160) return randFloat(s + idx, 4.0, 8.0) // workout window
      return randFloat(s + idx, 1.0, 3.5)
    })

    activityDays.push({
      day,
      id: `activity-${day}`,
      score: activityScore,
      steps,
      totalCalories: rand(s + 52, 1800, 3200),
      activeCalories: rand(s + 53, 300, 900),
      equivalentWalkingDistance: steps * 0.75,
      nonWearTime: rand(s + 54, 0, 3600),
      restingTime: rand(s + 55, 25200, 32400),
      sedentaryTime: rand(s + 56, 14400, 28800),
      highActivityTime: rand(s + 57, 600, 3600),
      mediumActivityTime: rand(s + 58, 1800, 7200),
      lowActivityTime: rand(s + 59, 3600, 10800),
      inactivityAlerts: rand(s + 60, 0, 5),
      targetCalories: 600,
      targetMeters: 8000,
      averageMetMinutes: rand(s + 61, 30, 80),
      metersToTarget: Math.max(0, 8000 - steps * 0.75),
      contributors: {
        meet_daily_targets: rand(s + 62, 60, 100),
        move_every_hour: rand(s + 63, 50, 100),
        recovery_time: rand(s + 64, 60, 100),
        stay_active: rand(s + 65, 55, 100),
        training_frequency: rand(s + 66, 50, 100),
        training_volume: rand(s + 67, 50, 100),
      },
      class5Min: met.map((m) => (m > 6 ? 4 : m > 3 ? 3 : m > 1.5 ? 2 : 1)),
      met,
    })

    // ── Workouts (every 3 days) ───────────────────────────────────────────
    if (i % 3 === 0) {
      const workoutStart = new Date(date)
      workoutStart.setHours(7, rand(s + 70, 0, 30))
      const duration = rand(s + 71, 1800, 4500)
      workouts.push({
        id: `workout-${day}`,
        day,
        startDatetime: workoutStart.toISOString(),
        endDatetime: addSeconds(workoutStart, duration).toISOString(),
        activity: WORKOUT_TYPES[rand(s + 72, 0, 4)] ?? 'running',
        calories: rand(s + 73, 150, 600),
        distance: rand(s + 74, 2000, 12000),
        intensity: 'moderate',
        label: null,
        source: 'oura',
      })
    }

    // ── Meditations (every 5 days) ────────────────────────────────────────
    if (i % 5 === 0) {
      const medStart = new Date(date)
      medStart.setHours(20, 0)
      meditations.push({
        id: `meditation-${day}`,
        day,
        startDatetime: medStart.toISOString(),
        endDatetime: addMinutes(medStart, rand(s + 80, 10, 30)).toISOString(),
        type: 'mindfulness',
        mood: null,
      })
    }

    // ── Stress (4 readings/day) ───────────────────────────────────────────
    for (let h = 0; h < 4; h++) {
      const ts = new Date(date)
      ts.setHours(9 + h * 4, rand(s + h, 0, 59))
      stressPoints.push({
        day,
        timestamp: ts.toISOString(),
        stressValue: rand(s + h + 90, 15, 75),
        recoveryValue: rand(s + h + 91, 20, 80),
      })
    }
  }

  const stats: ImportStats = {
    sleepNights: sleepDays.length,
    readinessDays: readinessDays.length,
    activityDays: activityDays.length,
    workouts: workouts.length,
    meditations: meditations.length,
    stressPoints: stressPoints.length,
    importedAt: new Date().toISOString(),
  }

  await db.transaction('rw', db.tables, async () => {
    await Promise.all([
      db.sleepDays.bulkPut(sleepDays),
      db.sleepSessions.bulkPut(sleepSessions),
      db.readinessDays.bulkPut(readinessDays),
      db.resilienceDays.bulkPut(resilienceDays),
      db.activityDays.bulkPut(activityDays),
      db.workouts.bulkPut(workouts),
      db.meditations.bulkPut(meditations),
      db.stressPoints.bulkAdd(stressPoints),
      db.meta.put({ key: 'importStats', value: stats }),
    ])
  })
}
