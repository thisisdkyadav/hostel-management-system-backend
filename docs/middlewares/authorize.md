# Authorization Middleware (`/middlewares/authorize.js`)

This file exports middleware functions designed to authorize users based on their roles after they have been authenticated.

## Dependencies

- Requires the [`authenticate` middleware](auth.md#authenticate-req-res-next) (from `/middlewares/auth.js`) to have run first and attached the user object to `req.user`.

## Middleware

### `authorizeRoles(roles = [])`

- **Description:** A middleware _factory_ that returns an authorization middleware function. The returned middleware checks if the authenticated user's role (`req.user.role`) is included in the provided `roles` array.
- **Parameters (Factory):**
  - `roles` (Array<String>, optional): An array of strings representing the allowed role(s). Defaults to an empty array.
- **Returned Middleware Logic:**
  1.  Checks if `req.user` exists. If not, sends a `401 Unauthorized` (indicating authentication is required first).
  2.  If the `roles` array passed to the factory is empty OR if `req.user.role` is included in the `roles` array, calls `next()` to allow access.
  3.  If the user's role is not in the `roles` array, sends a `403 Forbidden` response with an appropriate message.
  4.  Includes a general `try...catch` block for unexpected errors, sending a `500 Internal Server Error`.
- **Usage:** Call this function with an array of allowed roles when applying middleware to a route.

  ```javascript
  import { authorizeRoles } from "../middlewares/authorize.js"
  import { authenticate } from "../middlewares/auth.js"

  // Only Admins and Super Admins can access this route
  router.get("/admin-data", authenticate, authorizeRoles(["Admin", "Super Admin"]), getAdminData)

  // Any authenticated user can access this route (empty roles array)
  router.get("/general-info", authenticate, authorizeRoles(), getGeneralInfo)
  ```

### `isStudentManager(req, res, next)`

- **Description:** A specific authorization middleware that checks if the authenticated user has a role permitted to manage student-related data.
- **Process:**
  1.  Checks if `req.user` exists. If not, sends a `401 Unauthorized`.
  2.  Defines an array `authorizedRoles` containing 'Warden', 'Admin', 'Super Admin', and 'Associate Warden'.
  3.  Checks if `req.user.role` is included in the `authorizedRoles` array.
  4.  If the role is authorized, calls `next()`.
  5.  If the role is not authorized, sends a `403 Forbidden` response.
  6.  Includes a general `try...catch` block for unexpected errors, sending a `500 Internal Server Error`.
- **Usage:** Apply directly to routes requiring student management privileges.

  ```javascript
  import { isStudentManager } from "../middlewares/authorize.js"
  import { authenticate } from "../middlewares/auth.js"

  // Apply after authentication
  router.post("/students/bulk-update", authenticate, isStudentManager, bulkUpdateStudents)
  ```
