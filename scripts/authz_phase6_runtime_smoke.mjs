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

const studentsScopeEmail = process.env.AUTHZ_SMOKE_STUDENTS_SCOPE_EMAIL || ""
const studentsScopePassword = process.env.AUTHZ_SMOKE_STUDENTS_SCOPE_PASSWORD || ""

const complaintsScopeEmail = process.env.AUTHZ_SMOKE_COMPLAINTS_SCOPE_EMAIL || ""
const complaintsScopePassword = process.env.AUTHZ_SMOKE_COMPLAINTS_SCOPE_PASSWORD || ""

const studentSelfEmail = process.env.AUTHZ_SMOKE_STUDENT_SELF_EMAIL || ""
const studentSelfPassword = process.env.AUTHZ_SMOKE_STUDENT_SELF_PASSWORD || ""

const approverEmail = process.env.AUTHZ_SMOKE_APPROVER_EMAIL || ""
const approverPassword = process.env.AUTHZ_SMOKE_APPROVER_PASSWORD || ""
const proposalId = process.env.AUTHZ_SMOKE_PROPOSAL_ID || ""
const expenseId = process.env.AUTHZ_SMOKE_EXPENSE_ID || ""

const scopedHostelAllowId = process.env.AUTHZ_SMOKE_SCOPE_HOSTEL_ALLOW_ID || "507f1f77bcf86cd799439011"
const scopedHostelDenyId = process.env.AUTHZ_SMOKE_SCOPE_HOSTEL_DENY_ID || "507f1f77bcf86cd799439012"

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

const assertObserveOrEnforceDeny = (status, label) => {
  if (expectEnforce) {
    assertCondition(status === 403, `${label} denied in enforce mode (403)`, `${label} expected 403 in enforce mode, got ${status}`)
  } else {
    assertCondition(status !== 403, `${label} not denied in observe mode`, `${label} unexpectedly denied in observe mode`)
  }
}

const runStudentsScopeScenario = async (operatorClient) => {
  if (!studentsScopeEmail || !studentsScopePassword) {
    logSkip("Students-scope scenario skipped (AUTHZ_SMOKE_STUDENTS_SCOPE_EMAIL/PASSWORD not provided)")
    return
  }

  const target = await findUserByEmail(operatorClient, studentsScopeEmail)
  if (!target?._id) {
    logFail("Students-scope scenario could not resolve target user")
    return
  }

  await withOverrideBackup(operatorClient, target._id, "students-scope", async () => {
    const override = {
      allowRoutes: [],
      denyRoutes: [],
      allowCapabilities: [],
      denyCapabilities: [],
      constraints: [
        { key: "constraint.students.scope.onlyOwnHostel", value: true },
        { key: "constraint.students.scope.hostelIds", value: [scopedHostelAllowId] },
      ],
    }

    const updated = await updateUserOverride(
      operatorClient,
      target._id,
      override,
      "runtime-smoke:students-scope"
    )
    if (!updated) return

    const targetClient = new SessionClient("students-scope-target")
    const loggedIn = await login(targetClient, studentsScopeEmail, studentsScopePassword)
    if (!loggedIn) return

    const listResult = await targetClient.request(
      "GET",
      `/api/v1/students/profiles-admin/profiles?page=1&limit=5&hostelId=${encodeURIComponent(scopedHostelDenyId)}`
    )

    if (listResult.status === 403) {
      logSkip("Students-scope runtime check skipped due route/capability/legacy deny baseline (403)")
      return
    }

    const ok = ensureStatus(listResult, [200], "Students-scope filtered list check")
    if (!ok) return

    if (expectEnforce) {
      const rows = Array.isArray(listResult.data?.data) ? listResult.data.data.length : -1
      const total = Number(listResult.data?.pagination?.total ?? -1)
      assertCondition(
        rows === 0 && total === 0,
        "Students-scope mismatch hostel query returns deterministic empty result in enforce mode",
        `Students-scope mismatch hostel query expected empty result in enforce mode, got rows=${rows}, total=${total}`
      )
    } else {
      assertCondition(
        listResult.status !== 403,
        "Students-scope check not blocked in observe mode",
        "Students-scope check unexpectedly blocked in observe mode"
      )
    }
  })
}

