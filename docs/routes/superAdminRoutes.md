# Super Admin Routes (`/routes/superAdminRoutes.js`)

Defines API routes for super administrative tasks, specifically managing API clients for external API access.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`superAdminController.js`](../controllers/superAdminController.md) _(Note: Controller filename might be `superAdminControllers.js` as per import)_

## Base Path

All routes defined in this file are mounted under `/api/v1/superadmin` (assuming `/superadmin` is the prefix used in `server.js`).

## Middleware Applied

- No authentication or authorization middleware (`authenticate`, `authorizeRoles`) is explicitly applied within this router file. It's highly likely that these are applied _before_ this router is mounted in `server.js`, restricting access to users with a 'superAdmin' role.

## Routes

**API Client Management**

- `GET /api-clients`:
  - Retrieves a list of all API clients.
  - Controller: [`getApiClients`](../controllers/superAdminController.md#getapiclientsreq-res)
  - Authentication/Authorization: Assumed Super Admin only (via upstream middleware).
- `POST /api-clients`:
  - Creates a new API client.
  - Controller: [`createApiClient`](../controllers/superAdminController.md#createapiclientreq-res)
  - Authentication/Authorization: Assumed Super Admin only (via upstream middleware).
- `DELETE /api-clients/:clientId`:
  - Deletes an existing API client (identified by `:clientId`).
  - Controller: [`deleteApiClient`](../controllers/superAdminController.md#deleteapiclientreq-res)
  - Authentication/Authorization: Assumed Super Admin only (via upstream middleware).
