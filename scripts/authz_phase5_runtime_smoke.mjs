import process from "process"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, "../.env") })

const baseUrl = (process.env.AUTHZ_SMOKE_BASE_URL || "http://localhost:8000").replace(/\/+$/, "")
const expectEnforce = String(process.env.AUTHZ_SMOKE_EXPECT_ENFORCE || "false").toLowerCase() === "true"
const smokeEnabled = String(process.env.AUTHZ_SMOKE_ENABLED || "false").toLowerCase() === "true"

const operatorEmail = process.env.AUTHZ_SMOKE_OPERATOR_EMAIL || ""
const operatorPassword = process.env.AUTHZ_SMOKE_OPERATOR_PASSWORD || ""

const superAdminEmail = process.env.AUTHZ_SMOKE_SUPER_ADMIN_EMAIL || ""
const superAdminPassword = process.env.AUTHZ_SMOKE_SUPER_ADMIN_PASSWORD || ""

const gymkhanaGsEmail = process.env.AUTHZ_SMOKE_GYMKHANA_GS_EMAIL || ""
const gymkhanaGsPassword = process.env.AUTHZ_SMOKE_GYMKHANA_GS_PASSWORD || ""

const approverEmail = process.env.AUTHZ_SMOKE_APPROVER_EMAIL || ""
const approverPassword = process.env.AUTHZ_SMOKE_APPROVER_PASSWORD || ""

const wardenFamilyEmail = process.env.AUTHZ_SMOKE_WARDEN_FAMILY_EMAIL || ""
const wardenFamilyPassword = process.env.AUTHZ_SMOKE_WARDEN_FAMILY_PASSWORD || ""

const passes = []
const failures = []
const skips = []

const logPass = (message) => {
  passes.push(message)
  console.log(`PASS: ${message}`)
}

const logFail = (message) => {
  failures.push(message)
  console.error(`FAIL: ${message}`)
}

const logSkip = (message) => {
  skips.push(message)
  console.log(`SKIP: ${message}`)
}

const assertCondition = (condition, passMessage, failMessage) => {
  if (condition) {
    logPass(passMessage)
  } else {
    logFail(failMessage || passMessage)
  }
}

class SessionClient {
  constructor(name) {
    this.name = name
    this.cookieHeader = ""
  }

  _captureCookies(response) {
    const setCookieHeaders = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : [])

    if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return

    const cookiePairs = setCookieHeaders
      .map((entry) => String(entry || "").split(";")[0])
      .filter((entry) => entry.includes("="))

    if (cookiePairs.length === 0) return

    this.cookieHeader = cookiePairs.join("; ")
  }

  async request(method, path, { body, headers = {} } = {}) {
    const finalHeaders = {
      Accept: "application/json",
      ...headers,
    }

    let payload = undefined
    if (body !== undefined) {
      finalHeaders["Content-Type"] = "application/json"
      payload = JSON.stringify(body)
    }

    if (this.cookieHeader) {
      finalHeaders.Cookie = this.cookieHeader
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body: payload,
    })

    this._captureCookies(response)

    const contentType = response.headers.get("content-type") || ""
    let data = null
    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null)
    } else {
      const text = await response.text().catch(() => "")
      data = text || null
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
    }
  }
}

const ensureStatus = (result, expectedStatuses, label) => {
  if (expectedStatuses.includes(result.status)) {
    logPass(`${label} returned expected status ${result.status}`)
    return true
  }
  logFail(`${label} returned unexpected status ${result.status} (expected ${expectedStatuses.join(", ")})`)
  return false
}

const ensureAuthzDecision = (authzData, { routeKey, capabilityKey }, label) => {
  if (!authzData) {
    logFail(`${label} missing authz payload`)
    return
  }

  if (routeKey) {
    const routeDecision = authzData?.effective?.routeAccess?.[routeKey]
    assertCondition(routeDecision === false, `${label} effective route deny confirmed (${routeKey})`, `${label} effective route deny missing (${routeKey})`)
  }

  if (capabilityKey) {
    const capabilityDecision = authzData?.effective?.capabilities?.[capabilityKey]
    assertCondition(
      capabilityDecision === false,
      `${label} effective capability deny confirmed (${capabilityKey})`,
      `${label} effective capability deny missing (${capabilityKey})`
    )
  }
}

