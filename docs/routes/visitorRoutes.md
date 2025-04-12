# Visitor Routes (`/routes/visitorRoutes.js`)

Defines API routes for managing visitors, including their profiles, visit requests, room allocations, and check-in/check-out status.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`visitorController.js`](../controllers/visitorController.md)
  - [`visitorProfileController.js`](../controllers/visitorProfileController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/visitors` (assuming `/visitors` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing visitor routes are logged in. (Specific authorization might be handled within controllers).

## Routes

**Visitor Profiles**

- `GET /profiles`:
  - Retrieves visitor profiles.
  - Controller: [`getVisitorProfiles`](../controllers/visitorProfileController.md#getvisitorprofilesreq-res)
- `POST /profiles`:
  - Creates a new visitor profile.
  - Controller: [`createVisitorProfile`](../controllers/visitorProfileController.md#createvisitorprofilereq-res)
- `PUT /profiles/:visitorId`:
  - Updates an existing visitor profile.
  - Controller: [`updateVisitorProfile`](../controllers/visitorProfileController.md#updatevisitorprofilereq-res)
- `DELETE /profiles/:visitorId`:
  - Deletes a visitor profile.
  - Controller: [`deleteVisitorProfile`](../controllers/visitorProfileController.md#deletevisitorprofilereq-res)

**Visitor Requests**

- `GET /requests/summary`:
  - Retrieves a summary or list of visitor requests.
  - Controller: [`getVisitorRequests`](../controllers/visitorController.md#getvisitorrequestsreq-res)
- `GET /requests/student/:userId`:
  - Retrieves visitor requests associated with a specific student.
  - Controller: [`getStudentVisitorRequests`](../controllers/visitorController.md#getstudentvisitorrequestsreq-res)
- `GET /requests/:requestId`:
  - Retrieves details of a specific visitor request.
  - Controller: [`getVisitorRequestById`](../controllers/visitorController.md#getvisitorrequestbyidreq-res)
- `POST /requests`:
  - Creates a new visitor request.
  - Controller: [`createVisitorRequest`](../controllers/visitorController.md#createvisitorrequestreq-res)
- `PUT /requests/:requestId`:
  - Updates an existing visitor request.
  - Controller: [`updateVisitorRequest`](../controllers/visitorController.md#updatevisitorrequestreq-res)
- `DELETE /requests/:requestId`:
  - Deletes a visitor request.
  - Controller: [`deleteVisitorRequest`](../controllers/visitorController.md#deletevisitorrequestreq-res)
- `POST /requests/:requestId/:action`: _(e.g., `/requests/123/approve`)_
  - Updates the status of a visitor request (approve, reject, etc.).
  - Controller: [`updateVisitorRequestStatus`](../controllers/visitorController.md#updatevisitorrequeststatusreq-res)

**Visitor Request Management (Allocation & Check-in/out)**

- `POST /requests/:requestId/allocate`:
  - Allocates rooms to a visitor request.
  - Controller: [`allocateRoomsToVisitorRequest`](../controllers/visitorController.md#allocateroomstovisitorrequestreq-res)
- `POST /requests/:requestId/checkin`:
  - Checks in a visitor for a specific request.
  - Controller: [`checkInVisitor`](../controllers/visitorController.md#checkinvisitorreq-res)
- `POST /requests/:requestId/checkout`:
  - Checks out a visitor for a specific request.
  - Controller: [`checkOutVisitor`](../controllers/visitorController.md#checkoutvisitorreq-res)
- `PUT /requests/:requestId/update-check-times`:
  - Updates the check-in/check-out times for a visitor request.
  - Controller: [`updateCheckTime`](../controllers/visitorController.md#updatechecktimereq-res)
