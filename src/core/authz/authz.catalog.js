/**
 * AuthZ catalog
 * This is the central source of truth for route and capability keys.
 *
 * Notes for current rollout:
 * - Layer-1 RBAC (`authorizeRoles`) remains the primary gate.
 * - Layer-3 AuthZ defaults to permissive for authorized users.
 */

import { ROLES } from "../constants/roles.constants.js"
import {
  AUTHZ_CATALOG_VERSION,
  AUTHZ_CONSTRAINT_TYPES,
  AUTHZ_DEFAULT_POLICY,
} from "./authz.constants.js"

const route = (key, label, paths = []) => ({ key, label, paths })
const capability = (key, label, description = "") => ({ key, label, description })
const constraint = (key, label, valueType, defaultValue = null) => ({
  key,
  label,
  valueType,
  defaultValue,
})

export const AUTHZ_ROUTE_DEFINITIONS = [
  // Admin
  route("route.admin.dashboard", "Admin Dashboard", ["/admin"]),
  route("route.admin.liveCheckInOut", "Live Check In/Out", ["/admin/live-checkinout", "/admin/lc"]),
  route("route.admin.faceScanners", "Face Scanners", ["/admin/face-scanners", "/admin/fs"]),
  route("route.admin.hostels", "Hostels", ["/admin/hostels", "/admin/hostels/:hostelName", "/admin/hostels/:hostelName/units/:unitNumber"]),
  route("route.admin.administrators", "Administrators", ["/admin/administrators"]),
  route("route.admin.wardens", "Wardens", ["/admin/wardens"]),
  route("route.admin.associateWardens", "Associate Wardens", ["/admin/associate-wardens"]),
  route("route.admin.hostelSupervisors", "Hostel Supervisors", ["/admin/hostel-supervisors"]),
  route("route.admin.students", "Students", ["/admin/students"]),
  route("route.admin.inventory", "Inventory", ["/admin/inventory"]),
  route("route.admin.complaints", "Complaints", ["/admin/complaints"]),
  route("route.admin.disciplinaryProcess", "Disciplinary Process", ["/admin/disciplinary-process"]),
  route("route.admin.appointments", "Appointments", ["/admin/appointments", "/admin/jr-appointments"]),
  route("route.admin.leaves", "Leaves", ["/admin/leaves"]),
  route("route.admin.security", "Security", ["/admin/security"]),
  route("route.admin.visitors", "Visitors", ["/admin/visitors"]),
  route("route.admin.lostAndFound", "Lost and Found", ["/admin/lost-and-found"]),
  route("route.admin.events", "Events", ["/admin/events"]),
  route("route.admin.gymkhanaEvents", "Gymkhana Events", ["/admin/gymkhana-events"]),
  route("route.admin.megaEvents", "Mega Events", ["/admin/mega-events"]),
  route("route.admin.updatePassword", "Update Password", ["/admin/update-password"]),
  route("route.admin.settings", "Settings", ["/admin/settings"]),
  route("route.admin.authz", "AuthZ Management", ["/admin/authz"]),
  route("route.admin.profile", "Profile", ["/admin/profile"]),
  route("route.admin.maintenance", "Maintenance Staff", ["/admin/maintenance"]),
  route("route.admin.notifications", "Notifications", ["/admin/notifications"]),
  route("route.admin.feedbacks", "Feedbacks", ["/admin/feedbacks"]),
  route("route.admin.others", "Others", ["/admin/others"]),
  route("route.admin.taskManagement", "Task Management", ["/admin/task-management"]),
  route("route.admin.sheet", "Sheet", ["/admin/sheet"]),

  // Super Admin
  route("route.superAdmin.dashboard", "Super Admin Dashboard", ["/super-admin"]),
  route("route.superAdmin.admins", "Super Admin Admins", ["/super-admin/admins"]),
  route("route.superAdmin.apiKeys", "Super Admin API Keys", ["/super-admin/api-keys"]),
  route("route.superAdmin.profile", "Super Admin Profile", ["/super-admin/profile"]),

  // Warden family
  route("route.warden.dashboard", "Warden Dashboard", ["/warden"]),
  route("route.warden.hostels", "Warden Hostels", ["/warden/hostels/:hostelName", "/warden/hostels/:hostelName/units/:unitNumber"]),
  route("route.warden.students", "Warden Students", ["/warden/students"]),
  route("route.warden.studentInventory", "Warden Student Inventory", ["/warden/student-inventory"]),
  route("route.warden.visitors", "Warden Visitors", ["/warden/visitors"]),
  route("route.warden.complaints", "Warden Complaints", ["/warden/complaints"]),
  route("route.warden.events", "Warden Events", ["/warden/events"]),
  route("route.warden.lostAndFound", "Warden Lost and Found", ["/warden/lost-and-found"]),
  route("route.warden.notifications", "Warden Notifications", ["/warden/notifications"]),
  route("route.warden.feedbacks", "Warden Feedbacks", ["/warden/feedbacks"]),
  route("route.warden.undertakings", "Warden Undertakings", ["/warden/undertakings"]),
  route("route.warden.myTasks", "Warden Tasks", ["/warden/my-tasks"]),
  route("route.warden.profile", "Warden Profile", ["/warden/profile"]),

  route("route.associateWarden.dashboard", "Associate Warden Dashboard", ["/associate-warden"]),
  route("route.associateWarden.hostels", "Associate Warden Hostels", ["/associate-warden/hostels/:hostelName", "/associate-warden/hostels/:hostelName/units/:unitNumber"]),
  route("route.associateWarden.students", "Associate Warden Students", ["/associate-warden/students"]),
  route("route.associateWarden.studentInventory", "Associate Warden Student Inventory", ["/associate-warden/student-inventory"]),
  route("route.associateWarden.visitors", "Associate Warden Visitors", ["/associate-warden/visitors"]),
  route("route.associateWarden.complaints", "Associate Warden Complaints", ["/associate-warden/complaints"]),
  route("route.associateWarden.events", "Associate Warden Events", ["/associate-warden/events"]),
  route("route.associateWarden.lostAndFound", "Associate Warden Lost and Found", ["/associate-warden/lost-and-found"]),
  route("route.associateWarden.notifications", "Associate Warden Notifications", ["/associate-warden/notifications"]),
  route("route.associateWarden.feedbacks", "Associate Warden Feedbacks", ["/associate-warden/feedbacks"]),
  route("route.associateWarden.undertakings", "Associate Warden Undertakings", ["/associate-warden/undertakings"]),
  route("route.associateWarden.myTasks", "Associate Warden Tasks", ["/associate-warden/my-tasks"]),
  route("route.associateWarden.profile", "Associate Warden Profile", ["/associate-warden/profile"]),

  route("route.hostelSupervisor.dashboard", "Hostel Supervisor Dashboard", ["/hostel-supervisor"]),
  route("route.hostelSupervisor.hostels", "Hostel Supervisor Hostels", ["/hostel-supervisor/hostels/:hostelName", "/hostel-supervisor/hostels/:hostelName/units/:unitNumber"]),
  route("route.hostelSupervisor.students", "Hostel Supervisor Students", ["/hostel-supervisor/students"]),
  route("route.hostelSupervisor.studentInventory", "Hostel Supervisor Student Inventory", ["/hostel-supervisor/student-inventory"]),
  route("route.hostelSupervisor.visitors", "Hostel Supervisor Visitors", ["/hostel-supervisor/visitors"]),
  route("route.hostelSupervisor.complaints", "Hostel Supervisor Complaints", ["/hostel-supervisor/complaints"]),
  route("route.hostelSupervisor.events", "Hostel Supervisor Events", ["/hostel-supervisor/events"]),
  route("route.hostelSupervisor.lostAndFound", "Hostel Supervisor Lost and Found", ["/hostel-supervisor/lost-and-found"]),
  route("route.hostelSupervisor.notifications", "Hostel Supervisor Notifications", ["/hostel-supervisor/notifications"]),
  route("route.hostelSupervisor.feedbacks", "Hostel Supervisor Feedbacks", ["/hostel-supervisor/feedbacks"]),
  route("route.hostelSupervisor.undertakings", "Hostel Supervisor Undertakings", ["/hostel-supervisor/undertakings"]),
  route("route.hostelSupervisor.myTasks", "Hostel Supervisor Tasks", ["/hostel-supervisor/my-tasks"]),
  route("route.hostelSupervisor.leaves", "Hostel Supervisor Leaves", ["/hostel-supervisor/leaves"]),
  route("route.hostelSupervisor.profile", "Hostel Supervisor Profile", ["/hostel-supervisor/profile"]),

  // Security
  route("route.security.attendance", "Security Attendance", ["/guard"]),
  route("route.security.myTasks", "Security Tasks", ["/guard/my-tasks"]),
  route("route.security.lostAndFound", "Security Lost and Found", ["/guard/lost-and-found"]),

  // Hostel Gate
  route("route.hostelGate.dashboard", "Hostel Gate Dashboard", ["/hostel-gate"]),
  route("route.hostelGate.entries", "Hostel Gate Entries", ["/hostel-gate/entries"]),
  route("route.hostelGate.scannerEntries", "Hostel Gate Scanner Entries", ["/hostel-gate/scanner-entries"]),
  route("route.hostelGate.faceScannerEntries", "Hostel Gate Face Scanner Entries", ["/hostel-gate/face-scanner-entries"]),
  route("route.hostelGate.attendance", "Hostel Gate Attendance", ["/hostel-gate/attendance"]),
  route("route.hostelGate.appointments", "Hostel Gate Appointments", ["/hostel-gate/appointments", "/hostel-gate/jr-appointments"]),
  route("route.hostelGate.visitors", "Hostel Gate Visitors", ["/hostel-gate/visitors"]),
  route("route.hostelGate.myTasks", "Hostel Gate Tasks", ["/hostel-gate/my-tasks"]),
  route("route.hostelGate.lostAndFound", "Hostel Gate Lost and Found", ["/hostel-gate/lost-and-found"]),

  // Maintenance
  route("route.maintenance.dashboard", "Maintenance Dashboard", ["/maintenance"]),
  route("route.maintenance.attendance", "Maintenance Attendance", ["/maintenance/attendance"]),
  route("route.maintenance.myTasks", "Maintenance Tasks", ["/maintenance/my-tasks"]),
  route("route.maintenance.leaves", "Maintenance Leaves", ["/maintenance/leaves"]),

  // Student
  route("route.student.dashboard", "Student Dashboard", ["/student"]),
  route("route.student.complaints", "Student Complaints", ["/student/complaints"]),
  route("route.student.lostAndFound", "Student Lost and Found", ["/student/lost-and-found"]),
  route("route.student.events", "Student Events", ["/student/events"]),
  route("route.student.visitors", "Student Visitors", ["/student/visitors"]),
  route("route.student.feedbacks", "Student Feedbacks", ["/student/feedbacks"]),
  route("route.student.notifications", "Student Notifications", ["/student/notifications"]),
  route("route.student.security", "Student Security", ["/student/security"]),
  route("route.student.idCard", "Student ID Card", ["/student/id-card"]),
  route("route.student.undertakings", "Student Undertakings", ["/student/undertakings"]),
  route("route.student.profile", "Student Profile", ["/student/profile"]),

  // Gymkhana
  route("route.gymkhana.dashboard", "Gymkhana Dashboard", ["/gymkhana"]),
  route("route.gymkhana.events", "Gymkhana Events", ["/gymkhana/events"]),
  route("route.gymkhana.megaEvents", "Gymkhana Mega Events", ["/gymkhana/mega-events"]),
  route("route.gymkhana.profile", "Gymkhana Profile", ["/gymkhana/profile"]),
]