const assertEnforcementStatus = (status, label) => {
  if (expectEnforce) {
    assertCondition(status === 403, `${label} denied in enforce mode (403)`, `${label} expected 403 in enforce mode, got ${status}`)
  } else {
    assertCondition(status !== 403, `${label} not hard-denied in observe mode`, `${label} unexpectedly denied in observe mode`)
  }
}

const login = async (client, email, password) => {
  const result = await client.request("POST", "/api/v1/auth/login", {
    body: { email, password },
  })

  const ok = ensureStatus(result, [200], `${client.name} login`)
  if (!ok) return null

  const user = result.data?.user || null
  if (!user?._id) {
    logFail(`${client.name} login response missing user identity`)
    return null
  }

  logPass(`${client.name} authenticated as ${user.role}${user.subRole ? ` (${user.subRole})` : ""}`)
  return user
}

const createOperator = async () => {
  if (!operatorEmail || !operatorPassword) {
    logSkip("Operator credentials missing; runtime smoke skipped. Set AUTHZ_SMOKE_OPERATOR_EMAIL/PASSWORD.")
    return null
  }

  const operator = new SessionClient("operator")
  const operatorUser = await login(operator, operatorEmail, operatorPassword)
  if (!operatorUser) return null

  return { operator, operatorUser }
}

const findUserByEmail = async (operatorClient, email) => {
  const result = await operatorClient.request("GET", `/api/v1/users/search?query=${encodeURIComponent(email)}`)
  const ok = ensureStatus(result, [200], `find user by email (${email})`)
  if (!ok) return null

  const users = Array.isArray(result.data) ? result.data : []
  return users.find((user) => String(user?.email || "").toLowerCase() === email.toLowerCase()) || users[0] || null
}

const getUserAuthz = async (operatorClient, userId) => {
  const result = await operatorClient.request("GET", `/api/v1/authz/user/${userId}`)
  const ok = ensureStatus(result, [200], `get user authz (${userId})`)
  if (!ok) return null
  return result.data?.data?.authz || null
}

const updateUserOverride = async (operatorClient, userId, override, reason) => {
  const result = await operatorClient.request("PUT", `/api/v1/authz/user/${userId}`, {
    body: { override, reason },
  })
  return ensureStatus(result, [200], `update user authz (${userId})`)
}

const restoreOverride = async (operatorClient, userId, override, reason) => {
  const result = await operatorClient.request("PUT", `/api/v1/authz/user/${userId}`, {
    body: { override, reason },
  })
  ensureStatus(result, [200], `restore user authz (${userId})`)
}

const withOverrideBackup = async (operatorClient, targetUserId, scenarioName, runner) => {
  const current = await getUserAuthz(operatorClient, targetUserId)
  if (!current) {
    logFail(`${scenarioName} failed to capture current override backup`)
    return
  }

  const originalOverride = current.override || {
    allowRoutes: [],
    denyRoutes: [],
    allowCapabilities: [],
    denyCapabilities: [],
    constraints: [],
  }

  try {
    await runner()
  } finally {
    await restoreOverride(operatorClient, targetUserId, originalOverride, `runtime-smoke-restore:${scenarioName}`)
  }
}

const runSuperAdminScenario = async (operatorClient) => {
  if (!superAdminEmail || !superAdminPassword) {
    logSkip("Super Admin scenario skipped (AUTHZ_SMOKE_SUPER_ADMIN_EMAIL/PASSWORD not provided)")
    return
  }

  const target = await findUserByEmail(operatorClient, superAdminEmail)
  if (!target?._id) {
    logFail("Super Admin scenario could not resolve target user")
    return
  }

  await withOverrideBackup(operatorClient, target._id, "super-admin", async () => {
    const targetClient = new SessionClient("super-admin-target")
    const loggedIn = await login(targetClient, superAdminEmail, superAdminPassword)
    if (!loggedIn) return

    const dashboardAllow = await targetClient.request("GET", "/api/v1/super-admin/dashboard")
    ensureStatus(dashboardAllow, [200], "Super Admin allow check (/super-admin/dashboard)")

    const createAdminAllow = await targetClient.request("POST", "/api/v1/super-admin/admins", { body: {} })
    assertCondition(
      createAdminAllow.status !== 403,
      "Super Admin create-admin allow path not blocked by AuthZ",
      `Super Admin create-admin unexpectedly blocked (${createAdminAllow.status})`
    )

    const denyOverride = {
      allowRoutes: [],
      denyRoutes: [],
      allowCapabilities: [],
      denyCapabilities: [
        "cap.users.view",
        "cap.users.create",
        "cap.settings.system.view",
      ],
      constraints: [],
    }

    const updated = await updateUserOverride(
      operatorClient,
      target._id,
      denyOverride,
      "runtime-smoke:super-admin-deny"
    )
    if (!updated) return

    const postUpdateAuthz = await getUserAuthz(operatorClient, target._id)
    ensureAuthzDecision(postUpdateAuthz, { capabilityKey: "cap.users.view" }, "Super Admin deny scenario")

    const dashboardDeny = await targetClient.request("GET", "/api/v1/super-admin/dashboard")
    assertEnforcementStatus(dashboardDeny.status, "Super Admin dashboard deny check")

    const createAdminDeny = await targetClient.request("POST", "/api/v1/super-admin/admins", { body: {} })
    assertEnforcementStatus(createAdminDeny.status, "Super Admin create-admin deny check")
  })
}

