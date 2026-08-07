/**
 * Attendance Service
 * Student Affairs attendance occurrences + QR/roll-number based marking.
 * @module apps/student-affairs/modules/attendance
 */

import { success, notFound, badRequest, forbidden } from "../../../../services/base/index.js"
import { User, StudentProfile } from "../../../../models/index.js"
import { attendanceOwner } from "../../../../services/attendance/attendanceOwner.service.js"
import { attendanceQueries } from "../../../../services/attendance/attendanceQueries.service.js"
import { decryptData } from "../../../../utils/qrUtils.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_SOURCE,
  SCAN_RESULT,
  MAX_ROSTER_SIZE,
  ASSIGNABLE_ROLES,
} from "./attendance.constants.js"

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const normalizeRoll = (value = "") => String(value).trim().toUpperCase()

class AttendanceService {
  isManager(user) {
    return user?.role === ROLES.ADMIN || user?.role === ROLES.SUPER_ADMIN
  }

  canAccess(user, occurrence) {
    if (this.isManager(user)) return true
    const userId = String(user?._id)
    if (String(occurrence.createdBy?._id || occurrence.createdBy) === userId) return true
    return (occurrence.assignedUsers || []).some(
      (assigned) => String(assigned?._id || assigned) === userId
    )
  }

  async normalizeAssignedUsers(assignedUsers) {
    if (!Array.isArray(assignedUsers) || assignedUsers.length === 0) return []
    const uniqueIds = [...new Set(assignedUsers.map(String))]
    const users = await User.find({
      _id: { $in: uniqueIds },
      role: { $in: ASSIGNABLE_ROLES },
    }).select("_id")
    return users.map((u) => u._id)
  }

  async listOccurrences(user, { status, search } = {}) {
    const query = {}
    if (!this.isManager(user)) {
      query.$or = [{ assignedUsers: user._id }, { createdBy: user._id }]
    }
    if (status) query.status = status
    if (search) query.title = { $regex: escapeRegex(search), $options: "i" }

    const occurrences = await attendanceQueries.listOccurrences(query)

    const ids = occurrences.map((o) => o._id)
    const countsByOccurrence = new Map()
    if (ids.length) {
      const counts = await attendanceQueries.aggregateRecordCountsByOccurrences(ids)
      counts.forEach((c) => countsByOccurrence.set(String(c._id), c.count))
    }

    const items = occurrences.map((o) => ({
      ...o,
      presentCount: countsByOccurrence.get(String(o._id)) || 0,
      rosterCount: (o.roster || []).length,
    }))

    return success({ occurrences: items })
  }

  async getOccurrence(id, user) {
    const occurrence = await attendanceQueries.findOccurrenceByIdPopulated(id)
    if (!occurrence) return notFound("Attendance occurrence")
    if (!this.canAccess(user, occurrence)) return forbidden("You do not have access to this occurrence")

    const records = await attendanceQueries.findRecordsByOccurrence(id)

    const rosterSet = new Set((occurrence.roster || []).map(normalizeRoll))
    const presentSet = new Set(records.map((r) => normalizeRoll(r.rollNumber)))
    const hasRoster = rosterSet.size > 0

    const recordsWithFlags = records.map((r) => ({
      ...r,
      inRoster: hasRoster ? rosterSet.has(normalizeRoll(r.rollNumber)) : null,
    }))

    const absentRollNumbers = hasRoster
      ? [...rosterSet].filter((roll) => !presentSet.has(roll)).sort()
      : []
    const extraRollNumbers = hasRoster
      ? [...presentSet].filter((roll) => !rosterSet.has(roll)).sort()
      : []
    const presentInRosterCount = hasRoster
      ? [...presentSet].filter((roll) => rosterSet.has(roll)).length
      : presentSet.size

    const reconciliation = {
      hasRoster,
      rosterCount: rosterSet.size,
      presentCount: presentSet.size,
      presentInRosterCount,
      absentCount: absentRollNumbers.length,
      extraCount: extraRollNumbers.length,
      absentRollNumbers,
      extraRollNumbers,
    }

    return success({ occurrence, records: recordsWithFlags, reconciliation })
  }

  async createOccurrence(data, user) {
    const assignedUsers = await this.normalizeAssignedUsers(data.assignedUsers)
    const occurrence = await attendanceOwner.createOccurrence({
      title: data.title,
      description: data.description || "",
      location: data.location || "",
      startAt: data.startAt || undefined,
      assignedUsers,
      createdBy: user._id,
      status: ATTENDANCE_STATUS.OPEN,
    })

    const populated = await attendanceQueries.findOccurrenceByIdPopulated(occurrence._id)

    return success({ occurrence: populated }, 201, "Attendance occurrence created")
  }

  async updateOccurrence(id, data, user) {
    const occurrence = await attendanceQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Attendance occurrence")

    if (data.title !== undefined) occurrence.title = data.title
    if (data.description !== undefined) occurrence.description = data.description
    if (data.location !== undefined) occurrence.location = data.location
    if (data.startAt !== undefined) occurrence.startAt = data.startAt || undefined
    if (data.status !== undefined) occurrence.status = data.status
    if (data.assignedUsers !== undefined) {
      occurrence.assignedUsers = await this.normalizeAssignedUsers(data.assignedUsers)
    }

    await attendanceOwner.persistOccurrence(occurrence)

    const populated = await attendanceQueries.findOccurrenceByIdPopulated(id)

    return success({ occurrence: populated }, 200, "Attendance occurrence updated")
  }

  async deleteOccurrence(id, user) {
    const occurrence = await attendanceQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Attendance occurrence")

    await attendanceOwner.deleteOccurrenceById(id)

    return success(null, 200, "Attendance occurrence deleted")
  }

