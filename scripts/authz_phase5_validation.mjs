import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ROLES } from "../src/core/constants/roles.constants.js"
import {
  AUTHZ_ROUTE_KEYS,
  buildEffectiveAuthz,
  canCapability,
  canRoute,
} from "../src/core/authz/index.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..", "..")

const passes = []
const failures = []

const assertCheck = (condition, message) => {
  if (condition) {
    passes.push(message)
    return
  }
  failures.push(message)
}

const readText = (relativePath) => {
  const absolutePath = path.resolve(repoRoot, relativePath)
  return fs.readFileSync(absolutePath, "utf8")
}

const assertRoleDefaultBehavior = () => {
  const student = buildEffectiveAuthz({ role: ROLES.STUDENT, override: {} })
  const gymkhana = buildEffectiveAuthz({ role: ROLES.GYMKHANA, override: {} })
  const superAdmin = buildEffectiveAuthz({ role: ROLES.SUPER_ADMIN, override: {} })

  assertCheck(canRoute(student, "route.student.dashboard"), "Student default allows student dashboard route")
  assertCheck(!canRoute(student, "route.admin.dashboard"), "Student default denies admin dashboard route")

  assertCheck(canRoute(gymkhana, "route.gymkhana.events"), "Gymkhana default allows gymkhana events route")
  assertCheck(!canRoute(gymkhana, "route.hostelGate.entries"), "Gymkhana default denies hostel gate entries route")

  assertCheck(canRoute(superAdmin, "route.superAdmin.apiKeys"), "Super Admin default allows super-admin api keys route")
  assertCheck(!canRoute(superAdmin, "route.admin.students"), "Super Admin default denies admin students route")

  assertCheck(canCapability(student, "cap.events.view"), "Student default capabilities resolve via wildcard")
  assertCheck(canCapability(gymkhana, "cap.events.create"), "Gymkhana default capabilities resolve via wildcard")
}

const assertOverrideBehavior = () => {
  const overridden = buildEffectiveAuthz({
    role: ROLES.GYMKHANA,
    override: {
      denyRoutes: ["route.gymkhana.megaEvents"],
      denyCapabilities: ["cap.events.create"],
    },
  })

  assertCheck(!canRoute(overridden, "route.gymkhana.megaEvents"), "Override denyRoutes disables gymkhana mega events route")
  assertCheck(canRoute(overridden, "route.gymkhana.events"), "Override denyRoutes keeps unrelated gymkhana events route")
  assertCheck(!canCapability(overridden, "cap.events.create"), "Override denyCapabilities disables events create capability")
  assertCheck(canCapability(overridden, "cap.events.view"), "Override denyCapabilities keeps unrelated events view capability")
}

const assertRouteKeyCoverage = () => {
  const routeKeySet = new Set(AUTHZ_ROUTE_KEYS)
  const files = [
    "backend/src/apps/administration/modules/super-admin/super-admin.routes.js",
    "backend/src/apps/student-affairs/modules/events/events.routes.js",
    "backend/src/apps/administration/modules/upload/upload.routes.js",
  ]

  for (const file of files) {
    const content = readText(file)
    const matches = content.match(/route\.[A-Za-z0-9_.]+/g) || []
    const uniqueMatches = [...new Set(matches)]

    assertCheck(uniqueMatches.length > 0, `${file} contains route keys for authz mapping`)
    for (const key of uniqueMatches) {
      assertCheck(routeKeySet.has(key), `${file} route key exists in catalog: ${key}`)
    }
  }
}

const assertHostelSwitchSessionRefresh = () => {
  const files = [
    "backend/src/apps/administration/modules/warden/warden.service.js",
    "backend/src/apps/administration/modules/warden/associate-warden.service.js",
    "backend/src/apps/administration/modules/warden/hostel-supervisor.service.js",
  ]

  for (const file of files) {
    const content = readText(file)
    assertCheck(content.includes("session.userData = {"), `${file} updates session.userData after hostel switch`)
    assertCheck(content.includes("authz:"), `${file} includes authz in session payload`)
    assertCheck(content.includes("override:"), `${file} includes authz override in session payload`)
    assertCheck(content.includes("effective:"), `${file} includes authz effective in session payload`)
    assertCheck(content.includes("await session.save()"), `${file} saves session after hostel switch`)
  }
}

const assertLegacyChecksRetirementForMigratedSlices = () => {
  const backendChecks = [
    "backend/src/apps/complaints/modules/complaints/complaints.routes.js",
    "backend/src/apps/campus-life/modules/events/events.routes.js",
    "backend/src/apps/students/modules/profiles-admin/profiles-admin.routes.js",
    "backend/src/apps/campus-life/modules/lost-and-found/lost-and-found.routes.js",
    "backend/src/apps/campus-life/modules/feedback/feedback.routes.js",
    "backend/src/apps/operations/modules/inventory/inventory.routes.js",
    "backend/src/apps/administration/modules/family/family.routes.js",
    "backend/src/apps/campus-life/modules/disco/disco.routes.js",
    "backend/src/apps/campus-life/modules/certificates/certificates.routes.js",
    "backend/src/apps/students/modules/profiles-self/profiles-self.routes.js",
    "backend/src/apps/operations/modules/dashboard/dashboard.routes.js",
    "backend/src/apps/operations/modules/security/security.routes.js",
  ]

  for (const file of backendChecks) {
    const content = readText(file)
    assertCheck(!content.includes("requirePermission("), `${file} no longer uses legacy requirePermission checks`)
  }

  const frontendChecks = [
    "frontend/src/pages/common/StudentsPage.jsx",
    "frontend/src/pages/common/ComplaintsPage.jsx",
    "frontend/src/pages/common/VisitorRequestsPage.jsx",
    "frontend/src/pages/common/LostAndFoundPage.jsx",
    "frontend/src/components/lostAndFound/LostAndFoundCard.jsx",
    "frontend/src/components/FeedbackCard.jsx",
    "frontend/src/components/wardens/inventory/StudentAssignments.jsx",
    "frontend/src/components/common/students/HealthTab.jsx",
    "frontend/src/components/common/students/InsuranceClaimModal.jsx",
    "frontend/src/components/common/students/FamilyDetails.jsx",
    "frontend/src/components/common/students/Certificates.jsx",
    "frontend/src/components/common/students/DisCoActions.jsx",
    "frontend/src/components/common/students/StudentDetailModal.jsx",
  ]

  for (const file of frontendChecks) {
    const content = readText(file)
    assertCheck(!content.includes("canAccess("), `${file} no longer uses legacy canAccess checks`)
  }
}

const run = () => {
  assertRoleDefaultBehavior()
  assertOverrideBehavior()
  assertRouteKeyCoverage()
  assertHostelSwitchSessionRefresh()
  assertLegacyChecksRetirementForMigratedSlices()

  console.log(`authz-phase5-validation: ${passes.length} passed, ${failures.length} failed`)
  for (const pass of passes) {
    console.log(`PASS: ${pass}`)
  }
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`)
  }

  if (failures.length > 0) {
    process.exit(1)
  }
}

run()
