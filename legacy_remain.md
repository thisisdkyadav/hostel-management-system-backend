# Legacy Support Code - To Be Removed After Frontend Update

> **Purpose**: This file tracks all temporary backward-compatibility code added during restructuring.
> **Action Required**: After frontend is updated to use new imports/patterns, remove these legacy items.
> **Last Updated**: January 29, 2026

---

## How to Use This File

1. During restructuring, we create "re-export" files that forward imports to new locations
2. This allows existing code (routes, controllers) to keep working without changes
3. Once we're ready to fully migrate, update the imports and delete these files

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Legacy code still needed |
| ✅ | Frontend updated, can be removed |
| 🗑️ | Removed |

---

## Legacy Entries

### Configuration Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| config/environment.js | ALL | Re-exports from src/config/env.config.js | All files importing from config/environment.js | ⬜ |
| config/db.js | ALL | Re-exports from src/config/database.config.js | server.js | ⬜ |
| config/socket.js | ALL | Re-exports from src/loaders/socket.loader.js | server.js | ⬜ |

### Middleware Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| middlewares/auth.js | ALL | Re-exports from src/middlewares/auth.middleware.js | All route files | ⬜ |
| middlewares/authorize.js | ALL | Re-exports from src/middlewares/authorize.middleware.js | All route files | ⬜ |
| middlewares/faceScannerAuth.js | ALL | Re-exports from src/middlewares/faceScannerAuth.middleware.js | faceScannerRoutes.js | ⬜ |

