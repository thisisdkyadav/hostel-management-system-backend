import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createHostel, createStudentProfile } from "../../helpers/seed/operations.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// Error wire shape: { message }. Success: raw service data via res.json(result.data).

const admin = () => seed.admin()
const supervisor = () => seed.createUser({ role: "Hostel Supervisor" })

async function itemType(name, totalCount = 100) {
  const api = await as(await admin())
  const res = await api.post("/api/v1/inventory/types").send({ name, totalCount })
  expect(res.status).toBe(201)
  return res.body
}

// ---------------------------------------------------------------------------

describe("inventory item types", () => {
  it("401 unauthenticated; students/wardens 403 on Admin-only type management", async () => {
    const anonApi = await anon()
    expect((await anonApi.get("/api/v1/inventory/types")).status).toBe(401)

    const studentApi = await as(await seed.student())
    expect((await studentApi.get("/api/v1/inventory/types")).status).toBe(403)

    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.get("/api/v1/inventory/types")).status).toBe(403)
    expect((await wardenApi.post("/api/v1/inventory/types").send({ name: "X" })).status).toBe(403)
  })

  it("create -> list -> get -> update -> count round-trip; duplicates conflict", async () => {
    const api = await as(await admin())

    // missing name
    let res = await api.post("/api/v1/inventory/types").send({ totalCount: 10 })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/name is required/i)

    const created = await itemType("Chair", 50)
    expect(created.name).toBe("Chair")
    expect(created.totalCount).toBe(50)

    // duplicate name -> 409
    res = await api.post("/api/v1/inventory/types").send({ name: "Chair", totalCount: 5 })
    expect(res.status).toBe(409)

    res = await api.get("/api/v1/inventory/types")
    expect(res.status).toBe(200)
    expect(res.body.data.map((t) => t.name)).toContain("Chair")

    res = await api.get(`/api/v1/inventory/types/${created._id}`)
    expect(res.status).toBe(200)

    res = await api.put(`/api/v1/inventory/types/${created._id}`).send({ name: "Renovated Chair" })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("Renovated Chair")

    res = await api.patch(`/api/v1/inventory/types/${created._id}/count`).send({ totalCount: 60 })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(60)

    // count validation
    res = await api.patch(`/api/v1/inventory/types/${created._id}/count`).send({})
    expect(res.status).toBe(400)

    // unknown id
    const { Types } = await import("mongoose")
    res = await api.get(`/api/v1/inventory/types/${new Types.ObjectId().toString()}`)
    expect(res.status).toBe(404)
  })

  it("delete is blocked while assigned to hostels or students", async () => {
    const api = await as(await admin())
    const hostel = await createHostel()
    const type = await itemType("Blocked Table", 10)

    await api.post("/api/v1/inventory/hostel").send({
      hostelId: hostel._id,
      itemTypeId: type._id,
      allocatedCount: 5,
    })

    let res = await api.delete(`/api/v1/inventory/types/${type._id}`)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/assigned to hostels/i)

    // remove the hostel allocation first, then delete works
    const list = await api.get(`/api/v1/inventory/hostel?hostelId=${hostel._id}`)
    const row = list.body.data.find((i) => String(i.itemTypeId._id ?? i.itemTypeId) === String(type._id))
    expect(row).toBeTruthy()
    const rowId = row._id ?? row.id
    await api.delete(`/api/v1/inventory/hostel/item/${rowId}`)

    res = await api.delete(`/api/v1/inventory/types/${type._id}`)
    expect(res.status).toBe(200)
  })
})

