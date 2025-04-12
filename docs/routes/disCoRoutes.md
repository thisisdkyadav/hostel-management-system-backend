# Disciplinary Committee Routes (`/routes/disCoRoutes.js`)

Defines API routes for managing disciplinary committee (DisCo) actions related to students.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`disCoController.js`](../controllers/disCoController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/disco` (assuming `/disco` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Ensures the user is logged in before accessing any DisCo route. Applied globally via `router.use()` and also individually on each route definition.

## Routes

- `POST /add`:
  - Adds a new disciplinary action record.
  - Controller: [`addDisCoAction`](../controllers/disCoController.md#adddiscoactionreq-res)
  - Authentication Required: Yes
- `GET /:studentId`:
  - Retrieves all disciplinary actions for a specific student (identified by `:studentId`).
  - Controller: [`getDisCoActionsByStudent`](../controllers/disCoController.md#getdiscoactionsbystudentreq-res)
  - Authentication Required: Yes
- `PUT /update/:disCoId`:
  - Updates an existing disciplinary action record (identified by `:disCoId`).
  - Controller: [`updateDisCoAction`](../controllers/disCoController.md#updatediscoactionreq-res)
  - Authentication Required: Yes
