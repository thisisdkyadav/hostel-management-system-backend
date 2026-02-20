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
  route("route.superAdmin.authz", "Super Admin AuthZ", ["/super-admin/authz", "/super-admin/authz/help"]),
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
  // Capability rollout is paused. Keep only one pilot capability.
  capability("cap.students.edit.personal", "Edit Student Personal Details"),
]

export const AUTHZ_CONSTRAINT_DEFINITIONS = [
  constraint("constraint.complaints.scope.hostelIds", "Allowed Hostels (Complaints Scope)", AUTHZ_CONSTRAINT_TYPES.STRING_ARRAY, []),
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
  [ROLES.WARDEN]: ["cap.students.edit.personal"],
  [ROLES.ASSOCIATE_WARDEN]: ["cap.students.edit.personal"],
  [ROLES.HOSTEL_SUPERVISOR]: ["cap.students.edit.personal"],
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
