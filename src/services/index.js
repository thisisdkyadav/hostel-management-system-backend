/**
 * Services Index
 * Central export for all service modules
 */

// Auth services
export * from "./auth.service.js"

// Complaint services
export * from "./complaint.service.js"

// Student services
export * from "./student.service.js"

// Hostel services
export * from "./hostel.service.js"

// Dashboard services
export * from "./dashboard.service.js"

// Visitor services
export * from "./visitor.service.js"

// Undertaking services
export * from "./undertaking.service.js"

// Sheet services
export * from "./sheet.service.js"

// Permission services
export * from "./permission.service.js"

// Security services
export * from "./security.service.js"

// Admin services
export * from "./admin.service.js"

// Scanner services
export * as faceScannerService from "./faceScanner.service.js"
export * as scannerActionService from "./scannerAction.service.js"

// Check-in/out services
export * as liveCheckInOutService from "./liveCheckInOut.service.js"

// Storage services
export * as storageService from "./storage.service.js"

// Payment services
export * as paymentService from "./payment.service.js"

// Notification services
export * as notificationService from "./notification.service.js"

// Hostel Inventory services
export * from "./hostelInventory.service.js"

// User services
export * from "./user.service.js"

// Task services
export * from "./task.service.js"

// Warden services
export * from "./warden.service.js"

// Hostel Supervisor services
export * from "./hostelSupervisor.service.js"

// Associate Warden services
export * from "./associateWarden.service.js"

// Stats services
export * from "./stats.service.js"

// Health services
export * from "./health.service.js"

// Insurance Provider services
export * from "./insuranceProvider.service.js"

// Staff Attendance services
export * from "./staffAttendance.service.js"

// Inventory Item Type services
export * from "./inventoryItemType.service.js"

// Super Admin services
export * from "./superAdmin.service.js"

// Leave services
export * from "./leave.service.js"

// Family Member services
export * from "./familyMember.service.js"

// Feedback services
export * from "./feedback.service.js"

// Online Users services
export * from "./onlineUsers.service.js"

// Event services
export * from "./event.service.js"

// Hostel Gate services
export * from "./hostelGate.service.js"

// Config services
export * from "./config.service.js"

// Certificate services
export * from "./certificate.service.js"

// DisCo services
export * from "./disCo.service.js"

// Visitor Profile services
export * from "./visitorProfile.service.js"

// Lost And Found services
export * from "./lostAndFound.service.js"

// Default exports for convenience
import { authService } from "./auth.service.js"
import { complaintService } from "./complaint.service.js"
import { studentService } from "./student.service.js"
import { hostelService } from "./hostel.service.js"
import { dashboardService } from "./dashboard.service.js"
import { visitorService } from "./visitor.service.js"
import { undertakingService } from "./undertaking.service.js"
import { sheetService } from "./sheet.service.js"
import { permissionService } from "./permission.service.js"
import { securityService } from "./security.service.js"
import { adminService } from "./admin.service.js"
import faceScannerServiceDefault from "./faceScanner.service.js"
import scannerActionServiceDefault from "./scannerAction.service.js"
import liveCheckInOutServiceDefault from "./liveCheckInOut.service.js"
import storageServiceDefault from "./storage.service.js"
import paymentServiceDefault from "./payment.service.js"
import notificationServiceDefault from "./notification.service.js"

export default {
  authService,
  complaintService,
  studentService,
  hostelService,
  dashboardService,
  visitorService,
  undertakingService,
  sheetService,
  permissionService,
  securityService,
  adminService,
  faceScannerService: faceScannerServiceDefault,
  scannerActionService: scannerActionServiceDefault,
  liveCheckInOutService: liveCheckInOutServiceDefault,
  storageService: storageServiceDefault,
  paymentService: paymentServiceDefault,
  notificationService: notificationServiceDefault,
}