  async uploadRoster(id, rollNumbers, user) {
    const occurrence = await attendanceQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Attendance occurrence")

    const normalized = [
      ...new Set((rollNumbers || []).map(normalizeRoll).filter(Boolean)),
    ].slice(0, MAX_ROSTER_SIZE)

    occurrence.roster = normalized
    occurrence.rosterUpdatedAt = new Date()
    await attendanceOwner.persistOccurrence(occurrence)

    return success({ rosterCount: normalized.length }, 200, "Roster updated")
  }

  /**
   * Resolve a scanned campus-access QR payload to a student.
   * Mirrors the existing SecurityService.verifyQR flow (email + AES-encrypted expiry).
   */
  async resolveStudentByQr(email, encryptedData) {
    if (!email || !encryptedData) return { error: "Invalid QR code" }

    const userDoc = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") },
    })
    if (!userDoc || !userDoc.aesKey) return { error: "Invalid QR code" }

    let expiry
    try {
      expiry = await decryptData(encryptedData, userDoc.aesKey)
    } catch {
      return { error: "Invalid QR code" }
    }
    if (!expiry) return { error: "Invalid QR code" }
    if (Date.now() > Number(expiry)) return { error: "QR code expired", expired: true }

    const studentProfile = await StudentProfile.findOne({ userId: userDoc._id }).select(
      "rollNumber department degree batch userId"
    )
    if (!studentProfile) return { error: "Student profile not found", noStudent: true }

    return { userDoc, studentProfile }
  }

  buildStudentInfo(studentProfile, userDoc) {
    return {
      studentId: studentProfile._id,
      rollNumber: studentProfile.rollNumber,
      name: userDoc?.name || null,
      email: userDoc?.email || null,
      profileImage: userDoc?.profileImage || null,
      department: studentProfile.department || null,
      batch: studentProfile.batch || null,
    }
  }

  async markPresent(occurrence, { studentProfile, userDoc, scannedBy, source }) {
    const rollNumber = normalizeRoll(studentProfile.rollNumber)
    const inRoster = (occurrence.roster || []).length
      ? occurrence.roster.map(normalizeRoll).includes(rollNumber)
      : null

    const outcome = await attendanceOwner.createRecord({
      occurrenceId: occurrence._id,
      studentId: studentProfile._id,
      userId: userDoc?._id || studentProfile.userId,
      rollNumber,
      scannedBy: scannedBy._id,
      source,
    })
    if (outcome.ok) {
      return { result: SCAN_RESULT.MARKED, record: outcome.record, inRoster }
    }
    // Repeat/concurrent scan hit the unique (occurrenceId, studentId) index —
    // idempotent: return the existing record as a DUPLICATE.
    const record = await attendanceQueries.findRecordByOccurrenceAndStudent(
      occurrence._id,
      studentProfile._id
    )
    return { result: SCAN_RESULT.DUPLICATE, record, inRoster }
  }

  async scanAttendance(id, { email, encryptedData, source }, user) {
    const occurrence = await attendanceQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Attendance occurrence")
    if (!this.canAccess(user, occurrence)) return forbidden("You do not have access to this occurrence")
    if (occurrence.status === ATTENDANCE_STATUS.CLOSED)
      return badRequest("This attendance occurrence is closed")

    const resolved = await this.resolveStudentByQr(email, encryptedData)
    if (resolved.error) return badRequest(resolved.error)

    const { studentProfile, userDoc } = resolved
    const { result, record, inRoster } = await this.markPresent(occurrence, {
      studentProfile,
      userDoc,
      scannedBy: user,
      source: source || ATTENDANCE_SOURCE.CAMERA,
    })

    const student = this.buildStudentInfo(studentProfile, userDoc)
    const message =
      result === SCAN_RESULT.DUPLICATE ? "Already marked present" : "Marked present"

    return success({ result, student, inRoster, record }, 200, message)
  }

  async markByRollNumber(id, { rollNumber, source }, user) {
    const occurrence = await attendanceQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Attendance occurrence")
    if (!this.canAccess(user, occurrence)) return forbidden("You do not have access to this occurrence")
    if (occurrence.status === ATTENDANCE_STATUS.CLOSED)
      return badRequest("This attendance occurrence is closed")

    const normalized = normalizeRoll(rollNumber)
    const studentProfile = await StudentProfile.findOne({
      rollNumber: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
    })
      .select("rollNumber department degree batch userId")
      .populate("userId", "name email profileImage")
    if (!studentProfile) return notFound(`Student with roll number ${normalized}`)

    const userDoc = studentProfile.userId
    const { result, record, inRoster } = await this.markPresent(occurrence, {
      studentProfile,
      userDoc,
      scannedBy: user,
      source: source || ATTENDANCE_SOURCE.MANUAL,
    })

    const student = this.buildStudentInfo(studentProfile, userDoc)
    const message =
      result === SCAN_RESULT.DUPLICATE ? "Already marked present" : "Marked present"

    return success({ result, student, inRoster, record }, 200, message)
  }

  async deleteRecord(id, recordId, user) {
    const occurrence = await attendanceQueries.findOccurrenceByIdLean(id)
    if (!occurrence) return notFound("Attendance occurrence")
    if (!this.canAccess(user, occurrence)) return forbidden("You do not have access to this occurrence")

    const record = await attendanceOwner.deleteRecord({ recordId, occurrenceId: id })
    if (!record) return notFound("Attendance record")

    return success(null, 200, "Attendance record removed")
  }
}

export const attendanceService = new AttendanceService()
export default attendanceService
