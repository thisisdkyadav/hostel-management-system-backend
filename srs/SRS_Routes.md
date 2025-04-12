### 4.2 Routes (`/routes`)

**Purpose:** Routes define the API endpoints, mapping incoming HTTP requests (URL path and method) to the appropriate controller functions. They also orchestrate the application of middleware for tasks like authentication and authorization.

**General Requirements:**

- **RTE-GR-1:** Each primary feature or resource shall have its own route file (e.g., `authRoutes.js`, `studentRoutes.js`).
- **RTE-GR-2:** Routes shall be defined using `express.Router()`.
- **RTE-GR-3:** Routes shall map standard HTTP methods (GET, POST, PUT, DELETE, PATCH) to specific controller functions.
- **RTE-GR-4:** URL paths shall follow RESTful conventions where appropriate (e.g., `/api/students` for student collection, `/api/students/:id` for a specific student).
- **RTE-GR-5:** Authentication middleware (`authenticate`) shall be applied to all routes requiring a logged-in user.
- **RTE-GR-6:** Authorization middleware (`authorizeRoles`) shall be applied to routes requiring specific user roles.
- **RTE-GR-7:** Routes should be clearly grouped by resource or functionality within their respective files.
- **RTE-GR-8:** Route definitions shall import the necessary controller functions.
- **RTE-GR-9:** All API routes should be prefixed consistently (e.g., `/api`) in the main `server.js` file.

**Specific Route Examples:**

- **RTE-Auth-1 (`authRoutes.js`):**
  - `GET /api/auth/user`: Requires authentication (`authenticate`), calls `getUser` controller.
  - `GET /api/auth/logout`: Requires authentication (`authenticate`), calls `logout` controller.
  - `POST /api/auth/google`: Public, calls `loginWithGoogle` controller.
  - `POST /api/auth/login`: Public, calls `login` controller.
  - `POST /api/auth/update-password`: Requires authentication (`authenticate`), calls `updatePassword` controller.
- **RTE-Student-1 (`studentRoutes.js`):**
  - All routes under `/api/student` require authentication (`authenticate` applied via `router.use`).
  - `GET /api/student/dashboard`: Requires "Student" role (`authorizeRoles`), calls `getStudentDashboard`.
  - `GET /api/student/profile`: Requires "Student" role (`authorizeRoles`), calls `getStudentProfile`.
  - `GET /api/student/profiles`: Requires Admin/Warden/Associate Warden role (`authorizeRoles`), calls `getStudents`.
  - `POST /api/student/profiles`: Requires Admin/Warden/Associate Warden role (`authorizeRoles`), calls `createStudentsProfiles`.
  - `PUT /api/student/profiles`: Requires Admin/Warden/Associate Warden role (`authorizeRoles`), calls `updateStudentsProfiles`.
  - `POST /api/student/profiles/ids`: Requires Admin/Warden/Associate Warden role (`authorizeRoles`), calls `getMultipleStudentDetails`.
  - `GET /api/student/profile/details/:userId`: Requires Admin/Warden/Associate Warden role (`authorizeRoles`), calls `getStudentDetails`.
  - `PUT /api/student/profile/:userId`: Requires Admin/Warden/Associate Warden role (`authorizeRoles`), calls `updateStudentProfile`.
  - `POST /api/student/:userId/complaints`: (Implicitly requires authentication), calls `fileComplaint`.
  - `GET /api/student/:userId/complaints`: (Implicitly requires authentication), calls `getAllComplaints`.
  - `PUT /api/student/complaints/:complaintId`: (Implicitly requires authentication), calls `updateComplaint`.
  - `DELETE /api/student/complaints/:complaintId`: (Implicitly requires authentication), calls `deleteComplaint`.
  - _(Commented out room change routes indicate potential future features or removed functionality)_

_(Similar detailed requirements should be derived for all other route files.)_