export const AUTHZ_CAPABILITY_DEFINITIONS = [
  // Students (pilot and shared)
  capability("cap.students.list.view", "View Students List"),
  capability("cap.students.detail.view", "View Student Details"),
  capability("cap.students.import", "Import Students"),
  capability("cap.students.bulk.update", "Bulk Update Students"),
  capability("cap.students.allocations.update", "Update Student Allocations"),
  capability("cap.students.export", "Export Students"),
  capability("cap.students.view", "View Students"),
  capability("cap.students.edit.personal", "Edit Student Personal Details"),
  capability("cap.students.edit.family", "Edit Student Family Details"),
  capability("cap.students.edit.health", "Edit Student Health Details"),
  capability("cap.students.edit.academic", "Edit Student Academic Details"),
  capability("cap.students.password.reset", "Reset Student Password"),
  capability("cap.students.family.view", "View Student Family Details"),
  capability("cap.students.family.edit", "Edit Student Family Details"),
  capability("cap.students.disciplinary.view", "View Student Disciplinary Data"),
  capability("cap.students.disciplinary.manage", "Manage Student Disciplinary Data"),
  capability("cap.students.certificates.view", "View Student Certificates"),
  capability("cap.students.certificates.manage", "Manage Student Certificates"),
  capability("cap.students.idCard.view", "View Student ID Card"),
  capability("cap.students.idCard.upload", "Upload Student ID Card"),

  // Inventory
  capability("cap.inventory.view", "View Inventory"),
  capability("cap.inventory.assign", "Assign Inventory"),
  capability("cap.inventory.edit", "Edit Inventory"),

  // Lost and Found
  capability("cap.lostAndFound.view", "View Lost and Found"),
  capability("cap.lostAndFound.create", "Create Lost and Found Items"),
  capability("cap.lostAndFound.edit", "Edit Lost and Found Items"),
  capability("cap.lostAndFound.delete", "Delete Lost and Found Items"),

  // Feedback
  capability("cap.feedback.view", "View Feedback"),
  capability("cap.feedback.create", "Create Feedback"),
  capability("cap.feedback.react", "Reply/React to Feedback"),

  // Complaints
  capability("cap.complaints.view", "View Complaints"),
  capability("cap.complaints.create", "Create Complaints"),
  capability("cap.complaints.review", "Review Complaints"),
  capability("cap.complaints.resolve", "Resolve Complaints"),

  // Visitors
  capability("cap.visitors.view", "View Visitors"),
  capability("cap.visitors.create", "Create Visitor Requests"),
  capability("cap.visitors.approve", "Approve Visitor Requests"),
  capability("cap.visitors.allocate", "Allocate Visitor Accommodation"),

  // Events
  capability("cap.events.view", "View Events"),
  capability("cap.events.create", "Create Events"),
  capability("cap.events.approve", "Approve Events"),

  // Notifications
  capability("cap.notifications.view", "View Notifications"),
  capability("cap.notifications.send", "Send Notifications"),

  // Profile (self)
  capability("cap.profile.self.view", "View Own Profile"),
  capability("cap.profile.self.update", "Update Own Profile"),

  // Undertakings
  capability("cap.undertakings.view", "View Undertakings"),
  capability("cap.undertakings.manage", "Manage Undertakings"),
  capability("cap.undertakings.accept", "Accept Undertakings"),

  // Hostel and allocation operations
  capability("cap.hostels.view", "View Hostels and Rooms"),
  capability("cap.hostels.manage", "Manage Hostels and Room Allocations"),

  // Tasks
  capability("cap.tasks.view", "View Tasks"),
  capability("cap.tasks.manage", "Manage Tasks"),
  capability("cap.tasks.status.update", "Update Task Status"),

  // Attendance and leaves
  capability("cap.attendance.record", "Record/Verify Attendance"),
  capability("cap.attendance.view", "View Attendance Records"),
  capability("cap.leaves.view", "View Leaves"),
  capability("cap.leaves.create", "Create Leaves"),
  capability("cap.leaves.review", "Review Leaves"),

  // Admin operational observability
  capability("cap.faceScanners.manage", "Manage Face Scanners"),
  capability("cap.liveCheckInOut.view", "View Live Check-In/Out"),
  capability("cap.onlineUsers.view", "View Online Users"),
  capability("cap.sheet.view", "View Sheet Data"),

  // User management
  capability("cap.users.view", "View Users"),
  capability("cap.users.create", "Create Users"),
  capability("cap.users.edit", "Edit Users"),
  capability("cap.users.delete", "Delete Users"),

  // Settings (pilot)
  capability("cap.settings.studentFields.view", "View Student Edit Permissions Settings"),
  capability("cap.settings.studentFields.update", "Update Student Edit Permissions Settings"),
  capability("cap.settings.degrees.view", "View Degrees Settings"),
  capability("cap.settings.degrees.update", "Update Degrees Settings"),
  capability("cap.settings.degrees.rename", "Rename Degree Values"),
  capability("cap.settings.departments.view", "View Departments Settings"),
  capability("cap.settings.departments.update", "Update Departments Settings"),
  capability("cap.settings.departments.rename", "Rename Department Values"),
  capability("cap.settings.registeredStudents.view", "View Registered Students Settings"),
  capability("cap.settings.registeredStudents.update", "Update Registered Students Settings"),
  capability("cap.settings.academicHolidays.view", "View Academic Holidays Settings"),
  capability("cap.settings.academicHolidays.update", "Update Academic Holidays Settings"),
  capability("cap.settings.system.view", "View System Settings"),
  capability("cap.settings.system.update", "Update System Settings"),
  capability("cap.settings.view", "View Settings"),
  capability("cap.settings.update", "Update Settings"),

  // AuthZ administration
  capability("cap.authz.view", "View AuthZ"),
  capability("cap.authz.update", "Update AuthZ"),
]

