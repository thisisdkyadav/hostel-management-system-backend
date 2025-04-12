# Lost and Found Routes (`/routes/lostAndFoundRoutes.js`)

Defines API routes for managing lost and found items within the hostel.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`lostAndFoundController.js`](../controllers/lostAndFoundController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles)

## Base Path

All routes defined in this file are mounted under `/api/v1/lostfound` (assuming `/lostfound` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing lost & found routes are logged in.
- [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles): Applied per-route to control access based on user roles.

## Routes

- `GET /`:
  - Retrieves all lost and found items.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security', 'Student'])`
  - Controller: [`getLostAndFound`](../controllers/lostAndFoundController.md#getlostandfoundreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, Associate Warden, Security, or Student
- `POST /`:
  - Creates a new lost and found item record.
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`createLostAndFound`](../controllers/lostAndFoundController.md#createlostandfoundreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, Associate Warden, or Security
- `PUT /:id`:
  - Updates an existing lost and found item record (identified by `:id`).
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`updateLostAndFound`](../controllers/lostAndFoundController.md#updatelostandfoundreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, Associate Warden, or Security
- `DELETE /:id`:
  - Deletes an existing lost and found item record (identified by `:id`).
  - Middleware: `authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Security'])`
  - Controller: [`deleteLostAndFound`](../controllers/lostAndFoundController.md#deletelostandfoundreq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin, Warden, Associate Warden, or Security