### Model Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| models/User.js | ALL | Re-exports from src/models/user/User.model.js | Multiple controllers | ⬜ |
| models/Session.js | ALL | Re-exports from src/models/user/Session.model.js | authController.js | ⬜ |
| models/Admin.js | ALL | Re-exports from src/models/user/Admin.model.js | adminController.js | ⬜ |
| models/Warden.js | ALL | Re-exports from src/models/user/Warden.model.js | wardenController.js | ⬜ |
| models/AssociateWarden.js | ALL | Re-exports from src/models/user/AssociateWarden.model.js | associateWardenController.js | ⬜ |
| models/Security.js | ALL | Re-exports from src/models/user/Security.model.js | securityController.js | ⬜ |
| models/HostelSupervisor.js | ALL | Re-exports from src/models/user/HostelSupervisor.model.js | hostelSupervisorController.js | ⬜ |
| models/HostelGate.js | ALL | Re-exports from src/models/user/HostelGate.model.js | hostelGateController.js | ⬜ |
| models/MaintenanceStaff.js | ALL | Re-exports from src/models/user/MaintenanceStaff.model.js | Various controllers | ⬜ |
| models/Hostel.js | ALL | Re-exports from src/models/hostel/Hostel.model.js | hostelController.js | ⬜ |
| models/Room.js | ALL | Re-exports from src/models/hostel/Room.model.js | Various controllers | ⬜ |
| models/RoomAllocation.js | ALL | Re-exports from src/models/hostel/RoomAllocation.model.js | Various controllers | ⬜ |
| models/RoomChangeRequest.js | ALL | Re-exports from src/models/hostel/RoomChangeRequest.model.js | studentController.js | ⬜ |
| models/Unit.js | ALL | Re-exports from src/models/hostel/Unit.model.js | Various controllers | ⬜ |
| models/Complaint.js | ALL | Re-exports from src/models/complaint/Complaint.model.js | complaintController.js | ⬜ |
| models/Visitors.js | ALL | Re-exports from src/models/visitor/Visitors.model.js | visitorController.js | ⬜ |
| models/VisitorProfile.js | ALL | Re-exports from src/models/visitor/VisitorProfile.model.js | visitorProfileController.js | ⬜ |
| models/VisitorRequest.js | ALL | Re-exports from src/models/visitor/VisitorRequest.model.js | visitorController.js | ⬜ |
| models/FamilyMember.js | ALL | Re-exports from src/models/visitor/FamilyMember.model.js | familyMemberController.js | ⬜ |
| models/Event.js | ALL | Re-exports from src/models/event/Event.model.js | eventController.js | ⬜ |
| models/Poll.js | ALL | Re-exports from src/models/event/Poll.model.js | eventController.js | ⬜ |
| models/HostelInventory.js | ALL | Re-exports from src/models/inventory/HostelInventory.model.js | hostelInventoryController.js | ⬜ |
| models/StudentInventory.js | ALL | Re-exports from src/models/inventory/StudentInventory.model.js | studentInventoryController.js | ⬜ |
| models/InventoryItemType.js | ALL | Re-exports from src/models/inventory/InventoryItemType.model.js | inventoryItemTypeController.js | ⬜ |
| models/CheckInOut.js | ALL | Re-exports from src/models/attendance/CheckInOut.model.js | Various controllers | ⬜ |
| models/staffAttendance.js | ALL | Re-exports from src/models/attendance/StaffAttendance.model.js | staffAttendanceController.js | ⬜ |
| models/Leave.js | ALL | Re-exports from src/models/attendance/Leave.model.js | leaveController.js | ⬜ |
| models/FaceScanner.js | ALL | Re-exports from src/models/scanner/FaceScanner.model.js | faceScannerController.js | ⬜ |
| models/ApiClient.js | ALL | Re-exports from src/models/scanner/ApiClient.model.js | externalApi | ⬜ |
| models/Task.js | ALL | Re-exports from src/models/task/Task.model.js | taskController.js | ⬜ |
| models/Notification.js | ALL | Re-exports from src/models/notification/Notification.model.js | notificationController.js | ⬜ |
| models/Feedback.js | ALL | Re-exports from src/models/feedback/Feedback.model.js | feedbackController.js | ⬜ |
| models/Certificate.js | ALL | Re-exports from src/models/certificate/Certificate.model.js | certificateController.js | ⬜ |
| models/Undertaking.js | ALL | Re-exports from src/models/certificate/Undertaking.model.js | undertakingController.js | ⬜ |
| models/UndertakingAssignment.js | ALL | Re-exports from src/models/certificate/UndertakingAssignment.model.js | undertakingController.js | ⬜ |
| models/LostAndFound.js | ALL | Re-exports from src/models/lost-found/LostAndFound.model.js | lostAndFoundController.js | ⬜ |
| models/DisCoAction.js | ALL | Re-exports from src/models/disco/DisCoAction.model.js | disCoController.js | ⬜ |
| models/InsuranceClaim.js | ALL | Re-exports from src/models/insurance/InsuranceClaim.model.js | insuranceProviderController.js | ⬜ |
| models/InsuranceProvider.js | ALL | Re-exports from src/models/insurance/InsuranceProvider.model.js | insuranceProviderController.js | ⬜ |
| models/Health.js | ALL | Re-exports from src/models/health/Health.model.js | healthController.js | ⬜ |
| models/configuration.js | ALL | Re-exports from src/models/config/Configuration.model.js | configController.js | ⬜ |
| models/StudentProfile.js | ALL | Re-exports from src/models/student/StudentProfile.model.js | studentProfileController.js | ⬜ |