describe("hostel inventory", () => {
  it("assignment validates existence, positive counts, and the global pool", async () => {
    const api = await as(await admin())
    const hostel = await createHostel()
    const type = await itemType("Bunk Bed", 10)

    // missing fields
    let res = await api.post("/api/v1/inventory/hostel").send({})
    expect(res.status).toBe(400)

    // over-allocation beyond the global pool
    res = await api.post("/api/v1/inventory/hostel").send({
      hostelId: hostel._id,
      itemTypeId: type._id,
      allocatedCount: 999,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/only 10 available globally/i)

    // happy path
    res = await api.post("/api/v1/inventory/hostel").send({
      hostelId: hostel._id,
      itemTypeId: type._id,
      allocatedCount: 6,
    })
    expect(res.status).toBe(201)
    expect(res.body.allocatedCount).toBe(6)
    expect(res.body.availableCount).toBe(6)

    // SUSPECTED BUG (documented): a duplicate hostel+type assignment silently
    // OVERWRITES the existing record instead of conflicting
    res = await api.post("/api/v1/inventory/hostel").send({
      hostelId: hostel._id,
      itemTypeId: type._id,
      allocatedCount: 2,
    })
    expect(res.status).toBe(201)
    expect(res.body._id).toBeDefined()
    expect(res.body.allocatedCount).toBe(2)

    const list = await api.get("/api/v1/inventory/hostel")
    expect(list.status).toBe(200)
    const row = list.body.data.find(
      (i) => String(i.itemTypeId._id ?? i.itemTypeId) === String(type._id)
    )
    expect(row).toBeTruthy()
    return row
  })

  it("update and delete respect items already issued to students", async () => {
    const api = await as(await admin())
    const hostel = await createHostel()
    const type = await itemType("Study Lamp", 20)
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })

    await api.post("/api/v1/inventory/hostel").send({
      hostelId: hostel._id,
      itemTypeId: type._id,
      allocatedCount: 10,
    })
    const list = await as(await admin()).then((a) => a.get(`/api/v1/inventory/hostel?hostelId=${hostel._id}`))
    const row = list.body.data.find(
      (i) => String(i.itemTypeId._id ?? i.itemTypeId) === String(type._id)
    )
    const rowId = row._id ?? row.id

    // issue 3 to a student
    const issued = await api.post("/api/v1/inventory/student").send({
      studentProfileId: profile._id,
      hostelInventoryId: rowId,
      itemTypeId: type._id,
      count: 3,
    })
    expect(issued.status).toBe(201)

    // reducing below in-use count refused
    let res = await api.put(`/api/v1/inventory/hostel/item/${rowId}`).send({ allocatedCount: 2 })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/below 3/i)

    // deleting while in use refused
    res = await api.delete(`/api/v1/inventory/hostel/item/${rowId}`)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/currently assigned/i)

    // raising the allocation is fine
    res = await api.put(`/api/v1/inventory/hostel/item/${rowId}`).send({ allocatedCount: 15 })
    expect(res.status).toBe(200)
    expect(res.body.allocatedCount).toBe(15)

    // summary endpoint answers
    res = await api.get("/api/v1/inventory/hostel/summary")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe("student inventory", () => {
  async function issuedRow() {
    const api = await as(await admin())
    const hostel = await createHostel()
    const type = await itemType(`Mattress ${Date.now() % 100000}`, 30)
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    await api.post("/api/v1/inventory/hostel").send({
      hostelId: hostel._id,
      itemTypeId: type._id,
      allocatedCount: 10,
    })
    const list = await api.get(`/api/v1/inventory/hostel?hostelId=${hostel._id}`)
    const row = list.body.data.find(
      (i) => String(i.itemTypeId._id ?? i.itemTypeId) === String(type._id)
    )
    return { api, hostel, type, student, profile, hostelInventoryId: row._id ?? row.id }
  }

  it("assign validates profile, inventory record, type match, and availability", async () => {
    const api = await as(await admin())

    // missing fields
    let res = await api.post("/api/v1/inventory/student").send({})
    expect(res.status).toBe(400)

    // unknown student
    const { Types } = await import("mongoose")
    res = await api.post("/api/v1/inventory/student").send({
      studentProfileId: new Types.ObjectId().toString(),
      hostelInventoryId: new Types.ObjectId().toString(),
      itemTypeId: new Types.ObjectId().toString(),
      count: 1,
    })
    expect(res.status).toBe(404)

    const { profile, hostelInventoryId, type } = await issuedRow()

    // type mismatch
    const otherType = await itemType(`Mismatch ${Date.now() % 100000}`, 5)
    res = await api.post("/api/v1/inventory/student").send({
      studentProfileId: profile._id,
      hostelInventoryId,
      itemTypeId: otherType._id,
      count: 1,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/does not match/i)

    // zero/negative/non-numeric counts are rejected instead of coerced
    res = await api.post("/api/v1/inventory/student").send({
      studentProfileId: profile._id,
      hostelInventoryId,
      itemTypeId: type._id,
      count: 0,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/positive number/i)

    // happy path
    res = await api.post("/api/v1/inventory/student").send({
      studentProfileId: profile._id,
      hostelInventoryId,
      itemTypeId: type._id,
      count: 4,
    })
    expect(res.status).toBe(201)
    expect(res.body.count).toBe(4)
    expect(res.body.status).toBe("Issued")

    // per-student listing
    const studentList = await api.get(`/api/v1/inventory/student/${profile._id}`)
    expect(studentList.status).toBe(200)
    expect(studentList.body.length).toBeGreaterThanOrEqual(1)

    // global listing + summaries
    expect((await api.get("/api/v1/inventory/student")).status).toBe(200)
    expect((await api.get("/api/v1/inventory/student/summary/student")).status).toBe(200)
    expect((await api.get("/api/v1/inventory/student/summary/item")).status).toBe(200)
  })

  it("warden-level roles can assign and return student inventory", async () => {
    const sup = await supervisor()
    const { profile, hostelInventoryId, type, api: adminApi } = await issuedRow()

    const supApi = await as(sup)
    const res = await supApi.post("/api/v1/inventory/student").send({
      studentProfileId: profile._id,
      hostelInventoryId,
      itemTypeId: type._id,
      count: 1,
    })
    expect(res.status).toBe(201)
    const issueId = res.body._id

    // status update on an active issue (service requires condition alongside status)
    let upd = await supApi
      .put(`/api/v1/inventory/student/${issueId}/status`)
      .send({ status: "Damaged" })
    expect(upd.status).toBe(400)
    upd = await supApi
      .put(`/api/v1/inventory/student/${issueId}/status`)
      .send({ status: "Damaged", condition: "Poor" })
    expect(upd.status).toBe(200)
    expect(upd.body.status).toBe("Damaged")

    // invalid status / condition values
    upd = await supApi
      .put(`/api/v1/inventory/student/${issueId}/status`)
      .send({ status: "Exploded", condition: "Good" })
    expect(upd.status).toBe(400)
    upd = await supApi
      .put(`/api/v1/inventory/student/${issueId}/status`)
      .send({ condition: "Meh" })
    expect(upd.status).toBe(400)

    // return flow
    let ret = await supApi.put(`/api/v1/inventory/student/${issueId}/return`).send({ notes: "Checked back in" })
    expect(ret.status).toBe(200)
    expect(ret.body.status).toBe("Returned")
    expect(ret.body.returnDate).toBeTruthy()

    // double return refused
    ret = await supApi.put(`/api/v1/inventory/student/${issueId}/return`).send({})
    expect(ret.status).toBe(400)
    expect(ret.body.message).toMatch(/already been returned/i)

    // status updates on returned items refused
    upd = await supApi.put(`/api/v1/inventory/student/${issueId}/status`).send({ status: "Lost" })
    expect(upd.status).toBe(400)
    void adminApi
  })
})

describe("inventory — hardening edges", () => {
  async function stockedRow(totalCount, allocatedCount) {
    const api = await as(await admin())
    const hostel = await createHostel()
    const type = await itemType(`Stock ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, totalCount)
    await api.post("/api/v1/inventory/hostel").send({
      hostelId: hostel._id,
      itemTypeId: type._id,
      allocatedCount,
    })
    const list = await api.get(`/api/v1/inventory/hostel?hostelId=${hostel._id}`)
    const row = list.body.data.find((i) => String(i.itemTypeId._id ?? i.itemTypeId) === String(type._id))
    return { api, hostel, type, row, rowId: row._id ?? row.id }
  }

  it("rapid double-issue cannot oversell: exactly one of two racing issues succeeds", async () => {
    const { api, type, rowId } = await stockedRow(4, 4)
    const mkStudent = async () => {
      const student = await seed.student()
      return createStudentProfile({ userId: student._id }).then((profile) => ({ student, profile }))
    }
    const a = await mkStudent()
    const b = await mkStudent()

    const issue = (who) =>
      api.post("/api/v1/inventory/student").send({
        studentProfileId: who.profile._id,
        hostelInventoryId: rowId,
        itemTypeId: type._id,
        count: 3,
      })

    // fire both at once against the last 4 units (each wants 3)
    const [ra, rb] = await Promise.all([issue(a), issue(b)])
    const statuses = [ra.status, rb.status].sort()
    // the guarded atomic reserve lets at most one issue through
    expect(statuses).toEqual([201, 400])
    expect((ra.status === 400 ? ra : rb).body.message).toMatch(/not enough items available/i)

    // exactly one issue record exists across both students (API-level check)
    const listA = await api.get(`/api/v1/inventory/student/${a.profile._id}`)
    const listB = await api.get(`/api/v1/inventory/student/${b.profile._id}`)
    expect(listA.body.length + listB.body.length).toBe(1)
  })

  it("sequential double-issue exceeding availability refuses with a precise message", async () => {
    const { api, type, rowId } = await stockedRow(5, 5)
    const student = await seed.student()
    const profileA = await createStudentProfile({ userId: student._id })
    const student2 = await seed.student()
    const profileB = await createStudentProfile({ userId: student2._id })

    let res = await api.post("/api/v1/inventory/student").send({
      studentProfileId: profileA._id, hostelInventoryId: rowId, itemTypeId: type._id, count: 4,
    })
    expect(res.status).toBe(201)

    // second rapid issue demands more than the remaining 1
    res = await api.post("/api/v1/inventory/student").send({
      studentProfileId: profileB._id, hostelInventoryId: rowId, itemTypeId: type._id, count: 2,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Not enough items available. Only 1 items available.")

    // persisted state is consistent via the API: the refused student has nothing
    const perStudent = await api.get(`/api/v1/inventory/student/${profileB._id}`)
    expect(perStudent.body).toHaveLength(0)
  })

  it("SUSPECTED BUG: PATCH /types/:id/count allows setting totalCount below already-allocated units", async () => {
    const { api, type } = await stockedRow(10, 6)
    const student = await seed.student()

    // find the hostel inventory row for this type to confirm allocation exists
    const list = await api.get("/api/v1/inventory/hostel")
    const row = list.body.data.find((i) => String(i.itemTypeId._id ?? i.itemTypeId) === String(type._id))
    expect(Number(row.allocatedCount)).toBeGreaterThanOrEqual(6)

    // shrink the global pool far below what is already allocated -> accepted
    const res = await api.patch(`/api/v1/inventory/types/${type._id}/count`).send({ totalCount: 2 })
    // The service never reconciles totalCount against allocations, so inventory
    // math (available vs allocated) becomes negative-capacity nonsense.
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(2)

    // a later hostel re-allocation attempt is refused by the pool check, but the
    // corrupted state persists
    const other = await createHostel()
    const over = await api.post("/api/v1/inventory/hostel").send({
      hostelId: other._id,
      itemTypeId: type._id,
      allocatedCount: 3,
    })
    expect(over.status).toBe(400)
    void student
  })

  it("summaries are empty arrays for a hostel scope with no records and populated after issuing", async () => {
    const emptyHostel = await createHostel()
    const api = await as(await admin())

    let res = await api.get(`/api/v1/inventory/student/summary/student?hostelId=${emptyHostel._id}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(0)

    res = await api.get(`/api/v1/inventory/student/summary/item?hostelId=${emptyHostel._id}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)

    // populate: type -> hostel allocation -> student issue
    const type = await itemType(`Summary ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, 8)
    await api.post("/api/v1/inventory/hostel").send({
      hostelId: emptyHostel._id, itemTypeId: type._id, allocatedCount: 5,
    })
    const list = await api.get(`/api/v1/inventory/hostel?hostelId=${emptyHostel._id}`)
    const row = list.body.data.find((i) => String(i.itemTypeId._id ?? i.itemTypeId) === String(type._id))
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    const issued = await api.post("/api/v1/inventory/student").send({
      studentProfileId: profile._id,
      hostelInventoryId: row._id ?? row.id,
      itemTypeId: type._id,
      count: 2,
    })
    expect(issued.status).toBe(201)

    const byStudent = await api.get(`/api/v1/inventory/student/summary/student?hostelId=${emptyHostel._id}`)
    expect(byStudent.body).toHaveLength(1)
    expect(byStudent.body[0]).toMatchObject({ rollNumber: profile.rollNumber, totalItems: 2 })

    const byItem = await api.get(`/api/v1/inventory/student/summary/item?hostelId=${emptyHostel._id}`)
    expect(byItem.body).toHaveLength(1)
    expect(byItem.body[0]).toMatchObject({ itemName: type.name, totalAssigned: 2, studentCount: 1 })
  })

  it("SUSPECTED BUG: item-type name uniqueness is case-sensitive, so near-duplicates can be created", async () => {
    const api = await as(await admin())
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

    const created = await itemType(`Water Can ${suffix}`, 10)

    // same name in different case passes the exact-match duplicate check
    let res = await api.post("/api/v1/inventory/types").send({ name: `water can ${suffix}`, totalCount: 5 })
    expect(res.status).toBe(201)

    // renaming an existing type to an existing name with different case also
    // slips through both the guard and the (case-sensitive) unique index
    res = await api.put(`/api/v1/inventory/types/${created._id}`).send({ name: `WATER CAN ${suffix}` })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe(`WATER CAN ${suffix}`)
  })
})
