/**
 * App Usage: students' devices and the installed SMS app.
 *
 * Students' browsers report each visit (POST /ping); admins read the summary
 * (GET /stats). A student "has the app" once any of their devices has opened
 * the installed app, or Android Chrome has told a tab it is installed. Phones
 * can't report an uninstall, so "used the app in the last 30 days" is shown too.
 */

import mongoose from "mongoose"
import { success, badRequest, notFound } from "../../../../services/base/index.js"
import { userQueries } from "../../../../services/user/userQueries.service.js"
import { AUTHZ_ROUTE_DEFINITIONS } from "../../../../core/authz/authz.catalog.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
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

// ==================== page visits (every role) ====================

const VISIT_DAYS = 7
const USERS_PAGE = 40

// Catalog paths as matchers, most specific first (literal before :param).
const PAGE_MATCHERS = AUTHZ_ROUTE_DEFINITIONS.flatMap((route) =>
  (route.paths || []).map((pattern) => ({
    pattern,
    label: route.label,
    params: (pattern.match(/:/g) || []).length,
    re: new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[A-Za-z_]+/g, "[^/]+")}$`),
  }))
).sort((a, b) => a.params - b.params || b.pattern.length - a.pattern.length)

const ID_SEGMENT = /^(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{20,})$/i

/** The page a path belongs to: its catalog pattern + name, or the path with ids replaced by :id. */
export const pageForPath = (rawPath) => {
  let path = String(rawPath || "").split(/[?#]/)[0].slice(0, 300)
  if (path.length > 1) path = path.replace(/\/+$/, "")
  const match = PAGE_MATCHERS.find((m) => m.re.test(path))
  if (match) return { path, page: match.pattern, label: match.label }
  const page = path
    .split("/")
    .map((segment) => (segment && ID_SEGMENT.test(segment) ? ":id" : segment))
    .join("/")
  // Not in the catalog (a sub-page): name it after its nearest catalog parent.
  const parent = PAGE_MATCHERS.filter((m) => !m.params && m.pattern.length > 1 && path.startsWith(`${m.pattern}/`)).sort((a, b) => b.pattern.length - a.pattern.length)[0]
  return { path, page, label: parent ? parent.label : "" }
}

export const recordPageVisit = async ({ user, body = {} }) => {
  const raw = typeof body.path === "string" ? body.path : ""
  if (!raw.startsWith("/")) return badRequest("Invalid path")
  const { path, page, label } = pageForPath(raw)
  await appUsageOwner.recordPageVisit({
    userId: user._id,
    role: user.role,
    page,
    label,
    path,
    platform: APP_PLATFORMS.includes(body.platform) ? body.platform : "desktop",
    mode: body.mode === "app" ? "app" : "browser",
  })
  return success({ ok: true })
}

/** Start of the day (India time) `daysAgo` days back. */
const istDayStart = (daysAgo = 0) => {
  const today = istDay(Date.now())
  return new Date(new Date(`${today}T00:00:00+05:30`).getTime() - daysAgo * DAY)
}

/** Every role: users, users who have opened SMS, and the last 7 days. */
export const getRoleSummary = async () => {
  const since = istDayStart(VISIT_DAYS - 1)
  const roles = Object.values(ROLES)
  const [recent, totals, counts] = await Promise.all([
    appUsageQueries.recentVisitsByRole(since),
    appUsageQueries.totalsByRole(),
    Promise.all(roles.map((role) => userQueries.countUsers({ role }))),
  ])
  const recentBy = new Map(recent.map((r) => [r._id, r]))
  const totalBy = new Map(totals.map((r) => [r._id, r]))
  return success({
    days: VISIT_DAYS,
    roles: roles.map((role, index) => ({
      role,
      users: counts[index],
      tracked: totalBy.get(role)?.users || 0,
      visits: totalBy.get(role)?.visits || 0,
      activeUsers: recentBy.get(role)?.users || 0,
      recentVisits: recentBy.get(role)?.visits || 0,
    })),
  })
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Admins per saved sidebar layout and sub-role (mode null = never picked one). The page folds these into what each admin sees. */
const sidebarModeCounts = async () => {
  const admins = await userQueries.findUsers({ role: ROLES.ADMIN }, { select: "sidebarMode subRole", lean: true })
  const counts = new Map()
  for (const admin of admins) {
    const key = JSON.stringify([admin.sidebarMode || null, admin.subRole || null])
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts].map(([key, users]) => {
    const [mode, subRole] = JSON.parse(key)
    return { mode, subRole, users }
  })
}

/** Users of one role, most recently active first; `search` (name/email) also finds users who never opened SMS. */
export const listRoleUsers = async ({ query = {} }) => {
  const role = String(query.role || "")
  if (!Object.values(ROLES).includes(role)) return badRequest("Unknown role")
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const search = String(query.search || "").trim().slice(0, 80)
  const since = istDayStart(VISIT_DAYS - 1)

  let matched = null
  if (search) {
    const re = new RegExp(escapeRegex(search), "i")
    matched = await userQueries.findUsers({ role, $or: [{ name: re }, { email: re }] }, { select: "name email", lean: true, sort: { name: 1 }, limit: 200 })
  }
  const { items, total } = await appUsageQueries.usersWithTotals({
    role,
    userIds: matched ? matched.map((u) => u._id) : null,
    skip: (page - 1) * USERS_PAGE,
    limit: USERS_PAGE,
  })

  let rows = items
  let count = total
  // Searching also lists matching users with no visits (after those with visits).
  if (matched) {
    const seen = new Set(items.map((i) => String(i._id)))
    const never = matched.filter((u) => !seen.has(String(u._id))).map((u) => ({ _id: u._id, visits: 0, pages: 0, lastAt: null }))
    count = total + never.length
    if (items.length < USERS_PAGE) {
      const offset = Math.max(0, (page - 1) * USERS_PAGE - total)
      rows = items.concat(never.slice(offset, offset + USERS_PAGE - items.length))
    }
  }

  const ids = rows.map((r) => r._id)
  const [users, recent] = await Promise.all([
    ids.length ? userQueries.findUsers({ _id: { $in: ids } }, { select: "name email subRole sidebarMode sidebarModeUpdatedAt", lean: true }) : [],
    ids.length ? appUsageQueries.recentVisitsForUsers(ids, since) : [],
  ])
  const userBy = new Map(users.map((u) => [String(u._id), u]))
  const recentBy = new Map(recent.map((r) => [String(r._id), r.visits]))
  return success({
    role,
    page,
    limit: USERS_PAGE,
    total: count,
    items: rows.map((r) => {
      const u = userBy.get(String(r._id)) || {}
      return {
        userId: String(r._id),
        name: u.name || "",
        email: u.email || "",
        subRole: u.subRole || null,
        visits: r.visits,
        pages: r.pages,
        recentVisits: recentBy.get(String(r._id)) || 0,
        lastAt: r.lastAt,
        sidebarMode: u.sidebarMode || null,
        sidebarModeUpdatedAt: u.sidebarModeUpdatedAt || null,
      }
    }),
    sidebarModes: role === ROLES.ADMIN ? await sidebarModeCounts() : undefined,
  })
}

/** One user: all-time per-page counts with the latest visit, and the last 7 days visit by visit. */
export const getUserActivity = async ({ userId }) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return badRequest("Invalid user id")
  const user = await userQueries.findUserById(userId, { select: "name email role subRole sidebarMode sidebarModeUpdatedAt sidebarModeHistory", lean: true })
  if (!user) return notFound("User not found")
  const since = istDayStart(VISIT_DAYS - 1)
  const [pages, visits] = await Promise.all([appUsageQueries.pageTotalsForUser(user._id), appUsageQueries.visitsForUser(user._id, since)])

  const days = []
  for (let i = 0; i < VISIT_DAYS; i += 1) days.push({ day: istDay(istDayStart(i)), visits: [] })
  const byDay = new Map(days.map((d) => [d.day, d]))
  for (const v of visits) byDay.get(istDay(v.at))?.visits.push({ at: v.at, page: v.page, label: v.label, path: v.path, platform: v.platform, mode: v.mode })

  return success({
    user: { userId: String(user._id), name: user.name || "", email: user.email || "", role: user.role, subRole: user.subRole || null },
    sidebar: {
      mode: user.sidebarMode || null,
      updatedAt: user.sidebarModeUpdatedAt || null,
      history: (user.sidebarModeHistory || []).map((h) => ({ mode: h.mode, at: h.at || null })),
    },
    totalVisits: pages.reduce((sum, p) => sum + p.count, 0),
    lastAt: pages[0]?.lastAt || null,
    pages: pages.map((p) => ({ page: p.page, label: p.label, count: p.count, firstAt: p.firstAt, lastAt: p.lastAt })),
    days,
  })
}
