# Main API Routes (`/routes`)

This section documents the Express router definitions for the main application API endpoints.

[Back to Documentation Overview](../README.md)

## Overview

These routes handle the core business logic of the Hostel Management System, processing requests after authentication and authorization middleware have been applied. They typically interact with controllers found in `/controllers` to perform CRUD operations and other actions on the database models.

The routes are mounted in `server.js` under the `/api/v1` prefix (verify this prefix if needed).

## Route Files

- [Admin Routes (`adminRoutes.md`)](adminRoutes.md)
- [Auth Routes (`authRoutes.md`)](authRoutes.md)
- [Complaint Routes (`complaintRoutes.md`)](complaintRoutes.md)
- [Disciplinary Committee Routes (`disCoRoutes.md`)](disCoRoutes.md)
- [Event Routes (`eventRoutes.md`)](eventRoutes.md)
- [Feedback Routes (`feedbackRoutes.md`)](feedbackRoutes.md)
- [Hostel Routes (`hostelRoutes.md`)](hostelRoutes.md)
- [Lost and Found Routes (`lostAndFoundRoutes.md`)](lostAndFoundRoutes.md)
- [Notification Routes (`notificationRoutes.md`)](notificationRoutes.md)
- [Payment Routes (`paymentRoutes.md`)](paymentRoutes.md)
- [Security Routes (`securityRoutes.md`)](securityRoutes.md)
- [Stats Routes (`statsRoutes.md`)](statsRoutes.md)
- [Student Routes (`studentRoutes.md`)](studentRoutes.md)
- [Super Admin Routes (`superAdminRoutes.md`)](superAdminRoutes.md)
- [Upload Routes (`uploadRoutes.md`)](uploadRoutes.md)
- [Visitor Routes (`visitorRoutes.md`)](visitorRoutes.md)
- [Warden Routes (`wardenRoute.md`)](wardenRoute.md) _(Note: filename might be singular)_