const runGymkhanaGsScenario = async (operatorClient) => {
  if (!gymkhanaGsEmail || !gymkhanaGsPassword) {
    logSkip("Gymkhana GS scenario skipped (AUTHZ_SMOKE_GYMKHANA_GS_EMAIL/PASSWORD not provided)")
    return
  }

  const target = await findUserByEmail(operatorClient, gymkhanaGsEmail)
  if (!target?._id) {
    logFail("Gymkhana GS scenario could not resolve target user")
    return
  }

  await withOverrideBackup(operatorClient, target._id, "gymkhana-gs", async () => {
    const targetClient = new SessionClient("gymkhana-gs-target")
    const loggedIn = await login(targetClient, gymkhanaGsEmail, gymkhanaGsPassword)
    if (!loggedIn) return

    const yearsAllow = await targetClient.request("GET", "/api/v1/student-affairs/events/calendar/years")
    ensureStatus(yearsAllow, [200], "Gymkhana GS allow check (/events/calendar/years)")

    const pendingAllow = await targetClient.request("GET", "/api/v1/student-affairs/events/pending-proposals")
    ensureStatus(pendingAllow, [200], "Gymkhana GS allow check (/events/pending-proposals)")

    const denyOverride = {
      allowRoutes: [],
      denyRoutes: [],
      allowCapabilities: [],
      denyCapabilities: ["cap.events.create"],
      constraints: [],
    }

    const updated = await updateUserOverride(
      operatorClient,
      target._id,
      denyOverride,
      "runtime-smoke:gymkhana-gs-deny"
    )
    if (!updated) return

    const postUpdateAuthz = await getUserAuthz(operatorClient, target._id)
    ensureAuthzDecision(postUpdateAuthz, { capabilityKey: "cap.events.create" }, "Gymkhana GS deny scenario")

    const pendingDeny = await targetClient.request("GET", "/api/v1/student-affairs/events/pending-proposals")
    assertEnforcementStatus(pendingDeny.status, "Gymkhana GS pending-proposals deny check")
  })
}

const runApproverScenario = async (operatorClient) => {
  if (!approverEmail || !approverPassword) {
    logSkip("Approver scenario skipped (AUTHZ_SMOKE_APPROVER_EMAIL/PASSWORD not provided)")
    return
  }

  const target = await findUserByEmail(operatorClient, approverEmail)
  if (!target?._id) {
    logFail("Approver scenario could not resolve target user")
    return
  }

  await withOverrideBackup(operatorClient, target._id, "approval-chain", async () => {
    const targetClient = new SessionClient("approver-target")
    const loggedIn = await login(targetClient, approverEmail, approverPassword)
    if (!loggedIn) return

    const pendingAllow = await targetClient.request("GET", "/api/v1/student-affairs/events/proposals/pending")
    ensureStatus(pendingAllow, [200], "Approver allow check (/events/proposals/pending)")

    const denyOverride = {
      allowRoutes: [],
      denyRoutes: [],
      allowCapabilities: [],
      denyCapabilities: ["cap.events.approve"],
      constraints: [],
    }

    const updated = await updateUserOverride(
      operatorClient,
      target._id,
      denyOverride,
      "runtime-smoke:approver-deny"
    )
    if (!updated) return

    const postUpdateAuthz = await getUserAuthz(operatorClient, target._id)
    ensureAuthzDecision(postUpdateAuthz, { capabilityKey: "cap.events.approve" }, "Approver deny scenario")

    const pendingDeny = await targetClient.request("GET", "/api/v1/student-affairs/events/proposals/pending")
    assertEnforcementStatus(pendingDeny.status, "Approver pending-proposals deny check")
  })
}