### Route Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| routes/authRoutes.js | ALL | Re-exports from src/api/v1/auth/auth.routes.js | server.js | ⬜ |
| routes/userRoutes.js | ALL | Re-exports from src/api/v1/users/users.routes.js | server.js | ⬜ |
| routes/ssoRoutes.js | ALL | Re-exports from src/api/v1/sso/sso.routes.js | server.js | ⬜ |
| routes/hostelRoutes.js | ALL | Re-exports from src/api/v1/hostels/hostels.routes.js | server.js | ⬜ |
| routes/studentRoutes.js | ALL | Re-exports from src/api/v1/students/students.routes.js | server.js | ⬜ |
| routes/studentProfileRoutes.js | ALL | Re-exports from src/api/v1/student-profile/studentProfile.routes.js | server.js | ⬜ |
| routes/wardenRoute.js | ALL | Re-exports from src/api/v1/wardens/wardens.routes.js | server.js | ⬜ |
| routes/complaintRoutes.js | ALL | Re-exports from src/api/v1/complaints/complaints.routes.js | server.js | ⬜ |
| routes/leaveRoutes.js | ALL | Re-exports from src/api/v1/leaves/leaves.routes.js | server.js | ⬜ |
| routes/visitorRoutes.js | ALL | Re-exports from src/api/v1/visitors/visitors.routes.js | server.js | ⬜ |
| routes/familyMemberRoutes.js | ALL | Re-exports from src/api/v1/family/family.routes.js | server.js | ⬜ |
| routes/eventRoutes.js | ALL | Re-exports from src/api/v1/events/events.routes.js | server.js | ⬜ |
| routes/inventoryRoutes.js | ALL | Re-exports from src/api/v1/inventory/inventory.routes.js | server.js | ⬜ |
| routes/lostAndFoundRoutes.js | ALL | Re-exports from src/api/v1/lost-found/lostFound.routes.js | server.js | ⬜ |
| routes/taskRoutes.js | ALL | Re-exports from src/api/v1/tasks/tasks.routes.js | server.js | ⬜ |
| routes/securityRoutes.js | ALL | Re-exports from src/api/v1/security/security.routes.js | server.js | ⬜ |
| routes/faceScannerRoutes.js | ALL | Re-exports from src/api/v1/face-scanner/faceScanner.routes.js | server.js | ⬜ |
| routes/staffAttendanceRoutes.js | ALL | Re-exports from src/api/v1/staff-attendance/staffAttendance.routes.js | server.js | ⬜ |
| routes/liveCheckInOutRoutes.js | ALL | Re-exports from src/api/v1/live-checkinout/liveCheckinout.routes.js | server.js | ⬜ |
| routes/adminRoutes.js | ALL | Re-exports from src/api/v1/admin/admin.routes.js | server.js | ⬜ |
| routes/superAdminRoutes.js | ALL | Re-exports from src/api/v1/super-admin/superAdmin.routes.js | server.js | ⬜ |
| routes/dashboardRoutes.js | ALL | Re-exports from src/api/v1/dashboard/dashboard.routes.js | server.js | ⬜ |
| routes/statsRoutes.js | ALL | Re-exports from src/api/v1/stats/stats.routes.js | server.js | ⬜ |
| routes/permissionRoutes.js | ALL | Re-exports from src/api/v1/permissions/permissions.routes.js | server.js | ⬜ |
| routes/notificationRoutes.js | ALL | Re-exports from src/api/v1/notifications/notifications.routes.js | server.js | ⬜ |
| routes/feedbackRoutes.js | ALL | Re-exports from src/api/v1/feedback/feedback.routes.js | server.js | ⬜ |
| routes/certificateRoutes.js | ALL | Re-exports from src/api/v1/certificates/certificates.routes.js | server.js | ⬜ |
| routes/undertakingRoutes.js | ALL | Re-exports from src/api/v1/undertakings/undertakings.routes.js | server.js | ⬜ |
| routes/disCoRoutes.js | ALL | Re-exports from src/api/v1/disco/disco.routes.js | server.js | ⬜ |
| routes/uploadRoutes.js | ALL | Re-exports from src/api/v1/upload/upload.routes.js | server.js | ⬜ |
| routes/paymentRoutes.js | ALL | Re-exports from src/api/v1/payments/payments.routes.js | server.js | ⬜ |
| routes/configRoutes.js | ALL | Re-exports from src/api/v1/config/config.routes.js | server.js | ⬜ |
| routes/sheetRoutes.js | ALL | Re-exports from src/api/v1/sheets/sheets.routes.js | server.js | ⬜ |
| routes/onlineUsersRoutes.js | ALL | Re-exports from src/api/v1/online-users/onlineUsers.routes.js | server.js | ⬜ |

