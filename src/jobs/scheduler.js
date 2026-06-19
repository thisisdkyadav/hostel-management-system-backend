/**
 * Background job scheduler.
 *
 * A single hourly tick hosts all recurring jobs. Each job is wrapped in a Redis
 * window-lock so it runs on exactly one PM2 instance per window (no duplicates).
 * Matches the codebase's setInterval scheduler pattern (no extra cron dependency).
 *
 * Add future jobs (daily 08:00 arrivals PDF, nightly stay-end invoices) here.
 */

import { withLock } from "../services/lock/distributedLock.js"
import { accommodationService } from "../apps/visitors/modules/accommodation/accommodation.service.js"

const HOUR_MS = 60 * 60 * 1000
const STARTUP_DELAY_MS = 30 * 1000

let tickTimer = null

const pad = (n) => String(n).padStart(2, "0")
const dateStamp = (now) => `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`

// Lock key for "run at most once per clock-hour, on one instance".
const hourWindowKey = (prefix, now = new Date()) => `lock:cron:${prefix}:${dateStamp(now)}-${pad(now.getUTCHours())}`

// Lock key for "run at most once per UTC day, on one instance".
const dayWindowKey = (prefix, now = new Date()) => `lock:cron:${prefix}:${dateStamp(now)}`

const runHourlyJobs = async () => {
  // Accommodation: 24h Chief Warden auto-approve sweep (hourly).
  await withLock(
    hourWindowKey("accommodation-auto-approve"),
    HOUR_MS / 1000,
    async () => {
      const approved = await accommodationService.autoApproveExpiredChiefWardenRequests()
      if (approved > 0) {
        console.log(`[scheduler] auto-approved ${approved} accommodation request(s)`)
      }
    },
    { release: false }
  ).catch((error) => {
    console.error("[scheduler] accommodation auto-approve failed:", error?.message || error)
  })

  // Accommodation: stay-end invoices (once per UTC day).
  await withLock(
    dayWindowKey("accommodation-invoices"),
    24 * HOUR_MS / 1000,
    async () => {
      const invoiced = await accommodationService.generateStayEndInvoices()
      if (invoiced > 0) {
        console.log(`[scheduler] generated ${invoiced} accommodation invoice(s)`)
      }
    },
    { release: false }
  ).catch((error) => {
    console.error("[scheduler] accommodation invoicing failed:", error?.message || error)
  })
}

export const startJobScheduler = () => {
  if (tickTimer) return
  setTimeout(() => {
    runHourlyJobs().catch(() => {})
  }, STARTUP_DELAY_MS)
  tickTimer = setInterval(() => {
    runHourlyJobs().catch(() => {})
  }, HOUR_MS)
  console.log("⏰ Job scheduler started")
}

export const stopJobScheduler = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}
