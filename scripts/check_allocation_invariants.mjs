/**
 * Inspection (READ-ONLY): hostel allocation invariants.
 *
 * Reports existing data that roomOwner now refuses to create:
 *   - day scholars or non-Active students who still hold a room
 *   - rooms with more students than capacity
 *   - beds numbered outside 1..capacity (or not a positive integer)
 *   - Room.occupancy not matching the allocation count
 *   - two allocations on the same bed
 *   - two rooms for one student
 *   - StudentProfile.currentRoomAllocation pointer drift
 *   - allocations on missing / non-Active rooms, or hostel/unit mismatch
 *
 * Never writes.
 *
 *   node scripts/check_allocation_invariants.mjs
 *   npm run check:allocations
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { Hostel, Room, RoomAllocation, StudentProfile } from "../src/models/index.js"

const SAMPLE_LIMIT = 25

const toId = (value) => (value ? String(value) : "")

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0

const pushSample = (list, entry) => {
  if (list.length < SAMPLE_LIMIT) list.push(entry)
}

const emptyIssue = () => ({ count: 0, samples: [] })

const record = (issue, entry) => {
  issue.count += 1
  pushSample(issue.samples, entry)
}

const printIssue = (title, issue, formatSample) => {
  console.log(`${title}: ${issue.count}`)
  issue.samples.forEach((sample) => console.log(`  - ${formatSample(sample)}`))
  if (issue.count > issue.samples.length) {
    console.log(`  ... ${issue.count - issue.samples.length} more`)
  }
}

const run = async () => {
  await connectDatabase()

  try {
    const [hostels, rooms, allocations] = await Promise.all([
      Hostel.find({}).select("name type").lean(),
      Room.find({}).select("hostelId unitId roomNumber capacity occupancy status").lean(),
      RoomAllocation.find({}).select("userId studentProfileId hostelId roomId unitId bedNumber").lean(),
    ])

    const hostelById = new Map(hostels.map((hostel) => [toId(hostel._id), hostel]))
    const roomById = new Map(rooms.map((room) => [toId(room._id), room]))

    const profileIds = new Set()
    allocations.forEach((allocation) => {
      if (allocation.studentProfileId) profileIds.add(toId(allocation.studentProfileId))
    })

    const pointedProfiles = await StudentProfile.find({
      currentRoomAllocation: { $exists: true, $ne: null },
    }).select("_id").lean()
    pointedProfiles.forEach((profile) => profileIds.add(toId(profile._id)))

    const students = profileIds.size > 0
      ? await StudentProfile.find({ _id: { $in: [...profileIds] } })
        .select("rollNumber status isDayScholar userId currentRoomAllocation")
        .lean()
      : []
    const studentById = new Map(students.map((student) => [toId(student._id), student]))

    const issues = {
      dayScholarAllocated: emptyIssue(),
      nonActiveAllocated: emptyIssue(),
      missingStudent: emptyIssue(),
      missingRoom: emptyIssue(),
      inactiveRoomOccupied: emptyIssue(),
      bedOutsideCapacity: emptyIssue(),
      invalidBedNumber: emptyIssue(),
      overCapacity: emptyIssue(),
      occupancyDrift: emptyIssue(),
      duplicateBeds: emptyIssue(),
      studentMultiAllocated: emptyIssue(),
      pointerMissingAllocation: emptyIssue(),
      pointerWrongStudent: emptyIssue(),
      allocationPointerMismatch: emptyIssue(),
      userIdMismatch: emptyIssue(),
      hostelMismatch: emptyIssue(),
      unitMismatch: emptyIssue(),
    }

    const allocationsByRoom = new Map()
    const allocationsByStudent = new Map()
    const allocationsByBed = new Map()
    const allocationById = new Map(allocations.map((allocation) => [toId(allocation._id), allocation]))

    const roomLabel = (room, hostel) => {
      const hostelName = hostel?.name || "unknown-hostel"
      const roomNumber = room?.roomNumber || "?"
      return `${hostelName} / ${roomNumber}`
    }

    for (const allocation of allocations) {
      const allocationId = toId(allocation._id)
      const studentId = toId(allocation.studentProfileId)
      const roomId = toId(allocation.roomId)
      const student = studentById.get(studentId)
      const room = roomById.get(roomId)
      const hostel = hostelById.get(toId(allocation.hostelId)) || (room ? hostelById.get(toId(room.hostelId)) : null)

      if (!allocationsByRoom.has(roomId)) allocationsByRoom.set(roomId, [])
      allocationsByRoom.get(roomId).push(allocation)

      if (studentId) {
        if (!allocationsByStudent.has(studentId)) allocationsByStudent.set(studentId, [])
        allocationsByStudent.get(studentId).push(allocation)
      }

      const bedKey = `${roomId}:${String(allocation.bedNumber)}`
      if (!allocationsByBed.has(bedKey)) allocationsByBed.set(bedKey, [])
      allocationsByBed.get(bedKey).push(allocation)

      if (!student) {
        record(issues.missingStudent, { allocationId, studentId, room: roomLabel(room, hostel), bedNumber: allocation.bedNumber })
      } else if (student.isDayScholar === true) {
        record(issues.dayScholarAllocated, {
          allocationId,
          rollNumber: student.rollNumber,
          room: roomLabel(room, hostel),
          bedNumber: allocation.bedNumber,
        })
      } else if (student.status !== "Active") {
        record(issues.nonActiveAllocated, {
          allocationId,
          rollNumber: student.rollNumber,
          status: student.status || "(missing)",
          room: roomLabel(room, hostel),
          bedNumber: allocation.bedNumber,
        })
      }

      if (!room) {
        record(issues.missingRoom, { allocationId, roomId, rollNumber: student?.rollNumber, bedNumber: allocation.bedNumber })
      } else {
        if (room.status && room.status !== "Active") {
          record(issues.inactiveRoomOccupied, {
            allocationId,
            rollNumber: student?.rollNumber,
            room: roomLabel(room, hostel),
            status: room.status,
            bedNumber: allocation.bedNumber,
          })
        }

        if (!isPositiveInteger(allocation.bedNumber)) {
          record(issues.invalidBedNumber, {
            allocationId,
            rollNumber: student?.rollNumber,
            room: roomLabel(room, hostel),
            bedNumber: allocation.bedNumber,
          })
        } else if (allocation.bedNumber > room.capacity) {
          record(issues.bedOutsideCapacity, {
            allocationId,
            rollNumber: student?.rollNumber,
            room: roomLabel(room, hostel),
            bedNumber: allocation.bedNumber,
            capacity: room.capacity,
          })
        }

        if (allocation.hostelId && toId(allocation.hostelId) !== toId(room.hostelId)) {
          record(issues.hostelMismatch, {
            allocationId,
            rollNumber: student?.rollNumber,
            room: roomLabel(room, hostel),
            allocationHostelId: toId(allocation.hostelId),
            roomHostelId: toId(room.hostelId),
          })
        }

        const roomUnit = toId(room.unitId)
        const allocUnit = toId(allocation.unitId)
        if (roomUnit !== allocUnit) {
          record(issues.unitMismatch, {
            allocationId,
            rollNumber: student?.rollNumber,
            room: roomLabel(room, hostel),
            allocationUnitId: allocUnit || "(none)",
            roomUnitId: roomUnit || "(none)",
          })
        }
      }

      if (student) {
        if (toId(student.currentRoomAllocation) !== allocationId) {
          record(issues.allocationPointerMismatch, {
            allocationId,
            rollNumber: student.rollNumber,
            profilePointer: toId(student.currentRoomAllocation) || "(none)",
          })
        }
        if (allocation.userId && student.userId && toId(allocation.userId) !== toId(student.userId)) {
          record(issues.userIdMismatch, {
            allocationId,
            rollNumber: student.rollNumber,
            allocationUserId: toId(allocation.userId),
            profileUserId: toId(student.userId),
          })
        }
      }
    }

    for (const room of rooms) {
      const roomId = toId(room._id)
      const hostel = hostelById.get(toId(room.hostelId))
      const roomAllocations = allocationsByRoom.get(roomId) || []
      const actual = roomAllocations.length
      const occupancy = Number(room.occupancy) || 0
      const capacity = Number(room.capacity) || 0

      if (actual > capacity) {
        record(issues.overCapacity, {
          room: roomLabel(room, hostel),
          status: room.status,
          capacity,
          occupancy,
          allocationCount: actual,
        })
      }

      if (occupancy !== actual) {
        record(issues.occupancyDrift, {
          room: roomLabel(room, hostel),
          status: room.status,
          capacity,
          occupancy,
          allocationCount: actual,
        })
      }
    }

    for (const [bedKey, bedAllocations] of allocationsByBed) {
      if (bedAllocations.length < 2) continue
      const [roomId, bedNumber] = bedKey.split(":")
      const room = roomById.get(roomId)
      const hostel = room ? hostelById.get(toId(room.hostelId)) : null
      record(issues.duplicateBeds, {
        room: roomLabel(room, hostel),
        bedNumber,
        count: bedAllocations.length,
        allocationIds: bedAllocations.map((allocation) => toId(allocation._id)),
      })
    }

    for (const [studentId, studentAllocations] of allocationsByStudent) {
      if (studentAllocations.length < 2) continue
      const student = studentById.get(studentId)
      record(issues.studentMultiAllocated, {
        rollNumber: student?.rollNumber || studentId,
        count: studentAllocations.length,
        allocationIds: studentAllocations.map((allocation) => toId(allocation._id)),
      })
    }

    for (const student of students) {
      const pointer = toId(student.currentRoomAllocation)
      if (!pointer) continue
      const allocation = allocationById.get(pointer)
      if (!allocation) {
        record(issues.pointerMissingAllocation, {
          rollNumber: student.rollNumber,
          currentRoomAllocation: pointer,
        })
        continue
      }
      if (toId(allocation.studentProfileId) !== toId(student._id)) {
        record(issues.pointerWrongStudent, {
          rollNumber: student.rollNumber,
          currentRoomAllocation: pointer,
          allocationStudentProfileId: toId(allocation.studentProfileId),
        })
      }
    }

    console.log("Allocation invariant check (read-only)\n")
    console.log(`Hostels: ${hostels.length}`)
    console.log(`Rooms: ${rooms.length}`)
    console.log(`Allocations: ${allocations.length}`)
    console.log(`Students involved: ${students.length}\n`)

    printIssue("Day scholars still allocated", issues.dayScholarAllocated, (s) =>
      `${s.rollNumber}  ${s.room}  bed ${s.bedNumber}`)
    printIssue("Non-Active students still allocated", issues.nonActiveAllocated, (s) =>
      `${s.rollNumber}  status=${s.status}  ${s.room}  bed ${s.bedNumber}`)
    printIssue("Allocations with missing student profile", issues.missingStudent, (s) =>
      `${s.allocationId}  student=${s.studentId || "(none)"}  ${s.room}  bed ${s.bedNumber}`)
    printIssue("Allocations with missing room", issues.missingRoom, (s) =>
      `${s.allocationId}  roll=${s.rollNumber || "?"}  roomId=${s.roomId}`)
    printIssue("Allocations on non-Active rooms", issues.inactiveRoomOccupied, (s) =>
      `${s.rollNumber || "?"}  ${s.room}  status=${s.status}  bed ${s.bedNumber}`)
    printIssue("Beds numbered above room capacity", issues.bedOutsideCapacity, (s) =>
      `${s.rollNumber || "?"}  ${s.room}  bed ${s.bedNumber}  capacity ${s.capacity}`)
    printIssue("Invalid bed numbers (not a positive integer)", issues.invalidBedNumber, (s) =>
      `${s.rollNumber || "?"}  ${s.room}  bed=${JSON.stringify(s.bedNumber)}`)
    printIssue("Rooms over capacity", issues.overCapacity, (s) =>
      `${s.room}  ${s.allocationCount}/${s.capacity} allocated  occupancy=${s.occupancy}  status=${s.status}`)
    printIssue("Room.occupancy != allocation count", issues.occupancyDrift, (s) =>
      `${s.room}  occupancy=${s.occupancy}  allocations=${s.allocationCount}  capacity=${s.capacity}`)
    printIssue("Duplicate bed occupants", issues.duplicateBeds, (s) =>
      `${s.room}  bed ${s.bedNumber}  x${s.count}`)
    printIssue("Students with more than one allocation", issues.studentMultiAllocated, (s) =>
      `${s.rollNumber}  x${s.count}`)
    printIssue("Profile pointer to missing allocation", issues.pointerMissingAllocation, (s) =>
      `${s.rollNumber}  currentRoomAllocation=${s.currentRoomAllocation}`)
    printIssue("Profile pointer to another student's allocation", issues.pointerWrongStudent, (s) =>
      `${s.rollNumber}  points to ${s.currentRoomAllocation}`)
    printIssue("Allocation not reflected on student profile", issues.allocationPointerMismatch, (s) =>
      `${s.rollNumber}  allocation=${s.allocationId}  profilePointer=${s.profilePointer}`)
    printIssue("Allocation.userId != student.userId", issues.userIdMismatch, (s) =>
      `${s.rollNumber}  allocationUser=${s.allocationUserId}  profileUser=${s.profileUserId}`)
    printIssue("Allocation.hostelId != room.hostelId", issues.hostelMismatch, (s) =>
      `${s.rollNumber || "?"}  ${s.room}`)
    printIssue("Allocation.unitId != room.unitId", issues.unitMismatch, (s) =>
      `${s.rollNumber || "?"}  ${s.room}  allocUnit=${s.allocationUnitId}  roomUnit=${s.roomUnitId}`)

    const totalIssues = Object.values(issues).reduce((sum, issue) => sum + issue.count, 0)
    console.log(`\nTotal findings: ${totalIssues}`)
    console.log("Read-only inspection complete. No documents were modified.")

    if (totalIssues > 0) process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("Allocation invariant check failed:", error)
  mongoose.disconnect().finally(() => process.exit(1))
})
