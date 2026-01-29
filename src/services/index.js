/**
 * Services Index
 * Central export for all service modules
 */

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

// Default exports for convenience
import faceScannerServiceDefault from "./faceScanner.service.js"
import scannerActionServiceDefault from "./scannerAction.service.js"
import liveCheckInOutServiceDefault from "./liveCheckInOut.service.js"
import storageServiceDefault from "./storage.service.js"
import paymentServiceDefault from "./payment.service.js"
import notificationServiceDefault from "./notification.service.js"

export default {
  faceScannerService: faceScannerServiceDefault,
  scannerActionService: scannerActionServiceDefault,
  liveCheckInOutService: liveCheckInOutServiceDefault,
  storageService: storageServiceDefault,
  paymentService: paymentServiceDefault,
  notificationService: notificationServiceDefault,
}