export const AUTHZ_CONSTRAINT_DEFINITIONS = [
  constraint("constraint.students.scope.hostelIds", "Allowed Hostels (Students Scope)", AUTHZ_CONSTRAINT_TYPES.STRING_ARRAY, []),
  constraint("constraint.students.scope.onlyOwnHostel", "Only Own Hostel Data", AUTHZ_CONSTRAINT_TYPES.BOOLEAN, false),
  constraint("constraint.students.edit.allowedSections", "Allowed Student Sections", AUTHZ_CONSTRAINT_TYPES.STRING_ARRAY, []),
  constraint("constraint.complaints.scope.hostelIds", "Allowed Hostels (Complaints Scope)", AUTHZ_CONSTRAINT_TYPES.STRING_ARRAY, []),
  constraint("constraint.profile.edit.allowedFields", "Allowed Profile Editable Fields", AUTHZ_CONSTRAINT_TYPES.STRING_ARRAY, []),
  constraint("constraint.events.maxApprovalAmount", "Max Event Approval Amount", AUTHZ_CONSTRAINT_TYPES.NUMBER, null),
]

export const AUTHZ_ROUTE_KEYS = AUTHZ_ROUTE_DEFINITIONS.map((item) => item.key)
export const AUTHZ_CAPABILITY_KEYS = AUTHZ_CAPABILITY_DEFINITIONS.map((item) => item.key)
export const AUTHZ_CONSTRAINT_KEYS = AUTHZ_CONSTRAINT_DEFINITIONS.map((item) => item.key)

