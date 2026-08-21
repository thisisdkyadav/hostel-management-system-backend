/**
 * Session fabrication.
 *
 * Primary authentication lives in the Go backend; the Express app only reads
 * `req.session.userId` / `req.session.userData`. So instead of a login flow,
 * tests write a session document straight into the Redis session store and
 * send the correctly-signed connect.sid cookie. This exercises the exact same
 * code path a real logged-in request takes (express-session -> store.get ->
 * authenticate middleware).
 */
import crypto from "node:crypto"
import Redis from "ioredis"

const getEnv = async () => {
  const { env } = await import("../../src/config/env.config.js")
  return env
}

// Mirrors the `signature.sign` format express-session/cookie-signature use:
//   cookie value = "s:" + sid + "." + base64url(hmac-sha256(sid, secret))
function signSessionId(sid, secret) {
  const sig = crypto.createHmac("sha256", secret).update(sid).digest("base64").replace(/=+$/, "")
  return `s:${sid}.${sig}`
}

/**
 * Build the session payload exactly like auth.middleware.js caches it, using
 * the backend's own authz builder so route guards behave identically.
 */
async function buildUserData(user) {
  const { buildEffectiveAuthzForUser } = await import("../../src/core/authz/index.js")
  const override = user?.authz?.override ?? {}
  return {
    _id: user._id,
    email: user.email,
    role: user.role,
    subRole: user.subRole ?? null,
    authz: {
      override,
      effective: buildEffectiveAuthzForUser({
        role: user.role,
        subRole: user.subRole ?? null,
        authz: { override },
      }),
    },
    hostel: null,
    pinnedTabs: [],
  }
}

/**
 * Create a real session in Redis for `user` and return the Cookie header value.
 * - `extra`: merged into the raw session document (rarely needed).
 * - `userDataOverrides`: merged into req.session.userData — used to simulate
 *   derived fields the Go login would set, e.g. `hostel` for hostel-scoped
 *   staff roles ({ _id, name, type } or null).
 */
export async function createSessionCookie(user, extra = {}, userDataOverrides = {}) {
  const env = await getEnv()
  const sid = crypto.randomBytes(24).toString("hex")
  const userData = { ...(await buildUserData(user)), ...userDataOverrides }

  const redis = new Redis(env.REDIS_URL)
  try {
    await redis.set(
      `${env.REDIS_SESSION_PREFIX}${sid}`,
      // `cookie` is required by express-session's store.createSession.
      JSON.stringify({
        userId: String(user._id),
        userData,
        cookie: { originalMaxAge: null, expires: null, httpOnly: true, path: "/" },
        ...extra,
      }),
      "EX",
      60 * 60
    )
  } finally {
    redis.disconnect()
  }

  return `connect.sid=${signSessionId(sid, env.SESSION_SECRET)}`
}
