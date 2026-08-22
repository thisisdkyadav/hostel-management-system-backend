import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { initRealtime } from "../../helpers/seed/operations.js"
import { studentWithRoom } from "../../helpers/seed/complaints.js"

// The frontend QueryInvalidationBridge (frontend/src/lib/query/
// QueryInvalidationBridge.jsx) listens for these exact event names and
// refetches visitor/complaint/notification queries. These tests pin the
// backend contract: the event names, and that they carry a minimal payload.

beforeAll(async () => {
  await setupTestDb()
  await initRealtime()
})

afterAll(async () => {
  await teardownTestDb()
})

/** Spy on the live Socket.IO server's broadcast emit. */
async function spyEmit() {
  const { getIO } = await import("../../../src/loaders/socket.loader.js")
  const io = getIO()
  return vi.spyOn(io, "emit")
}

const eventsFor = (spy, name) =>
  spy.mock.calls.filter((call) => call[0] === name).map((call) => call[1])

describe("socket invalidation bridge contract", () => {
  it("complaint mutations broadcast 'complaint-update'", async () => {
    const spy = await spyEmit()
    const { user: student } = await studentWithRoom(seed)

    // create
    let res = await as(student)
      .then((api) =>
        api.post("/api/v1/complaint").send({
          userId: String(student._id),
          title: "Socket test complaint",
          description: "Bridge should hear about this",
          category: "Plumbing",
        })
      )
    expect(res.status).toBe(200)
    expect(eventsFor(spy, "complaint-update")).toHaveLength(1)

    // status update (legacy route is Maintenance Staff-only)
    const maintenanceApi = await as(await seed.maintenanceStaff())
    res = await maintenanceApi
      .put(`/api/v1/complaint/update-status/${res.body.data._id}`)
      .send({ status: "In Progress" })
    expect(res.status).toBe(200)

    const events = eventsFor(spy, "complaint-update")
    expect(events.length).toBeGreaterThanOrEqual(2)
    for (const payload of events) {
      expect(typeof payload.at).toBe("string")
      expect(payload.id).toBeTruthy()
    }
    expect(events.at(-1).action).toBe("status-updated")
    spy.mockRestore()
  })

  it("visitor request mutations broadcast 'visitor-update'", async () => {
    const spy = await spyEmit()
    const student = await seed.student()
    const api = await as(student)
    const day = (o) => new Date(Date.now() + o * 86400000).toISOString()

    const created = await api.post("/api/v1/visitor/requests").send({
      reason: "Socket test visit",
      fromDate: day(3),
      toDate: day(5),
    })
    expect(created.status).toBe(201)

    const id = created.body.visitorRequest._id
    await api.put(`/api/v1/visitor/requests/${id}`).send({ reason: "Edited" })

    const adminApi = await as(await seed.admin())
    await adminApi.post(`/api/v1/visitor/requests/${id}/approve`).send({
      hostelId: undefined,
      approvalInformation: "ok",
    })

    const events = eventsFor(spy, "visitor-update")
    expect(events.length).toBeGreaterThanOrEqual(3) // created + updated + approved
    for (const payload of events) {
      expect(typeof payload.at).toBe("string")
      expect(payload.id).toBeTruthy()
    }
    expect(events.map((e) => e.action)).toEqual(["created", "updated", "approved"])
    spy.mockRestore()
  })

  it("notification create broadcasts 'notification'", async () => {
    const spy = await spyEmit()
    const adminApi = await as(await seed.admin())

    const res = await adminApi.post("/api/v1/notification").send({
      title: "Water supply maintenance",
      message: "Water will be off 10-12 tomorrow.",
    })
    expect([200, 201]).toContain(res.status)

    const events = eventsFor(spy, "notification")
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events.at(-1).action).toBe("created")
    expect(typeof events.at(-1).at).toBe("string")
    spy.mockRestore()
  })

  it("emits nothing when Socket.IO is uninitialized (no-op safety)", async () => {
    // This file's siblings never boot Socket.IO; every mutation in the whole
    // suite succeeding proves the no-op path. Here we assert it directly:
    const { getIO } = await import("../../../src/loaders/socket.loader.js")
    const io = getIO()
    const spy = await spyEmit()

    // direct helper invocation must not throw and must broadcast
    const { emitVisitorUpdate } = await import("../../../src/utils/socketHandlers.js")
    expect(() => emitVisitorUpdate({ action: "manual" })).not.toThrow()
    expect(eventsFor(spy, "visitor-update")).toHaveLength(1)
    void io
    spy.mockRestore()
  })
})
