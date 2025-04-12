# Auth Routes (`/routes/authRoutes.js`)

Defines API routes related to user authentication and session management.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`authController.js`](../controllers/authController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/auth` (assuming `/auth` is the prefix used in `server.js`).

## Routes

- `POST /login`:
  - Handles standard username/password login.
  - Controller: [`login`](../controllers/authController.md#loginreq-res)
  - Authentication Required: No
- `POST /google`:
  - Handles login/signup via Google OAuth.
  - Controller: [`loginWithGoogle`](../controllers/authController.md#loginwithgooglereq-res)
  - Authentication Required: No
- `GET /user`:
  - Retrieves the profile of the currently authenticated user.
  - Middleware: [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - Controller: [`getUser`](../controllers/authController.md#getuserreq-res)
  - Authentication Required: Yes
- `GET /logout`:
  - Logs out the currently authenticated user (clears JWT cookie).
  - Middleware: [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - Controller: [`logout`](../controllers/authController.md#logoutreq-res)
  - Authentication Required: Yes
- `POST /update-password`:
  - Updates the password for the currently authenticated user.
  - Middleware: [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - Controller: [`updatePassword`](../controllers/authController.md#updatepasswordreq-res)
  - Authentication Required: Yes