const resolveWardenPathsByRole = (role) => {
  if (role === "Warden") {
    return {
      profilePath: "/api/v1/warden/profile",
      updatePath: "/api/v1/warden/active-hostel",
    }
  }
  if (role === "Associate Warden") {
    return {
      profilePath: "/api/v1/warden/associate-warden/profile",
      updatePath: "/api/v1/warden/associate-warden/active-hostel",
    }
  }
  if (role === "Hostel Supervisor") {
    return {
      profilePath: "/api/v1/warden/hostel-supervisor/profile",
      updatePath: "/api/v1/warden/hostel-supervisor/active-hostel",
    }
  }
  return null
}

const pickHostelId = (profileData) => {
  const hostels = Array.isArray(profileData?.hostelIds) ? profileData.hostelIds : []
  const activeId = String(profileData?.activeHostelId?._id || profileData?.activeHostelId || "")
  const idList = hostels
    .map((entry) => String(entry?._id || entry || ""))
    .filter((entry) => entry.length > 0)

  if (idList.length === 0) return null
  const alternative = idList.find((id) => id !== activeId)
  return alternative || idList[0]
}

const runHostelSwitchScenario = async () => {
  if (!wardenFamilyEmail || !wardenFamilyPassword) {
    logSkip("Hostel-switch scenario skipped (AUTHZ_SMOKE_WARDEN_FAMILY_EMAIL/PASSWORD not provided)")
    return
  }

  const targetClient = new SessionClient("warden-family-target")
  const user = await login(targetClient, wardenFamilyEmail, wardenFamilyPassword)
  if (!user) return

  const paths = resolveWardenPathsByRole(user.role)
  if (!paths) {
    logSkip(`Hostel-switch scenario skipped for unsupported role: ${user.role}`)
    return
  }

  const refreshBefore = await targetClient.request("GET", "/api/v1/auth/refresh")
  ensureStatus(refreshBefore, [200], "Hostel-switch pre-refresh")
  const beforeAuthz = refreshBefore.data?.user?.authz
  assertCondition(Boolean(beforeAuthz?.override && beforeAuthz?.effective), "Pre-switch session contains authz payload", "Pre-switch session missing authz payload")

  const profile = await targetClient.request("GET", paths.profilePath)
  const profileOk = ensureStatus(profile, [200], "Hostel-switch profile fetch")
  if (!profileOk) return

  const targetHostelId = pickHostelId(profile.data)
  if (!targetHostelId) {
    logSkip("Hostel-switch scenario skipped because no assigned hostel IDs were found")
    return
  }

  const updateResult = await targetClient.request("PUT", paths.updatePath, {
    body: { hostelId: targetHostelId },
  })
  ensureStatus(updateResult, [200], "Hostel-switch active-hostel update")

  const refreshAfter = await targetClient.request("GET", "/api/v1/auth/refresh")
  ensureStatus(refreshAfter, [200], "Hostel-switch post-refresh")
  const afterAuthz = refreshAfter.data?.user?.authz
  assertCondition(Boolean(afterAuthz?.override && afterAuthz?.effective), "Post-switch session contains authz payload", "Post-switch session missing authz payload")
}

const main = async () => {
  console.log("authz-phase5-runtime-smoke: starting")
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Expect enforce mode: ${expectEnforce}`)
  if (!smokeEnabled) {
    logSkip("AUTHZ_SMOKE_ENABLED is false; runtime smoke skipped")
    console.log("authz-phase5-runtime-smoke: disabled by env")
    process.exit(0)
  }

  const operatorContext = await createOperator()
  if (!operatorContext) {
    console.log("authz-phase5-runtime-smoke: no operator context, nothing executed")
    process.exit(0)
  }

  const { operator } = operatorContext

  await runSuperAdminScenario(operator)
  await runGymkhanaGsScenario(operator)
  await runApproverScenario(operator)
  await runHostelSwitchScenario()

  console.log("")
  console.log(`authz-phase5-runtime-smoke summary: ${passes.length} passed, ${failures.length} failed, ${skips.length} skipped`)

  if (failures.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("authz-phase5-runtime-smoke: fatal error", error)
  process.exit(1)
})
