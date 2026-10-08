import { seed } from "../seed.js"
import { allocationOwner } from "../../../src/services/dining/allocationOwner.service.js"
import {
  Caterer, DiningPeriod, DiningAllocation, DiningRebate, DiningMealVerification,
  StudentProfile, Hostel, Unit, Room, RoomAllocation,
} from "../../../src/models/index.js"

let sequence = 0
const unique = () => `${Date.now().toString(36)}${++sequence}`
export const keyFor = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
export const shift = (key, days) => {
  const date = new Date(`${key}T00:00:00`)
  date.setDate(date.getDate() + days)
  return keyFor(date)
}

export const catererFixture = async (extra = {}) => {
  const user = await seed.createUser({ role: "Dining", subRole: "Caterer", ...extra })
  const tag = unique()
  const caterer = await Caterer.create({ userId: user._id, name: `Foods ${tag}`, email: `foods-${tag}@hms.test` })
  return { user, caterer }
}
export const periodFixture = (caterer, from, to, extra = {}) => DiningPeriod.create({
  startDate: new Date(`${from}T00:00:00`), endDate: new Date(`${to}T23:59:59.999`),
  catererIds: [caterer._id], mealSlots: [{ name: "All Day", startTime: "00:00", endTime: "23:59" }, { name: "Lunch", startTime: "12:00", endTime: "15:00" }],
  ...extra,
})
export const studentFixture = async (period, caterer, name, prefix) => {
  const user = await seed.student({ name, profileImage: `media://${unique()}.jpg` })
  const profile = await StudentProfile.create({ userId: user._id, rollNumber: `${prefix}-${unique()}`.toUpperCase(), degree: "B.Tech", department: "CSE", batch: "2025", gender: "Male", status: "Active" })
  const allocation = await DiningAllocation.create({ periodId: period._id, catererId: caterer._id, studentUserId: user._id, studentProfileId: profile._id, rollNumber: profile.rollNumber })
  return { user, profile, allocation }
}
export const removeAllocationFixture = (student) => allocationOwner.removeStudent({
  periodId: student.allocation.periodId, studentUserId: student.user._id,
})
export const fixture = async () => {
  const login = await catererFixture()
  const today = keyFor()
  const date = shift(today, -1)
  const period = await periodFixture(login.caterer, shift(today, -20), shift(today, 20))
  const students = []
  for (const [name, prefix] of [["Alpha Student", "A"], ["Beta Student", "B"], ["Gamma Student", "C"], ["Delta Student", "D"]]) {
    students.push(await studentFixture(period, login.caterer, name, prefix))
  }
  return { ...login, today, date, period, students }
}
export const scanFixture = (f, student, { date = f.date, time = "12:00:00", status = "verified", source = "manual", ...extra } = {}) => DiningMealVerification.create({
  periodId: f.period._id, catererId: f.caterer._id, expectedCatererId: f.caterer._id,
  studentUserId: student?.user._id || null, studentProfileId: student?.profile._id || null,
  rollNumber: student?.profile.rollNumber || "GHOST", mealSlotKey: "all-day", mealSlotName: "All Day",
  scannedAt: new Date(`${date}T${time}`), source, status, ...extra,
})
export const rebateFixture = (f, student, { from = f.date, to = from, status = "approved", ...extra } = {}) => {
  const dateKeys = []
  for (let date = from; date <= to; date = shift(date, 1)) dateKeys.push(date)
  return DiningRebate.create({
    requestGroupId: unique(), periodId: f.period._id, catererId: f.caterer._id,
    studentUserId: student.user._id, studentProfileId: student.profile._id, rollNumber: student.profile.rollNumber,
    startDate: new Date(`${from}T00:00:00Z`), endDate: new Date(`${to}T00:00:00Z`),
    dateKeys, dayCount: dateKeys.length, type: "short-term", status, reason: "Travel", ...extra,
  })
}
export const roomFixture = async (student, { unitBased = true } = {}) => {
  const hostel = await Hostel.create({ name: `Hostel ${unique()}`, type: unitBased ? "unit-based" : "room-only", gender: "Boys" })
  const unit = unitBased ? await Unit.create({ hostelId: hostel._id, unitNumber: "A" }) : null
  const room = await Room.create({ hostelId: hostel._id, unitId: unit?._id, roomNumber: "101", capacity: 1 })
  const allocation = await RoomAllocation.create({ userId: student.user._id, studentProfileId: student.profile._id, hostelId: hostel._id, roomId: room._id, bedNumber: 1 })
  await StudentProfile.updateOne({ _id: student.profile._id }, { currentRoomAllocation: allocation._id })
  return hostel
}
