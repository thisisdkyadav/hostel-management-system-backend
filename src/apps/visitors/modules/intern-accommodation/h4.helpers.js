import { badRequest, conflict, forbidden, notFound, success, withTransaction } from "../../../../services/base/index.js"
import { accommodationQueries as queries } from "../../../../services/accommodation/accommodationQueries.service.js"
import { accommodationOwner as owner } from "../../../../services/accommodation/accommodationOwner.service.js"
import { staffRolesQueries } from "../../../../services/user/staffRolesQueries.service.js"
import { userQueries } from "../../../../services/user/userQueries.service.js"
import { withLock, LOCK_NOT_ACQUIRED } from "../../../../services/lock/distributedLock.js"
import { ACCOMMODATION_STATUS as S } from "../../../../models/index.js"

export { S }
export const validId = (v) => /^[a-f\d]{24}$/i.test(String(v || ""))
export const institutional = (v) => /^[^\s@]+@iiti\.ac\.in$/i.test(String(v || ""))
export const clean = (v, max = 500) =>
  String(v || "")
    .trim()
    .slice(0, max)
export const emailValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ""))
export const instituteDay = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
export const parsePaidAt = (value, now = new Date()) => {
  if (typeof value !== "string" || !value.trim()) return null
  const parsed = new Date(value)
  if (!Number.isFinite(+parsed)) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return parsed.toISOString().slice(0, 10) === value && value <= instituteDay(now) ? parsed : null
  }
  return parsed <= now ? parsed : null
}
export const isCreator = (r, u) => String(r.requesterUserId) === String(u?._id)
export const isFaculty = (r, u) =>
  u?.role === "Academics" && institutional(u.email) && String(r.h4.facultyUserId) === String(u._id)
export const isOffice = (u) => u?.role === "Admin" && u.subRole === "Chief Warden Office"
export const isChief = (u) => u?.role === "Admin" && u.subRole === "Chief Warden"
export const isAccounts = (u) => u?.role === "Admin" && u.subRole === "Accountant"
export const isDesk = (u) => isOffice(u) || isChief(u) || isAccounts(u)
export const isClosed = (r) => [S.CANCELLED, S.REJECTED, S.CHECKED_OUT, S.INVOICED].includes(r.status)
export const paid = (r) =>
  r.payment?.status === "Verified" && (r.additionalPayments || []).every((p) => p.status === "Verified")
export const audit = (r, u, note, status = r.status) => {
  r.status = status
  r.stageDeadlineAt = null // H4 requires an explicit Chief Warden decision.
  r.timeline.push({ status, by: u?._id || null, at: new Date(), note })
}
export const approve = (r, u, stage, action, reason = "") =>
  r.approvals.push({ stage, action, actorUserId: u?._id, actorEmail: u?.email, reason, at: new Date() })
export const hostelScope = async (u) => {
  if (u?.role === "Hostel Supervisor") {
    const p = await staffRolesQueries.findByUserId("HostelSupervisor", u._id, { lean: true })
    return [...new Set([...(p?.hostelIds || []), p?.activeHostelId].filter(Boolean).map(String))]
  }
  if (u?.role === "Hostel Gate") {
    const p = await staffRolesQueries.findByUserId("HostelGate", u._id, { lean: true })
    return p?.hostelId ? [String(p.hostelId)] : []
  }
  return []
}
export const canRead = async (r, u) => {
  if (r.status === S.DRAFT) return isCreator(r, u)
  if (isCreator(r, u) || (isFaculty(r, u) && r.status !== S.DRAFT) || isDesk(u)) return true
  return (await hostelScope(u)).includes(String(r.allotment?.hostelId))
}
export const scopeFilter = async (u) => {
  if (isDesk(u)) return { $or: [{ status: { $ne: S.DRAFT } }, { requesterUserId: u._id }] }
  const choices = [{ requesterUserId: u._id }]
  if (u.role === "Academics" && institutional(u.email))
    choices.push({ "h4.facultyUserId": u._id, status: { $ne: S.DRAFT } })
  const ids = await hostelScope(u)
  if (ids.length) choices.push({ "allotment.hostelId": { $in: ids } })
  return { $or: choices }
}
export const freshUser = async (u) => {
  if (!u?._id) return null
  return userQueries.findUserById(u._id, { lean: true, select: "name email role subRole" })
}
export const withHostelLocks = async (ids, task) => {
  const keys = [...new Set(ids.filter(validId).map(String))].sort()
  const run = (i) => (i >= keys.length ? task() : withLock(`lock:accommodation:allot:${keys[i]}`, 30, () => run(i + 1)))
  return run(0)
}
// Every H4 mutation checks the client revision inside the transaction. Email,
// token creation and PDF storage run after commit, never inside retried callbacks.
export const mutate = async (id, body, user, change, { notify = true } = {}) => {
  if (!validId(id)) return badRequest("Invalid request ID")
  if (!Number.isInteger(body?.revision)) return badRequest("Refresh the request before saving")
  const result = await withLock(`lock:h4:request:${id}`, 30, async () => {
    const before = await queries.findH4ById(id, { lean: true })
    if (!before) return notFound("H4 request")
    const u = user?.external ? user : await freshUser(user)
    if (!u) return forbidden()
    const locked = await withHostelLocks([String(before.allotment?.hostelId || ""), String(body.hostelId || "")], () =>
      withTransaction(async (session) => {
        const r = await queries.findH4ById(id, { session })
        if (r.h4.revision !== body.revision) return conflict("This request changed. Refresh and try again.")
        if (!u.external && !(await canRead(r, u))) return forbidden()
        if (u.external === "payer" && u.email !== r.h4.payer.email) return forbidden("Payer access changed")
        if (u.external === "intern" && u.email !== r.applicantEmail) return forbidden("Intern access changed")
        const failure = await change(r, u, session)
        if (failure?.success === false) return failure
        r.h4.revision += 1
        await owner.persist(r, { session })
        if (notify && r.status !== S.DRAFT) await owner.queueH4Notification(r._id, r.h4.revision, { session })
        return success(r.toObject())
      }),
    )
    return locked === LOCK_NOT_ACQUIRED ? conflict("Room availability is being updated. Try again.") : locked
  })
  return result === LOCK_NOT_ACQUIRED ? conflict("This request is being updated. Try again.") : result
}
