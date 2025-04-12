# Warden & Associate Warden Routes (`/routes/wardenRoute.js`)

Defines API routes specifically for Wardens and Associate Wardens to retrieve their own profiles.

_Note: The filename is singular (`wardenRoute.js`), unlike most other route files._

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`wardenController.js`](../controllers/wardenController.md)
  - [`associateWardenController.js`](../controllers/associateWardenController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles)

## Base Path

All routes defined in this file are mounted under `/api/v1/warden` (assuming `/warden` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring users are logged in.
- [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles): Applied per-route to restrict access to the specific role.

## Routes

- `GET /profile`:
  - Retrieves the profile of the currently logged-in Warden.
  - Middleware: `authorizeRoles(['Warden'])`
  - Controller: [`getWardenProfile`](../controllers/wardenController.md#getwardenprofilereq-res)
  - Authentication Required: Yes
  - Authorization Required: Warden
- `GET /associate-warden/profile`:
  - Retrieves the profile of the currently logged-in Associate Warden.
  - Middleware: `authorizeRoles(['Associate Warden'])`
  - Controller: [`getAssociateWardenProfile`](../controllers/associateWardenController.md#getassociatewardenprofilereq-res)
  - Authentication Required: Yes
  - Authorization Required: Associate Warden