const runComplaintsScopeScenario = async (operatorClient) => {
  if (!complaintsScopeEmail || !complaintsScopePassword) {
    logSkip("Complaints-scope scenario skipped (AUTHZ_SMOKE_COMPLAINTS_SCOPE_EMAIL/PASSWORD not provided)")
    return
  }

  const target = await findUserByEmail(operatorClient, complaintsScopeEmail)
  if (!target?._id) {
    logFail("Complaints-scope scenario could not resolve target user")
    return
  }

  await withOverrideBackup(operatorClient, target._id, "complaints-scope", async () => {
    const override = {
      allowRoutes: [],
      denyRoutes: [],
      allowCapabilities: [],
      denyCapabilities: [],
      constraints: [
        { key: "constraint.complaints.scope.hostelIds", value: [scopedHostelAllowId] },
      ],
    }

    const updated = await updateUserOverride(
      operatorClient,
      target._id,
      override,
      "runtime-smoke:complaints-scope"
    )
    if (!updated) return

    const targetClient = new SessionClient("complaints-scope-target")
    const loggedIn = await login(targetClient, complaintsScopeEmail, complaintsScopePassword)
    if (!loggedIn) return

    if (loggedIn.hostel?._id || loggedIn.hostel) {
      logSkip("Complaints-scope mismatch check skipped for hostel-bound user; use a non-hostel-bound role/user for this scenario")
      return
    }

    const listResult = await targetClient.request(
      "GET",
      `/api/v1/complaint/all?hostelId=${encodeURIComponent(scopedHostelDenyId)}&page=1&limit=5`
    )

    if (listResult.status === 403) {
      logSkip("Complaints-scope runtime check skipped due route/capability/legacy deny baseline (403)")
      return
    }

    const ok = ensureStatus(listResult, [200], "Complaints-scope filtered list check")
    if (!ok) return

    if (expectEnforce) {
      const rows = Array.isArray(listResult.data?.data) ? listResult.data.data.length : -1
      const total = Number(listResult.data?.meta?.total ?? -1)
      assertCondition(
        rows === 0 && total === 0,
        "Complaints-scope mismatch hostel query returns deterministic empty result in enforce mode",
        `Complaints-scope mismatch hostel query expected empty result in enforce mode, got rows=${rows}, total=${total}`
      )
    } else {
      assertCondition(
        listResult.status !== 403,
        "Complaints-scope check not blocked in observe mode",
        "Complaints-scope check unexpectedly blocked in observe mode"
      )
    }
  })
}

const runProfileEditableFieldsScenario = async (operatorClient) => {
  if (!studentSelfEmail || !studentSelfPassword) {
    logSkip("Profile-fields scenario skipped (AUTHZ_SMOKE_STUDENT_SELF_EMAIL/PASSWORD not provided)")
    return
  }

  const target = await findUserByEmail(operatorClient, studentSelfEmail)
  if (!target?._id) {
    logFail("Profile-fields scenario could not resolve target user")
    return
  }

  const allowedFields = ["profileImage", "phone", "emergencyContact"]

  await withOverrideBackup(operatorClient, target._id, "profile-editable-fields", async () => {
    const override = {
      allowRoutes: [],
      denyRoutes: [],
      allowCapabilities: [],
      denyCapabilities: [],
      constraints: [
        { key: "constraint.profile.edit.allowedFields", value: allowedFields },
      ],
    }

    const updated = await updateUserOverride(
      operatorClient,
      target._id,
      override,
      "runtime-smoke:profile-editable-fields"
    )
    if (!updated) return

    const targetClient = new SessionClient("profile-fields-target")
    const loggedIn = await login(targetClient, studentSelfEmail, studentSelfPassword)
    if (!loggedIn) return

    const editableResult = await targetClient.request("GET", "/api/v1/students/profile/editable")
    const ok = ensureStatus(editableResult, [200], "Profile-fields editable endpoint check")
    if (!ok) return

    const editableFields = Array.isArray(editableResult.data?.editableFields)
      ? editableResult.data.editableFields
      : []

    if (expectEnforce) {
      const allowedSet = new Set(allowedFields)
      const allWithinConstraint = editableFields.every((field) => allowedSet.has(field))
      assertCondition(
        allWithinConstraint,
        "Profile editable fields constrained by constraint.profile.edit.allowedFields in enforce mode",
        `Profile editable fields include out-of-scope keys in enforce mode: ${JSON.stringify(editableFields)}`
      )
    } else {
      assertCondition(
        editableResult.status !== 403,
        "Profile editable fields endpoint remains available in observe mode",
        "Profile editable fields endpoint unexpectedly blocked in observe mode"
      )
    }
  })
}

