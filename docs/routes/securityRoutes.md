# Security Routes (`/routes/securityRoutes.js`)

Defines API routes related to security operations, including personnel information, visitor management, student entry/exit logs, and QR code verification.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`securityController.js`](../controllers/securityController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles)

## Base Path

All routes defined in this file are mounted under `/api/v1/security` (assuming `/security` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing security routes are logged in.
- [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles): Applied per-route to control access based on user roles.

## Routes

**General Security**

- `GET /`:
  - Retrieves information about security personnel or general security status.
  - Controller: [`getSecurity`](../controllers/securityController.md#getsecurityreq-res)
  - Authentication Required: Yes
  - Authorization Required: Any authenticated user.

**Visitor Management**

- `GET /visitors`:
  - Retrieves a list of visitors.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`getVisitors`](../controllers/securityController.md#getvisitorsreq-res)
- `POST /visitors`:
  - Adds a new visitor record.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`addVisitor`](../controllers/securityController.md#addvisitorreq-res)
- `PUT /visitors/:visitorId`:
  - Updates an existing visitor record.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`updateVisitor`](../controllers/securityController.md#updatevisitorreq-res)
- `DELETE /visitors/:visitorId`:
  - Deletes a visitor record.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`deleteVisitor`](../controllers/securityController.md#deletevisitorreq-res)

**Student Entry/Exit Logs**

- `GET /entries`:
  - Retrieves student entry/exit logs.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security', 'Student'])`
  - Controller: [`getStudentEntries`](../controllers/securityController.md#getstudententriesreq-res)
- `GET /entries/recent`:
  - Retrieves recent student entry/exit logs.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`getRecentEntries`](../controllers/securityController.md#getrecententriesreq-res)
- `POST /entries`:
  - Adds a new student entry/exit log (manual entry).
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`addStudentEntry`](../controllers/securityController.md#addstudententryreq-res)
- `POST /entries/email`:
  - Adds a new student entry/exit log using email lookup.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`addStudentEntryWithEmail`](../controllers/securityController.md#addstudententrywithemailreq-res)
- `PUT /entries/:entryId`:
  - Updates an existing student entry/exit log.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`updateStudentEntry`](../controllers/securityController.md#updatestudententryreq-res)
- `DELETE /entries/:entryId`:
  - Deletes a student entry/exit log.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`deleteStudentEntry`](../controllers/securityController.md#deletestudententryreq-res)

**QR Code Verification**

- `POST /verify-qr`:
  - Verifies a student's QR code.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`verifyQR`](../controllers/securityController.md#verifyqrreq-res)
