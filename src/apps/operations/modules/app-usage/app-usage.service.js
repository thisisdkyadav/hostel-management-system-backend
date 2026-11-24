/**
 * App Usage: students' devices and the installed SMS app.
 *
 * Students' browsers report each visit (POST /ping); admins read the summary
 * (GET /stats). A student "has the app" once any of their devices has opened
 * the installed app, or Android Chrome has told a tab it is installed. Phones
 * can't report an uninstall, so "used the app in the last 30 days" is shown too.
 */

import { success, badRequest } from "../../../../services/base/index.js"
import { appUsageOwner } from "../../../../services/app-usage/appUsageOwner.service.js"
import { appUsageQueries } from "../../../../services/app-usage/appUsageQueries.service.js"
import { studentProfileQueries } from "../../../../services/student/studentProfileQueries.service.js"
import { APP_BROWSERS, APP_PLATFORMS } from "../../../../models/index.js"

const DAY = 24 * 60 * 60 * 1000
const ACTIVE_DAYS = 30
const TREND_DAYS = 60
const RECENT = 25
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const IST_OFFSET = 330 * 60 * 1000

/** YYYY-MM-DD in India time. */
const istDay = (date) => new Date(new Date(date).getTime() + IST_OFFSET).toISOString().slice(0, 10)

export const recordPing = async ({ user, body = {} }) => {
  const deviceId = String(body.deviceId || "")
  if (!DEVICE_ID_RE.test(deviceId)) return badRequest("Invalid device id")
  if (!APP_PLATFORMS.includes(body.platform)) return badRequest("Invalid platform")
  const mode = body.mode === "app" ? "app" : "browser"
  await appUsageOwner.recordVisit({
    userId: user._id,
    deviceId,
    platform: body.platform,
    browser: APP_BROWSERS.includes(body.browser) ? body.browser : "other",
    mode,
    layout: body.layout === "phone" ? "phone" : "classic",
    installedHint: typeof body.installedHint === "boolean" ? body.installedHint : null,
  })
  return success({ ok: true })
}

const hasApp = (device) => Boolean(device.firstAppAt) || (device.platform === "android" && device.installedHint === true)

export const getStats = async () => {
  const now = Date.now()
  const activeSince = now - ACTIVE_DAYS * DAY
  const [devices, activeStudents] = await Promise.all([appUsageQueries.findAllForStats(), studentProfileQueries.countProfiles({ status: "Active" })])

  const students = new Map() // userId → summary
  for (const device of devices) {
    const id = String(device.userId)
    let s = students.get(id)
    if (!s) {
      s = { userId: id, app: new Set(), appActive: new Set(), seen: new Set(), firstAppAt: null, lastSeenAt: null, devices: [] }
      students.set(id, s)
    }
    s.devices.push(device)
    const seenAt = new Date(device.lastSeenAt).getTime()
    if (!s.lastSeenAt || seenAt > s.lastSeenAt) s.lastSeenAt = seenAt
    if (seenAt >= activeSince) s.seen.add(device.platform)
    if (hasApp(device)) {
      s.app.add(device.platform)
      if (device.firstAppAt) {
        const first = new Date(device.firstAppAt).getTime()
        if (!s.firstAppAt || first < s.firstAppAt) s.firstAppAt = first
      }
    }
    if (device.lastAppAt && new Date(device.lastAppAt).getTime() >= activeSince) s.appActive.add(device.platform)
  }

  const all = [...students.values()]
  const count = (fn) => all.filter(fn).length
  const installed = {
    total: count((s) => s.app.size > 0),
    ios: count((s) => s.app.has("ios")),
    android: count((s) => s.app.has("android")),
    activeTotal: count((s) => s.appActive.size > 0),
    activeIos: count((s) => s.appActive.has("ios")),
    activeAndroid: count((s) => s.appActive.has("android")),
  }
  const seen = {
    total: count((s) => s.seen.size > 0),
    android: count((s) => s.seen.has("android")),
    ios: count((s) => s.seen.has("ios")),
    desktop: count((s) => s.seen.has("desktop")),
    today: count((s) => s.lastSeenAt && istDay(s.lastSeenAt) === istDay(now)),
    ever: all.length,
  }

  // Phone students (last 30 days) who don't have the app yet, by the browser they use.
  const withoutApp = { android: {}, ios: {} }
  for (const s of all) {
    if (s.app.size > 0) continue
    for (const platform of ["android", "ios"]) {
      if (!s.seen.has(platform)) continue
      const latest = s.devices.filter((d) => d.platform === platform).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))[0]
      const browser = latest?.browser || "other"
      withoutApp[platform][browser] = (withoutApp[platform][browser] || 0) + 1
    }
  }

  // New app users per day (first time any of their devices opened the app).
  const trendStart = istDay(now - (TREND_DAYS - 1) * DAY)
  const byDay = {}
  for (const s of all) {
    if (!s.firstAppAt) continue
    const day = istDay(s.firstAppAt)
    if (day >= trendStart) byDay[day] = (byDay[day] || 0) + 1
  }
  const trend = []
  for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
    const day = istDay(now - i * DAY)
    trend.push({ day, count: byDay[day] || 0 })
  }

  // Most recent visits, with who it was.
  const recentDevices = [...devices].sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt)).slice(0, RECENT)
  const ids = [...new Set(recentDevices.map((d) => String(d.userId)))]
  const profiles = ids.length
    ? await studentProfileQueries.findByUserIds(ids, { select: "userId rollNumber", populate: { path: "userId", select: "name" }, lean: true })
    : []
  const who = new Map(profiles.map((p) => [String(p.userId?._id || p.userId), { name: p.userId?.name || "", rollNumber: p.rollNumber || "" }]))
  const recent = recentDevices.map((d) => ({
    name: who.get(String(d.userId))?.name || "",
    rollNumber: who.get(String(d.userId))?.rollNumber || "",
    platform: d.platform,
    browser: d.browser,
    mode: d.mode,
    hasApp: hasApp(d),
    visits: d.visits,
    lastSeenAt: d.lastSeenAt,
  }))

  return success({
    activeStudents,
    activeDays: ACTIVE_DAYS,
    installed,
    seen,
    withoutApp,
    trend,
    recent,
    generatedAt: new Date(now).toISOString(),
  })
}
