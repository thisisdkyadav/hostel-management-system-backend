# Hostel Routes (`/routes/hostelRoutes.js`)

Defines API routes for managing hostel structure (units, rooms), room allocations, and room change requests.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`hostelController.js`](../controllers/hostelController.md)
  - [`studentController.js`](../controllers/studentController.md) (for `updateRoomAllocations`)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/hostels` (assuming `/hostels` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing these routes are logged in.

## Routes

**Units & Rooms**

- `GET /units/:hostelId`:
  - Retrieves units for a specific hostel.
  - Controller: [`getUnits`](../controllers/hostelController.md#getunitsreq-res)
- `GET /rooms/:unitId`:
  - Retrieves rooms within a specific unit.
  - Controller: [`getRoomsByUnit`](../controllers/hostelController.md#getroomsbyunitreq-res)
- `GET /rooms-room-only`:
  - Retrieves a list of all rooms (potentially simplified).
  - Controller: [`getRooms`](../controllers/hostelController.md#getroomsreq-res)
- `GET /rooms/:hostelId/edit`:
  - Retrieves room data formatted for editing for a specific hostel.
  - Controller: [`getRoomsForEdit`](../controllers/hostelController.md#getroomsforeditreq-res)
- `POST /rooms/:hostelId/add`:
  - Adds new rooms to a specific hostel.
  - Controller: [`addRooms`](../controllers/hostelController.md#addroomsreq-res)
- `PUT /rooms/:hostelId/bulk-update`:
  - Performs bulk updates on rooms within a specific hostel.
  - Controller: [`bulkUpdateRooms`](../controllers/hostelController.md#bulkupdateroomsreq-res)
- `PUT /rooms/:hostelId/:roomId`:
  - Updates a specific room within a specific hostel.
  - Controller: [`updateRoom`](../controllers/hostelController.md#updateroomreq-res)
- `PUT /rooms/:roomId/status`:
  - Updates the status of a specific room.
  - Controller: [`updateRoomStatus`](../controllers/hostelController.md#updateroomstatusreq-res)

**Allocations**

- `POST /allocate`:
  - Creates a new room allocation.
  - Controller: [`allocateRoom`](../controllers/hostelController.md#allocateroomreq-res)
- `DELETE /deallocate/:allocationId`:
  - Deletes/removes a specific room allocation.
  - Controller: [`deleteAllocation`](../controllers/hostelController.md#deleteallocationreq-res)
- `PUT /update-allocations/:hostelId`: _(Controller from `studentController.js`)_
  - Performs updates on multiple room allocations for a specific hostel.
  - Controller: [`updateRoomAllocations`](../controllers/studentController.md#updateroomallocationsreq-res)

**Room Change Requests**

- `GET /room-change-requests/:hostelId`:
  - Retrieves room change requests for a specific hostel.
  - Controller: [`getRoomChangeRequests`](../controllers/hostelController.md#getroomchangerequestsreq-res)
- `GET /room-change-request/:requestId`:
  - Retrieves details of a specific room change request.
  - Controller: [`getRoomChangeRequestById`](../controllers/hostelController.md#getroomchangerequestbyidreq-res)
- `PUT /room-change-request/approve/:requestId`:
  - Approves a specific room change request.
  - Controller: [`approveRoomChangeRequest`](../controllers/hostelController.md#approveroomchangerequestreq-res)
- `PUT /room-change-request/reject/:requestId`:
  - Rejects a specific room change request.
  - Controller: [`rejectRoomChangeRequest`](../controllers/hostelController.md#rejectroomchangerequestreq-res)
