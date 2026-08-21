import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

const BASE = "/api/v1/tasks"

let admin, superAdmin, student, warden, assignee

beforeAll(async () => {
  await setupTestDb()
  admin = await seed.admin()
  superAdmin = await seed.superAdmin()
  student = await seed.student()
  warden = await seed.warden()
  assignee = await seed.maintenanceStaff()
})

afterAll(async () => {
  await teardownTestDb()
})

const validTask = () => ({
  title: `Task ${Date.now()}`,
  description: "Integration-test task",
  dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
})

describe("POST /api/v1/tasks (Admin/Super Admin only)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(BASE).send(validTask())
    expect(res.status).toBe(401)
  })

  it("403 for Student and Warden", async () => {
    for (const user of [student, warden]) {
      const api = await as(user)
      const res = await api.post(BASE).send(validTask())
      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
    }
  })

  it("400 when title/description/dueDate are missing", async () => {
    const api = await as(admin)
    const res = await api.post(BASE).send({ title: "Only a title" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Title, description, and due date are required")
  })

  it("400 when any assigned user does not exist", async () => {
    const api = await as(admin)
    const res = await api
      .post(BASE)
      .send({ ...validTask(), assignedUsers: [new mongoose.Types.ObjectId().toString()] })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("One or more assigned users do not exist")
  })

  it("201 creates an unassigned task with defaults", async () => {
    const api = await as(admin)
    const res = await api.post(BASE).send(validTask())
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.task.title).toBeDefined()
    expect(res.body.task.priority).toBe("Medium")
    expect(res.body.task.category).toBe("Other")
    expect(res.body.task.status).toBe("Created")
    expect(String(res.body.task.createdBy)).toBe(String(admin._id))
  })

  it("201 works for Super Admin and flips status to Assigned when users are attached", async () => {
    const api = await as(superAdmin)
    const res = await api.post(BASE).send({ ...validTask(), assignedUsers: [String(assignee._id)] })
    expect(res.status).toBe(201)
    expect(res.body.task.status).toBe("Assigned")
    expect(res.body.task.assignedUsers.map(String)).toContain(String(assignee._id))
  })
})

describe("GET /api/v1/tasks/all (Admin/Super Admin only)", () => {
  beforeAll(async () => {
    const api = await as(admin)
    // 3 tasks total across statuses/priorities
    await api.post(BASE).send(validTask())
    await api.post(BASE).send({ ...validTask(), priority: "High", category: "Maintenance" })
    await api.post(BASE).send({ ...validTask(), priority: "Low" })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    const api = await as(warden)
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(403)
  })

  it("200 returns paginated tasks with populated refs", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ limit: 2, page: 1 })
    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(2)
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(3)
    expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(2)
    expect(res.body.pagination.currentPage).toBe(1)
    expect(res.body.pagination.hasNextPage).toBe(true)
    expect(res.body.pagination.hasPrevPage).toBe(false)
    expect(res.body.tasks[0].createdBy.email).toBeDefined()
  })

  it("filters by priority and category", async () => {
    const api = await as(admin)
    const byPriority = await api.get(`${BASE}/all`).query({ priority: "High" })
    expect(byPriority.body.tasks.every((t) => t.priority === "High")).toBe(true)

    const byCategory = await api.get(`${BASE}/all`).query({ category: "Maintenance" })
    expect(byCategory.body.tasks.every((t) => t.category === "Maintenance")).toBe(true)
  })

  it("400 for invalid pagination parameters", async () => {
    const api = await as(admin)
    for (const q of [{ page: 0 }, { limit: -1 }, { limit: "abc" }]) {
      const res = await api.get(`${BASE}/all`).query(q)
      expect(res.status).toBe(400)
      expect(res.body.message).toBe("Invalid pagination parameters")
    }
  })
})

describe("GET /api/v1/tasks/my-tasks", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/my-tasks`)
    expect(res.status).toBe(401)
  })

  it("200 returns only tasks assigned to the caller", async () => {
    const api = await as(assignee)
    const res = await api.get(`${BASE}/my-tasks`)
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(1)
    expect(res.body.tasks.every((t) => t.assignedUsers.some((u) => String(u._id) === String(assignee._id)))).toBe(true)
  })

  it("403 for roles without a route mapping (guardMy is deny-by-default)", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/my-tasks`)
    expect(res.status).toBe(403)
  })

  it("filters by status", async () => {
    const api = await as(assignee)
    const res = await api.get(`${BASE}/my-tasks`).query({ status: "Assigned" })
    expect(res.status).toBe(200)
    expect(res.body.tasks.every((t) => t.status === "Assigned")).toBe(true)
  })
})