export const AUTHZ_ROUTE_KEYS_BY_ROLE = {
  [ROLES.ADMIN]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.admin.")),
  [ROLES.SUPER_ADMIN]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.superAdmin.")),
  [ROLES.WARDEN]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.warden.")),
  [ROLES.ASSOCIATE_WARDEN]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.associateWarden.")),
  [ROLES.HOSTEL_SUPERVISOR]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.hostelSupervisor.")),
  [ROLES.SECURITY]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.security.")),
  [ROLES.HOSTEL_GATE]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.hostelGate.")),
  [ROLES.MAINTENANCE_STAFF]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.maintenance.")),
  [ROLES.STUDENT]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.student.")),
  [ROLES.GYMKHANA]: AUTHZ_ROUTE_KEYS.filter((key) => key.startsWith("route.gymkhana.")),
}

export const AUTHZ_CAPABILITY_DEFAULTS_BY_ROLE = Object.values(ROLES).reduce((acc, role) => {
  acc[role] = ["*"]
  return acc
}, {})

export const AUTHZ_CAPABILITY_DENY_DEFAULTS_BY_ROLE = {
  [ROLES.WARDEN]: [
    "cap.students.import",
    "cap.students.bulk.update",
    "cap.students.allocations.update",
    "cap.students.edit.personal",
    "cap.students.edit.family",
    "cap.students.edit.health",
    "cap.students.edit.academic",
    "cap.students.family.edit",
    "cap.students.disciplinary.manage",
    "cap.students.certificates.manage",
    "cap.complaints.review",
    "cap.complaints.resolve",
    "cap.events.create",
    "cap.events.approve",
    "cap.lostAndFound.create",
    "cap.lostAndFound.edit",
    "cap.lostAndFound.delete",
    "cap.visitors.allocate",
    "cap.visitors.approve",
  ],
  [ROLES.ASSOCIATE_WARDEN]: [
    "cap.students.import",
    "cap.students.bulk.update",
    "cap.students.allocations.update",
    "cap.students.edit.personal",
    "cap.students.edit.family",
    "cap.students.edit.health",
    "cap.students.edit.academic",
    "cap.students.family.edit",
    "cap.students.disciplinary.manage",
    "cap.students.certificates.manage",
    "cap.events.create",
    "cap.events.approve",
  ],
  [ROLES.HOSTEL_SUPERVISOR]: [
    "cap.students.import",
    "cap.students.bulk.update",
    "cap.students.allocations.update",
    "cap.students.edit.personal",
    "cap.students.edit.family",
    "cap.students.edit.health",
    "cap.students.edit.academic",
    "cap.students.family.edit",
    "cap.students.disciplinary.manage",
    "cap.students.certificates.manage",
    "cap.events.create",
    "cap.events.approve",
  ],
}

export const AUTHZ_CATALOG = {
  version: AUTHZ_CATALOG_VERSION,
  defaultPolicy: AUTHZ_DEFAULT_POLICY,
  routes: AUTHZ_ROUTE_DEFINITIONS,
  capabilities: AUTHZ_CAPABILITY_DEFINITIONS,
  constraints: AUTHZ_CONSTRAINT_DEFINITIONS,
  roleDefaults: {
    routeAccess: AUTHZ_ROUTE_KEYS_BY_ROLE,
    capabilities: AUTHZ_CAPABILITY_DEFAULTS_BY_ROLE,
    denyCapabilities: AUTHZ_CAPABILITY_DENY_DEFAULTS_BY_ROLE,
  },
}

export default AUTHZ_CATALOG