const runApprovalAmountScenario = async (operatorClient) => {
  if (!approverEmail || !approverPassword) {
    logSkip("Approval-amount scenario skipped (AUTHZ_SMOKE_APPROVER_EMAIL/PASSWORD not provided)")
    return
  }

  if (!proposalId && !expenseId) {
    logSkip("Approval-amount scenario skipped (set AUTHZ_SMOKE_PROPOSAL_ID and/or AUTHZ_SMOKE_EXPENSE_ID)")
    return
  }

  const target = await findUserByEmail(operatorClient, approverEmail)
  if (!target?._id) {
    logFail("Approval-amount scenario could not resolve target user")
    return
  }

  await withOverrideBackup(operatorClient, target._id, "approval-amount", async () => {
    const override = {
      allowRoutes: [],
      denyRoutes: [],
      allowCapabilities: [],
      denyCapabilities: [],
      constraints: [
        { key: "constraint.events.maxApprovalAmount", value: 1 },
      ],
    }

    const updated = await updateUserOverride(
      operatorClient,
      target._id,
      override,
      "runtime-smoke:approval-amount"
    )
    if (!updated) return

    const targetClient = new SessionClient("approval-amount-target")
    const loggedIn = await login(targetClient, approverEmail, approverPassword)
    if (!loggedIn) return

    if (proposalId) {
      const proposalApprove = await targetClient.request(
        "POST",
        `/api/v1/student-affairs/events/proposals/${proposalId}/approve`,
        {
          body: {
            comments: "runtime smoke approval limit check",
            nextApprovalStages: ["Joint Registrar SA"],
          },
        }
      )

      if ([400, 404].includes(proposalApprove.status)) {
        logSkip(`Proposal approval amount check inconclusive (${proposalApprove.status}); verify proposal id/stage`)
      } else {
        assertObserveOrEnforceDeny(proposalApprove.status, "Proposal approval amount check")
      }
    }

    if (expenseId) {
      const expenseApprove = await targetClient.request(
        "POST",
        `/api/v1/student-affairs/events/expenses/${expenseId}/approve`,
        {
          body: {
            comments: "runtime smoke approval limit check",
            nextApprovalStages: ["Joint Registrar SA"],
          },
        }
      )

      if ([400, 404].includes(expenseApprove.status)) {
        logSkip(`Expense approval amount check inconclusive (${expenseApprove.status}); verify expense id/stage`)
      } else {
        assertObserveOrEnforceDeny(expenseApprove.status, "Expense approval amount check")
      }
    }
  })
}

const main = async () => {
  console.log("authz-phase6-runtime-smoke: starting")
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Expect enforce mode: ${expectEnforce}`)
  if (!smokeEnabled) {
    logSkip("AUTHZ_SMOKE_ENABLED is false; runtime smoke skipped")
    console.log("authz-phase6-runtime-smoke: disabled by env")
    process.exit(0)
  }

  const operatorContext = await createOperator()
  if (!operatorContext) {
    console.log("authz-phase6-runtime-smoke: no operator context, nothing executed")
    process.exit(0)
  }

  const { operator } = operatorContext

  await runStudentsScopeScenario(operator)
  await runComplaintsScopeScenario(operator)
  await runProfileEditableFieldsScenario(operator)
  await runApprovalAmountScenario(operator)

  console.log("")
  console.log(`authz-phase6-runtime-smoke summary: ${passes.length} passed, ${failures.length} failed, ${skips.length} skipped`)

  if (failures.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("authz-phase6-runtime-smoke: fatal error", error)
  process.exit(1)
})