### Controller Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| controllers/authController.js | ALL | Re-exports from src/api/v1/auth/auth.controller.js | routes/authRoutes.js | ⬜ |
| controllers/userController.js | ALL | Re-exports from src/api/v1/users/users.controller.js | routes/userRoutes.js | ⬜ |
| controllers/ssoController.js | ALL | Re-exports from src/api/v1/sso/sso.controller.js | routes/ssoRoutes.js, server.js | ⬜ |
| controllers/hostelController.js | ALL | Re-exports from src/api/v1/hostels/hostels.controller.js | routes/hostelRoutes.js | ⬜ |
| controllers/studentController.js | ALL | Re-exports from src/api/v1/students/students.controller.js | routes/studentRoutes.js | ⬜ |
| controllers/studentProfileController.js | ALL | Re-exports from src/api/v1/student-profile/studentProfile.controller.js | routes/studentProfileRoutes.js | ⬜ |
| controllers/wardenController.js | ALL | Re-exports from src/api/v1/wardens/wardens.controller.js | routes/wardenRoute.js | ⬜ |
| controllers/associateWardenController.js | ALL | Re-exports from src/api/v1/wardens/associateWarden.controller.js | routes/wardenRoute.js | ⬜ |
| controllers/complaintController.js | ALL | Re-exports from src/api/v1/complaints/complaints.controller.js | routes/complaintRoutes.js | ⬜ |
| controllers/leaveController.js | ALL | Re-exports from src/api/v1/leaves/leaves.controller.js | routes/leaveRoutes.js | ⬜ |
| controllers/visitorController.js | ALL | Re-exports from src/api/v1/visitors/visitors.controller.js | routes/visitorRoutes.js | ⬜ |
| controllers/visitorProfileController.js | ALL | Re-exports from src/api/v1/visitors/visitorProfile.controller.js | routes/visitorRoutes.js | ⬜ |
| controllers/familyMemberController.js | ALL | Re-exports from src/api/v1/family/family.controller.js | routes/familyMemberRoutes.js | ⬜ |
| controllers/eventController.js | ALL | Re-exports from src/api/v1/events/events.controller.js | routes/eventRoutes.js | ⬜ |
| controllers/hostelInventoryController.js | ALL | Re-exports from src/api/v1/inventory/hostelInventory.controller.js | routes/inventoryRoutes.js | ⬜ |
| controllers/studentInventoryController.js | ALL | Re-exports from src/api/v1/inventory/studentInventory.controller.js | routes/inventoryRoutes.js | ⬜ |
| controllers/inventoryItemTypeController.js | ALL | Re-exports from src/api/v1/inventory/inventoryItemType.controller.js | routes/inventoryRoutes.js | ⬜ |
| controllers/lostAndFoundController.js | ALL | Re-exports from src/api/v1/lost-found/lostFound.controller.js | routes/lostAndFoundRoutes.js | ⬜ |
| controllers/taskController.js | ALL | Re-exports from src/api/v1/tasks/tasks.controller.js | routes/taskRoutes.js | ⬜ |
| controllers/securityController.js | ALL | Re-exports from src/api/v1/security/security.controller.js | routes/securityRoutes.js | ⬜ |
| controllers/faceScannerController.js | ALL | Re-exports from src/api/v1/face-scanner/faceScanner.controller.js | routes/faceScannerRoutes.js | ⬜ |
| controllers/scannerActionController.js | ALL | Re-exports from src/api/v1/face-scanner/scannerAction.controller.js | routes/faceScannerRoutes.js | ⬜ |
| controllers/staffAttendanceController.js | ALL | Re-exports from src/api/v1/staff-attendance/staffAttendance.controller.js | routes/staffAttendanceRoutes.js | ⬜ |
| controllers/liveCheckInOutController.js | ALL | Re-exports from src/api/v1/live-checkinout/liveCheckinout.controller.js | routes/liveCheckInOutRoutes.js | ⬜ |
| controllers/adminController.js | ALL | Re-exports from src/api/v1/admin/admin.controller.js | routes/adminRoutes.js | ⬜ |
| controllers/superAdminControllers.js | ALL | Re-exports from src/api/v1/super-admin/superAdmin.controller.js | routes/superAdminRoutes.js | ⬜ |
| controllers/dashboardController.js | ALL | Re-exports from src/api/v1/dashboard/dashboard.controller.js | routes/dashboardRoutes.js | ⬜ |
| controllers/statsController.js | ALL | Re-exports from src/api/v1/stats/stats.controller.js | routes/statsRoutes.js | ⬜ |
| controllers/permissionController.js | ALL | Re-exports from src/api/v1/permissions/permissions.controller.js | routes/permissionRoutes.js | ⬜ |
| controllers/notificationController.js | ALL | Re-exports from src/api/v1/notifications/notifications.controller.js | routes/notificationRoutes.js | ⬜ |
| controllers/feedbackController.js | ALL | Re-exports from src/api/v1/feedback/feedback.controller.js | routes/feedbackRoutes.js | ⬜ |
| controllers/certificateController.js | ALL | Re-exports from src/api/v1/certificates/certificates.controller.js | routes/certificateRoutes.js | ⬜ |
| controllers/undertakingController.js | ALL | Re-exports from src/api/v1/undertakings/undertakings.controller.js | routes/undertakingRoutes.js | ⬜ |
| controllers/disCoController.js | ALL | Re-exports from src/api/v1/disco/disco.controller.js | routes/disCoRoutes.js | ⬜ |
| controllers/uploadController.js | ALL | Re-exports from src/api/v1/upload/upload.controller.js | routes/uploadRoutes.js | ⬜ |
| controllers/paymentController.js | ALL | Re-exports from src/api/v1/payments/payments.controller.js | routes/paymentRoutes.js | ⬜ |
| controllers/configController.js | ALL | Re-exports from src/api/v1/config/config.controller.js | routes/configRoutes.js | ⬜ |
| controllers/sheetController.js | ALL | Re-exports from src/api/v1/sheets/sheets.controller.js | routes/sheetRoutes.js | ⬜ |
| controllers/onlineUsersController.js | ALL | Re-exports from src/api/v1/online-users/onlineUsers.controller.js | routes/onlineUsersRoutes.js | ⬜ |
| controllers/healthController.js | ALL | Re-exports from src/api/v1/health/health.controller.js | Various | ⬜ |
| controllers/hostelGateController.js | ALL | Re-exports from src/api/v1/hostel-gate/hostelGate.controller.js | Various | ⬜ |
| controllers/hostelSupervisorController.js | ALL | Re-exports from src/api/v1/hostel-supervisor/hostelSupervisor.controller.js | Various | ⬜ |
| controllers/insuranceProviderController.js | ALL | Re-exports from src/api/v1/insurance/insurance.controller.js | Various | ⬜ |

