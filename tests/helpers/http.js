/**
 * HTTP helpers — thin wrappers over supertest against the real Express app.
 *
 * Usage:
 *   const student = await seed.student()
 *   const api = await as(student)
 *   const res = await api.get("/api/v1/whatever").send({}).query({})
 */
import request from "supertest"

let testApp = null

/** Lazily build (once) and return the fully-configured Express app. */
export async function getApp() {
  if (!testApp) {
    const { createApp } = await import("../../src/app.js")
    testApp = createApp().app
  }
  return testApp
}

function bindMethods(agent, cookie) {
  const withCookie = (fn) => (url) => {
    const req = fn(url)
    return cookie ? req.set("Cookie", cookie) : req
  }
  return {
    raw: agent,
    get: withCookie((u) => agent.get(u)),
    post: withCookie((u) => agent.post(u)),
    put: withCookie((u) => agent.put(u)),
    patch: withCookie((u) => agent.patch(u)),
    delete: withCookie((u) => agent.delete(u)),
    cookie,
  }
}

/**
 * An API client authenticated as `user` (fabricated session).
 * `opts.userData` overrides session userData fields (e.g. hostel for staff).
 */
export async function as(user, opts = {}) {
  const [{ createSessionCookie }, app] = await Promise.all([
    import("./session.js"),
    getApp(),
  ])
  const cookie = await createSessionCookie(user, {}, opts.userData ?? {})
  return bindMethods(request(app), cookie)
}

/** An unauthenticated API client. */
export async function anon() {
  const app = await getApp()
  return bindMethods(request(app), null)
}
