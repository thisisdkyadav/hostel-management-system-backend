# Student Routes (`/routes/studentRoutes.js`)

Defines API routes for managing student profiles, accessing student-specific data (like dashboards), and handling student complaints.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`studentController.js`](../controllers/studentController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles)

## Base Path

All routes defined in this file are mounted under `/api/v1/students` (assuming `/students` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing student routes are logged in.
- [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles): Applied per-route to control access based on user roles.

## Routes

**Student Dashboard & Profile**

- `GET /dashboard`:
  - Retrieves dashboard data for the currently logged-in student.
  - Middleware: `authorizeRoles(['Student'])`
  - Controller: [`getStudentDashboard`](../controllers/studentController.md#getstudentdashboardreq-res)
- `GET /profile`:
  - Retrieves the profile of the currently logged-in student.
  - Middleware: `authorizeRoles(['Student'])`
  - Controller: [`getStudentProfile`](../controllers/studentController.md#getstudentprofilereq-res)

**Profile Management (Admin/Staff)**

- `GET /profiles`:
  - Retrieves a list of student profiles.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`getStudents`](../controllers/studentController.md#getstudentsreq-res)
- `POST /profiles`:
  - Creates student profiles in bulk.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`createStudentsProfiles`](../controllers/studentController.md#createstudentsprofilesreq-res)
- `PUT /profiles`:
  - Updates student profiles in bulk.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`updateStudentsProfiles`](../controllers/studentController.md#updatestudentsprofilesreq-res)
- `POST /profiles/ids`:
  - Retrieves details for multiple students based on provided IDs.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`getMultipleStudentDetails`](../controllers/studentController.md#getmultiplestudentdetailsreq-res)
- `GET /profile/details/:userId`:
  - Retrieves detailed profile information for a specific student.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`getStudentDetails`](../controllers/studentController.md#getstudentdetailsreq-res)
- `PUT /profile/:userId`:
  - Updates the profile of a specific student.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`updateStudentProfile`](../controllers/studentController.md#updatestudentprofilereq-res)

**Complaints (Student-Specific)**

- `POST /:userId/complaints`:
  - Files a complaint associated with a specific user (likely the logged-in user, or enforced by controller).
  - Controller: [`fileComplaint`](../controllers/studentController.md#filecomplaintreq-res)
- `GET /:userId/complaints`:
  - Retrieves all complaints associated with a specific user.
  - Controller: [`getAllComplaints`](../controllers/studentController.md#getallcomplaintsreq-res)
- `PUT /complaints/:complaintId`:
  - Updates a specific complaint (permissions likely checked in controller).
  - Controller: [`updateComplaint`](../controllers/studentController.md#updatecomplaintreq-res)
- `DELETE /complaints/:complaintId`:
  - Deletes a specific complaint (permissions likely checked in controller).
  - Controller: [`deleteComplaint`](../controllers/studentController.md#deletecomplaintreq-res)

**Room Change Requests (Commented Out)**

- Routes for creating, getting status, updating, and deleting room change requests exist in the code but are currently commented out.