### Service Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| services/faceScannerService.js | ALL | Re-exports from src/services/faceScanner.service.js | faceScannerController.js | ⬜ |
| services/liveCheckInOutService.js | ALL | Re-exports from src/services/liveCheckInOut.service.js | liveCheckInOutController.js | ⬜ |
| services/scannerActionService.js | ALL | Re-exports from src/services/scannerAction.service.js | scannerActionController.js | ⬜ |

### Utility Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| utils/utils.js | ALL | Re-exports from src/utils/utils.js | Various controllers | ⬜ |
| utils/permissions.js | ALL | Re-exports from src/utils/permissions.js | Various routes | ⬜ |
| utils/qrUtils.js | ALL | Re-exports from src/utils/qr.utils.js | authController.js | ⬜ |
| utils/redisOnlineUsers.js | ALL | Re-exports from src/utils/redisOnlineUsers.js | onlineUsersController.js | ⬜ |
| utils/socketHandlers.js | ALL | Re-exports from src/utils/socketHandlers.js | server.js | ⬜ |
| utils/configDefaults.js | ALL | Re-exports from src/utils/configDefaults.js | configController.js | ⬜ |

### External API Files

| File | Line(s) | Description | Depends On | Status |
|------|---------|-------------|------------|--------|
| externalApi/index.js | ALL | Re-exports from src/external/index.js | server.js | ⬜ |

---

## Cleanup Checklist

Once all legacy files are marked ✅ (frontend updated):

- [ ] Delete all re-export files in `config/`
- [ ] Delete all re-export files in `middlewares/`
- [ ] Delete all re-export files in `models/`
- [ ] Delete all re-export files in `routes/`
- [ ] Delete all re-export files in `controllers/`
- [ ] Delete all re-export files in `services/`
- [ ] Delete all re-export files in `utils/`
- [ ] Delete `externalApi/` folder
- [ ] Update `server.js` to use new imports
- [ ] Remove this file from the project

---

## Notes

- Each entry added during Phase X of restructure_plan.md
- Review this file before each major frontend release
- Batch cleanup during major version updates

