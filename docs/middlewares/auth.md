# Authentication Middleware (`/middlewares/auth.js`)

This file exports middleware for authenticating users based on JSON Web Tokens (JWT).

## Dependencies

- `jsonwebtoken`: Used to verify JWTs.
- [`../models/User.js`](../models/README.md#userjs): User model.
- [`../config/environment.js`](../config/environment.md): Imports the `JWT_SECRET`.

## Middleware

### `authenticate(req, res, next)`

- **Description:** Verifies user authentication by checking for a valid JWT.
- **Process:**
  1.  **Extract Token:** Attempts to extract the JWT from:
      - The `token` cookie (`req.cookies.token`).
      - The `Authorization` header, removing the "Bearer " prefix (`req.header("Authorization")`).
  2.  **Check Token Existence:** If no token is found in either location, sends a `401 Unauthorized` response.
  3.  **Verify Token:** Uses `jwt.verify()` and the `JWT_SECRET` (from [`config/environment.md`](../config/environment.md)) to decode and verify the token. If verification fails (e.g., invalid signature, expired), it catches the error and sends a `401 Unauthorized` response.
  4.  **Find User:** Uses the `id` from the decoded token payload to find the corresponding user in the `User` collection using `User.findById()`. It excludes the password field (`.select("-password")`).
  5.  **Check User Existence:** If no user is found for the ID in the token, sends a `401 Unauthorized` response.
  6.  **Attach User & Proceed:** If the token is valid and the user exists, attaches the fetched user object (without password) to the request object as `req.user`.
  7.  Calls `next()` to pass control to the next middleware or route handler.
- **Error Handling:** Catches errors during token verification or database lookup and sends a `401 Unauthorized` response.

## Usage

This middleware should be applied to routes or routers that require users to be logged in. It precedes authorization middleware like [`authorizeRoles`](authorize.md#authorizerolesroles--).

```javascript
// Example usage in a route file
import express from "express"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js" // Example
import { getUserProfile, updateUserProfile } from "../controllers/userController.js" // Example

const router = express.Router()

// Apply authenticate middleware to all routes in this router
router.use(authenticate)

router.get("/profile", getUserProfile)
router.put("/profile", updateUserProfile)
// Example route requiring specific role
router.delete("/profile/:id", authorizeRoles(["Admin"]), deleteUserProfile)

export default router
```