describe("PUT /api/v1/tasks/:id/status", () => {
  let task

  beforeAll(async () => {
    const api = await as(admin)
    const res = await api.post(BASE).send({ ...validTask(), assignedUsers: [String(assignee._id)] })
    task = res.body.task
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${task._id}/status`).send({ status: "In Progress" })
    expect(res.status).toBe(401)
  })

  it("400 for an invalid status value", async () => {
    const api = await as(assignee)
    const res = await api.put(`${BASE}/${task._id}/status`).send({ status: "Done" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid status value")
  })

  it("400 for a malformed task id (CastError)", async () => {
    const api = await as(assignee)
    const res = await api.put(`${BASE}/not-an-id/status`).send({ status: "In Progress" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("404 for an unknown but well-formed id", async () => {
    const api = await as(assignee)
    const res = await api.put(`${BASE}/${new mongoose.Types.ObjectId()}/status`).send({ status: "In Progress" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Task not found")
  })

  it("403 for an authenticated user who is neither admin nor assigned", async () => {
    const outsider = await seed.maintenanceStaff()
    const api = await as(outsider)
    const res = await api.put(`${BASE}/${task._id}/status`).send({ status: "In Progress" })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("Not authorized to update this task")
  })

  it("403 when an assigned user tries to reset status to Created/Assigned", async () => {
    const api = await as(assignee)
    for (const status of ["Created", "Assigned"]) {
      const res = await api.put(`${BASE}/${task._id}/status`).send({ status })
      expect(res.status).toBe(403)
      expect(res.body.message).toBe("Assigned users can only update status to In Progress or Completed")
    }
  })

  it("200 lets the assigned user move the task to In Progress then Completed", async () => {
    const api = await as(assignee)
    const inProgress = await api.put(`${BASE}/${task._id}/status`).send({ status: "In Progress" })
    expect(inProgress.status).toBe(200)
    expect(inProgress.body.task.status).toBe("In Progress")

    const done = await api.put(`${BASE}/${task._id}/status`).send({ status: "Completed" })
    expect(done.status).toBe(200)
    expect(done.body.task.status).toBe("Completed")
  })

  it("200 lets an admin set any status", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${task._id}/status`).send({ status: "In Progress" })
    expect(res.status).toBe(200)
    expect(res.body.task.status).toBe("In Progress")
  })
})

describe("PUT /api/v1/tasks/:id (Admin/Super Admin only)", () => {
  let task

  beforeAll(async () => {
    const api = await as(admin)
    const res = await api.post(BASE).send(validTask())
    task = res.body.task
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${task._id}`).send({ title: "x" })
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    const api = await as(assignee)
    const res = await api.put(`${BASE}/${task._id}`).send({ title: "x" })
    expect(res.status).toBe(403)
  })

  it("400 when reassigning to nonexistent users", async () => {
    const api = await as(admin)
    const res = await api
      .put(`${BASE}/${task._id}`)
      .send({ assignedUsers: [new mongoose.Types.ObjectId().toString()] })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("One or more assigned users do not exist")
  })

  it("404 for unknown id", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${new mongoose.Types.ObjectId()}`).send({ title: "x" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Task not found")
  })

  it("200 updates fields and auto-transitions Created -> Assigned on assignment", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${task._id}`).send({
      title: "Renamed task",
      priority: "Urgent",
      assignedUsers: [String(assignee._id)],
    })
    expect(res.status).toBe(200)
    expect(res.body.task.title).toBe("Renamed task")
    expect(res.body.task.priority).toBe("Urgent")
    expect(res.body.task.status).toBe("Assigned")
  })
})

describe("DELETE /api/v1/tasks/:id (Admin/Super Admin only)", () => {
  let task

  beforeAll(async () => {
    const api = await as(admin)
    const res = await api.post(BASE).send(validTask())
    task = res.body.task
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.delete(`${BASE}/${task._id}`)
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    const api = await as(student)
    const res = await api.delete(`${BASE}/${task._id}`)
    expect(res.status).toBe(403)
  })

  it("404 for unknown id", async () => {
    const api = await as(admin)
    const res = await api.delete(`${BASE}/${new mongoose.Types.ObjectId()}`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Task not found")
  })

  it("200 deletes the task and it disappears from /all", async () => {
    const api = await as(superAdmin)
    const res = await api.delete(`${BASE}/${task._id}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Task deleted successfully")

    const check = await as(admin)
    const list = await check.get(`${BASE}/all`).query({ limit: 100 })
    expect(list.body.tasks.some((t) => t._id === String(task._id))).toBe(false)
  })
})

describe("full task lifecycle through the API", () => {
  it("create -> assign -> assignee progresses -> admin edits -> delete", async () => {
    const adminApi = await as(admin)
    const workerApi = await as(assignee)

    const created = await adminApi
      .post(BASE)
      .send({ ...validTask(), priority: "High", assignedUsers: [String(assignee._id)] })
    expect(created.status).toBe(201)
    const id = created.body.task._id
    expect(created.body.task.status).toBe("Assigned")

    const mine = await workerApi.get(`${BASE}/my-tasks`)
    expect(mine.body.tasks.some((t) => t._id === id)).toBe(true)

    expect((await workerApi.put(`${BASE}/${id}/status`).send({ status: "In Progress" })).status).toBe(200)
    expect((await adminApi.put(`${BASE}/${id}`).send({ priority: "Urgent" })).body.task.priority).toBe("Urgent")
    expect((await workerApi.put(`${BASE}/${id}/status`).send({ status: "Completed" })).body.task.status).toBe(
      "Completed"
    )

    const deleted = await adminApi.delete(`${BASE}/${id}`)
    expect(deleted.status).toBe(200)
  })
})
