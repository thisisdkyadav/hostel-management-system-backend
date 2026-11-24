/**
 * App usage: students' browsers report visits (ping), admins read who has the
 * installed SMS app, on which platform, and which browsers the rest use.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createStudentProfile } from "../../helpers/seed/students.js"
import { AppDevice } from "../../../src/models/index.js"

const BASE = "/api/v1/app-usage"
const tag = `AU${Date.now().toString(36).slice(-5)}`.toUpperCase()
let seq = 0

beforeAll(setupTestDb)
afterAll(teardownTestDb)

const makeStudent = async () => {
  const user = await seed.student({ name: `App Student ${++seq}` })
  await createStudentProfile({ userId: user._id, rollNumber: `${tag}${seq}` })
  return { user, api: await as(user) }
}
const ping = (api, body) => api.post(`${BASE}/ping`).send({ layout: "phone", ...body })
const stats = async () => (await (await as(await seed.admin())).get(`${BASE}/stats`)).body.data

describe("app usage", () => {
  it("counts students with the app by platform, and browsers of those without", async () => {
    const before = await stats()

    const iphone = await makeStudent() // Safari, then the home-screen app (its own device id)
    expect((await ping(iphone.api, { deviceId: `${tag}-ios-tab`, platform: "ios", browser: "safari", mode: "browser" })).status).toBe(200)
    await ping(iphone.api, { deviceId: `${tag}-ios-app`, platform: "ios", browser: "safari", mode: "app" })

    const android = await makeStudent() // same device id moves from tab to app
    await ping(android.api, { deviceId: `${tag}-and-1`, platform: "android", browser: "chrome", mode: "browser" })
    await ping(android.api, { deviceId: `${tag}-and-1`, platform: "android", browser: "chrome", mode: "app" })
    await ping(android.api, { deviceId: `${tag}-and-1`, platform: "android", browser: "chrome", mode: "browser" })

    const hinted = await makeStudent() // Chrome says installed, never opened in our count yet
    await ping(hinted.api, { deviceId: `${tag}-and-2`, platform: "android", browser: "chrome", mode: "browser", installedHint: true })

    const edge = await makeStudent() // Edge only: no app
    await ping(edge.api, { deviceId: `${tag}-and-3`, platform: "android", browser: "edge", mode: "browser" })

    const after = await stats()
    expect(after.installed.total - before.installed.total).toBe(3)
    expect(after.installed.ios - before.installed.ios).toBe(1)
    expect(after.installed.android - before.installed.android).toBe(2)
    expect(after.installed.activeTotal - before.installed.activeTotal).toBe(2) // hinted never opened it
    expect(after.seen.total - before.seen.total).toBe(4)
    expect((after.withoutApp.android.edge || 0) - (before.withoutApp.android.edge || 0)).toBe(1)
    expect(after.trend.at(-1).count - before.trend.at(-1).count).toBe(2)
    expect(after.recent[0]).toMatchObject({ platform: "android", browser: "edge", hasApp: false })
    expect(after.recent[0].rollNumber).toMatch(new RegExp(`^${tag}`))

    const row = await AppDevice.findOne({ userId: android.user._id, deviceId: `${tag}-and-1` }).lean()
    expect(row).toMatchObject({ visits: 3, mode: "browser", layout: "phone" })
    expect(row.firstAppAt).toBeTruthy()
    expect(row.lastAppAt).toBeTruthy()
  })

  it("rejects bad pings, non-students and non-admins", async () => {
    const { api } = await makeStudent()
    expect((await ping(api, { deviceId: "x", platform: "ios", mode: "app" })).status).toBe(400)
    expect((await ping(api, { deviceId: `${tag}-bad-plat`, platform: "windows", mode: "app" })).status).toBe(400)
    expect((await (await as(await seed.admin())).post(`${BASE}/ping`).send({ deviceId: `${tag}-adm`, platform: "ios", mode: "app" })).status).toBe(403)
    expect((await api.get(`${BASE}/stats`)).status).toBe(403)
  })
})
