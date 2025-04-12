# Event Routes (`/routes/eventRoutes.js`)

Defines API routes for managing hostel events.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`eventController.js`](../controllers/eventController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles)

## Base Path

All routes defined in this file are mounted under `/api/v1/events` (assuming `/events` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing event routes are logged in.
- [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles): Applied per-route to control access based on user roles.

## Routes

- `POST /`:
  - Creates a new event.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`createEvent`](../controllers/eventController.md#createeventreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, or Associate Warden
- `GET /`:
  - Retrieves all events.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Student'])`
  - Controller: [`getEvents`](../controllers/eventController.md#geteventsreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, Associate Warden, or Student
- `PUT /:id`:
  - Updates an existing event (identified by `:id`).
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`updateEvent`](../controllers/eventController.md#updateeventreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, or Associate Warden
- `DELETE /:id`:
  - Deletes an existing event (identified by `:id`).
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden'])`
  - Controller: [`deleteEvent`](../controllers/eventController.md#deleteeventreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, or Associate Warden
