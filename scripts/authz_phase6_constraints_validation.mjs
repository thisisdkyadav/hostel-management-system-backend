import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ROLES, buildEffectiveAuthz, getConstraintValue } from "../src/core/index.js"

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

const assertConstraintMergeBehavior = () => {
  const effective = buildEffectiveAuthz({
    role: ROLES.ADMIN,
    override: {
      constraints: [
        { key: "constraint.events.maxApprovalAmount", value: 25000 },
        { key: "constraint.students.scope.onlyOwnHostel", value: true },
        {
          key: "constraint.profile.edit.allowedFields",
          value: ["profileImage", "phone", "emergencyContact"],
        },
      ],
    },
  })

  assertCheck(
    getConstraintValue(effective, "constraint.events.maxApprovalAmount", null) === 25000,
    "Constraint merge resolves events max approval amount override"
  )
  assertCheck(
    getConstraintValue(effective, "constraint.students.scope.onlyOwnHostel", false) === true,
    "Constraint merge resolves students only-own-hostel override"
  )
  const allowedFields = getConstraintValue(
    effective,
    "constraint.profile.edit.allowedFields",
    []
  )
  assertCheck(
    Array.isArray(allowedFields) && allowedFields.includes("profileImage"),
    "Constraint merge resolves profile editable-fields override"
  )
}

const assertConstraintEdgeCases = () => {
  const emptyFieldsEffective = buildEffectiveAuthz({
    role: ROLES.STUDENT,
    override: {
      constraints: [
        { key: "constraint.profile.edit.allowedFields", value: [] },
      ],
    },
  })
  const emptyFields = getConstraintValue(
    emptyFieldsEffective,
    "constraint.profile.edit.allowedFields",
    null
  )
  assertCheck(
    Array.isArray(emptyFields) && emptyFields.length === 0,
    "Constraint edge: empty editable-fields array is preserved"
  )

  const duplicateKeyEffective = buildEffectiveAuthz({
    role: ROLES.ADMIN,
    override: {
      constraints: [
        { key: "constraint.events.maxApprovalAmount", value: 5000 },
        { key: "constraint.events.maxApprovalAmount", value: 2000 },
      ],
    },
  })
  assertCheck(
    getConstraintValue(duplicateKeyEffective, "constraint.events.maxApprovalAmount", null) === 2000,
    "Constraint edge: last duplicate constraint entry wins deterministically"
  )

  const fallbackEffective = buildEffectiveAuthz({
    role: ROLES.ADMIN,
    override: {},
  })
  assertCheck(
    getConstraintValue(
      fallbackEffective,
      "constraint.events.maxApprovalAmount",
      "fallback-marker"
    ) === null,
    "Constraint edge: default max-approval amount resolves to null"
  )
}

const assertBackendConstraintWiring = () => {
  const profilesAdminService = readText(
    "backend/src/apps/students/modules/profiles-admin/profiles-admin.service.js"
  )
  assertCheck(
    profilesAdminService.includes("constraint.students.scope.hostelIds"),
    "Profiles admin service wires students hostel scope constraint"
  )
  assertCheck(
    profilesAdminService.includes("constraint.students.scope.onlyOwnHostel"),
    "Profiles admin service wires students only-own-hostel constraint"
  )
  assertCheck(
    profilesAdminService.includes("constraint.students.edit.allowedSections"),
    "Profiles admin service wires students section constraint"
  )
  assertCheck(
    profilesAdminService.includes("isAuthzEnforceMode"),
    "Profiles admin service gates constraints by AUTHZ_MODE"
  )

  const studentProfileService = readText(
    "backend/src/apps/students/modules/student-profile/student-profile.service.js"
  )
  assertCheck(
    studentProfileService.includes("constraint.profile.edit.allowedFields"),
    "Student profile service wires editable-field constraint"
  )
  assertCheck(
    studentProfileService.includes("resolveEditableFields"),
    "Student profile service applies editable-field constraint resolver"
  )

  const complaintsService = readText(
    "backend/src/apps/complaints/modules/complaints/complaints.service.js"
  )
  assertCheck(
    complaintsService.includes("constraint.complaints.scope.hostelIds"),
    "Complaints service wires complaint hostel scope constraint"
  )
  assertCheck(
    complaintsService.includes("getComplaintScopeContext"),
    "Complaints service uses scope context resolver"
  )

  const proposalService = readText(
    "backend/src/apps/student-affairs/modules/events/proposal.service.js"
  )
  assertCheck(
    proposalService.includes("constraint.events.maxApprovalAmount"),
    "Proposal service wires max approval amount constraint"
  )
  assertCheck(
    proposalService.includes("getMaxApprovalAmount"),
    "Proposal service checks amount limit before approval"
  )

  const expenseService = readText(
    "backend/src/apps/student-affairs/modules/events/expense.service.js"
  )
  assertCheck(
    expenseService.includes("constraint.events.maxApprovalAmount"),
    "Expense service wires max approval amount constraint"
  )
  assertCheck(
    expenseService.includes("getMaxApprovalAmount"),
    "Expense service checks amount limit before approval"
  )
}

const assertFrontendConstraintWiring = () => {
  const studentsPage = readText("frontend/src/pages/common/StudentsPage.jsx")
  assertCheck(
    studentsPage.includes("constraint.students.scope.hostelIds"),
    "Students page consumes student hostel-scope constraint"
  )
  assertCheck(
    studentsPage.includes("constraint.students.scope.onlyOwnHostel"),
    "Students page consumes only-own-hostel constraint"
  )

  const complaintsPage = readText("frontend/src/pages/common/ComplaintsPage.jsx")
  assertCheck(
    complaintsPage.includes("constraint.complaints.scope.hostelIds"),
    "Complaints page consumes complaint hostel-scope constraint"
  )

  const profileModal = readText(
    "frontend/src/components/profile/StudentEditProfileModal.jsx"
  )
  assertCheck(
    profileModal.includes("constraint.profile.edit.allowedFields"),
    "Student profile modal consumes editable-fields constraint"
  )

  const gymkhanaEventsPage = readText("frontend/src/pages/common/GymkhanaEventsPage.jsx")
  const megaEventsPage = readText("frontend/src/pages/common/MegaEventsPage.jsx")
  assertCheck(
    gymkhanaEventsPage.includes("constraint.events.maxApprovalAmount"),
    "Gymkhana events page consumes max approval amount constraint"
  )
  assertCheck(
    megaEventsPage.includes("constraint.events.maxApprovalAmount"),
    "Mega events page consumes max approval amount constraint"
  )
}

const run = () => {
  assertConstraintMergeBehavior()
  assertConstraintEdgeCases()
  assertBackendConstraintWiring()
  assertFrontendConstraintWiring()

  console.log(`authz-phase6-constraints-validation: ${passes.length} passed, ${failures.length} failed`)
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
