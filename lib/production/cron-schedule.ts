import { AUTOMATED_PRODUCTION_WORKER_JOBS } from "./operations-environment"

export const BOOKING_MAINTENANCE_JOB = "cancel-expired-bookings" as const

export const PRODUCTION_CRON_SCHEDULES = [
  {
    path: "/api/cron/cancel-expired-bookings",
    schedule: "15 2 * * *",
    jobs: [BOOKING_MAINTENANCE_JOB],
  },
  {
    path: "/api/cron/phase8fb-maintenance",
    schedule: "15 3 * * *",
    jobs: [...AUTOMATED_PRODUCTION_WORKER_JOBS],
  },
] as const

export const SCHEDULED_PRODUCTION_JOBS = PRODUCTION_CRON_SCHEDULES.flatMap(
  (entry) => entry.jobs,
)

export function utcDailyWindow(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

export function cronExecutionKey(path: string, job: string, now = new Date()) {
  return `cron:${utcDailyWindow(now)}:${path}:${job}`
}
