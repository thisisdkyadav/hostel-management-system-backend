# Hostel Controller (`controllers/hostelController.js`)

This controller manages all aspects of hostels, including their structure (units, rooms), allocations, and change requests.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Hostel.js`](../models/Hostel.md): Mongoose model for Hostels.
- [`../models/Unit.js`](../models/Unit.md): Mongoose model for Units.
- [`../models/Room.js`](../models/Room.md): Mongoose model for Rooms.
- [`../models/RoomAllocation.js`](../models/RoomAllocation.md): Mongoose model for Room Allocations.
- [`../models/StudentProfile.js`](../models/StudentProfile.md): Mongoose model for Student Profiles.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/RoomChangeRequest.js`](../models/RoomChangeRequest.md): Mongoose model for Room Change Requests.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features (pagination).
- [`xlsx`](https://www.npmjs.com/package/xlsx): Library for parsing Excel files (likely for bulk operations, though not explicitly shown in functions here).

## Helper Functions (Internal)

- `createUnits(hostelId, units, session)`: Internal helper to create multiple [`Unit`](../models/Unit.md) documents within a transaction.
- `createRooms(hostelId, rooms, createdUnits, type, session)`: Internal helper to create multiple [`Room`](../models/Room.md) documents, potentially linking them to units ([`Unit`](../models/Unit.md)), within a transaction.

## Exported Functions

### `addHostel(req, res)`

- **Description:** Creates a new [`Hostel`](../models/Hostel.md), optionally defining its initial units ([`Unit`](../models/Unit.md)) and rooms ([`Room`](../models/Room.md)) in the same request.
- **Method:** `POST`
- **Body:**
  - `name` (String, required): Name of the hostel.
  - `gender` (String, required): Gender the hostel accommodates (e.g., 'Male', 'Female', 'Co-ed').
  - `type` (String, required): Type of hostel ('unit-based' or other type, e.g., 'dormitory').
  - `units` (Array<Object>, optional): Required if `type` is 'unit-based'. Array of unit objects:
    - `unitNumber` (String, required): Identifier for the unit (e.g., 'A', 'B').
    - `floor` (Number, optional): Floor number. Defaults based on `unitNumber` or 0.
    - `commonAreaDetails` (String, optional): Description of common areas.
  - `rooms` (Array<Object>, optional): Array of room objects:
    - `unitNumber` (String, optional): Required if `type` is 'unit-based'. The unit this room belongs to.
    - `roomNumber` (String, required): Identifier for the room.
    - `capacity` (Number, required): Maximum number of occupants.
- **Returns:**
  - `201 Created`: Hostel added successfully. Returns basic [`Hostel`](../models/Hostel.md) info, total units, and total rooms created.
  - `400 Bad Request`: Missing required fields, or duplicate hostel name, unit number, or room number detected.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getHostels(req, res)`

- **Description:** Retrieves a list of all [`Hostel`](../models/Hostel.md)s, along with aggregated statistics for each (room counts, capacity, occupancy rate, pending maintenance issues).
- **Method:** `GET`
- **Returns:**
  - `200 OK`: Returns an array of [`Hostel`](../models/Hostel.md) objects with statistics.
  - `500 Internal Server Error`: Error fetching hostels (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateHostel(req, res)`

- **Description:** Updates the name and/or gender of a specific [`Hostel`](../models/Hostel.md).
- **Method:** `PUT`
- **Params:**
  - `id` (String, required): The ID of the [`Hostel`](../models/Hostel.md) to update.
- **Body:**
  - `name` (String, optional): New name for the hostel.
  - `gender` (String, optional): New gender designation.
- **Returns:**
  - `200 OK`: Returns the updated [`Hostel`](../models/Hostel.md) object.
  - `404 Not Found`: Hostel not found.
  - `500 Internal Server Error`: Error updating hostel (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getHostelList(req, res)`

- **Description:** Retrieves a simplified list of [`Hostel`](../models/Hostel.md)s (ID, name, type), suitable for populating UI elements like dropdowns.
- **Method:** `GET`
- **Returns:**
  - `200 OK`: Returns an array of simple [`Hostel`](../models/Hostel.md) objects.
  - `500 Internal Server Error`: Error fetching hostel list (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getUnits(req, res)`

- **Description:** Retrieves all [`Unit`](../models/Unit.md)s belonging to a specific [`Hostel`](../models/Hostel.md), including aggregated stats (room count, capacity, occupancy).
- **Method:** `GET`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) whose units are requested.
- **Authentication:** Checks if the requesting user ([`User`](../models/User.md)) has permission for this `hostelId` if applicable (e.g., Warden).
- **Returns:**
  - `200 OK`: Returns an array of [`Unit`](../models/Unit.md) objects with stats.
  - `403 Forbidden`: User does not have permission to access this hostel's units.
  - `500 Internal Server Error`: Error fetching units (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRoomsByUnit(req, res)`

- **Description:** Retrieves all [`Room`](../models/Room.md)s within a specific [`Unit`](../models/Unit.md), populated with details of allocated students ([`StudentProfile`](../models/StudentProfile.md)).
- **Method:** `GET`
- **Params:**
  - `unitId` (String, required): The ID of the [`Unit`](../models/Unit.md) whose rooms are requested.
- **Authentication:** Checks if the requesting user ([`User`](../models/User.md)) has permission for the [`Hostel`](../models/Hostel.md) this unit belongs to.
- **Returns:**
  - `200 OK`: Returns an object containing `data` (array of [`Room`](../models/Room.md) objects with student details) and `meta` (total count).
  - `403 Forbidden`: User does not have permission to access this unit's rooms.
  - `500 Internal Server Error`: Error fetching rooms (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRooms(req, res)`

- **Description:** Retrieves all [`Room`](../models/Room.md)s within a specific [`Hostel`](../models/Hostel.md) (specified by query parameter), populated with details of allocated students ([`StudentProfile`](../models/StudentProfile.md)).
- **Method:** `GET`
- **Query Parameters:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) whose rooms are requested.
- **Authentication:** Checks if the requesting user ([`User`](../models/User.md)) has permission for this `hostelId`.
- **Returns:**
  - `200 OK`: Returns an object containing `data` (array of [`Room`](../models/Room.md) objects with student details) and `meta` (total count).
  - `403 Forbidden`: User does not have permission to access this hostel's rooms.
  - `500 Internal Server Error`: Error fetching rooms (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateRoomStatus(req, res)`

- **Description:** Sets the status of a [`Room`](../models/Room.md) to 'Active' or 'Inactive'. If setting to 'Inactive', automatically deallocates any students ([`RoomAllocation`](../models/RoomAllocation.md)) currently assigned to it.
- **Method:** `PUT`
- **Params:**
  - `roomId` (String, required): The ID of the [`Room`](../models/Room.md) to update.
- **Body:**
  - `status` (String, required): The new status ('Active' or 'Inactive').
- **Returns:**
  - `200 OK`: Room status updated successfully. Returns the updated [`Room`](../models/Room.md) object.
  - `400 Bad Request`: Invalid status value provided.
  - `404 Not Found`: Room not found.
  - `500 Internal Server Error`: Error updating room status (handled by [`errorHandler`](../utils/errorHandler.md)).

### `allocateRoom(req, res)`

- **Description:** Allocates a specific bed within a [`Room`](../models/Room.md) to a student ([`StudentProfile`](../models/StudentProfile.md)) by creating a [`RoomAllocation`](../models/RoomAllocation.md) record.
- **Method:** `POST`
- **Body:**
  - `roomId` (String, required): ID of the [`Room`](../models/Room.md).
  - `hostelId` (String, required): ID of the [`Hostel`](../models/Hostel.md).
  - `unitId` (String, optional): Required if the hostel is 'unit-based' ([`Unit`](../models/Unit.md)).
  - `studentId` (String, required): The [`StudentProfile`](../models/StudentProfile.md) ID of the student.
  - `bedNumber` (Number, required): The bed number to allocate.
  - `userId` (String, required): The [`User`](../models/User.md) ID of the student.
- **Returns:**
  - `200 OK`: Room allocated successfully. Returns the new [`RoomAllocation`](../models/RoomAllocation.md) object.
  - `400 Bad Request`: Missing fields, invalid `unitId` for hostel type, room inactive, room full, invalid bed number, bed already occupied, or student already allocated.
  - `404 Not Found`: [`Hostel`](../models/Hostel.md) or [`Room`](../models/Room.md) not found.
  - `500 Internal Server Error`: Error during allocation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteAllocation(req, res)`

- **Description:** Deletes a specific [`RoomAllocation`](../models/RoomAllocation.md) record, effectively removing a student from a room.
- **Method:** `DELETE`
- **Params:**
  - `allocationId` (String, required): The ID of the [`RoomAllocation`](../models/RoomAllocation.md) record to delete.
- **Returns:**
  - `200 OK`: Allocation deleted successfully.
  - `404 Not Found`: Allocation record not found.
  - `500 Internal Server Error`: Error deleting allocation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRoomChangeRequests(req, res)`

- **Description:** Retrieves a paginated list of [`RoomChangeRequest`](../models/RoomChangeRequest.md)s for a specific [`Hostel`](../models/Hostel.md), filterable by status.
- **Method:** `GET`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md).
- **Query Parameters:** Handled by [`APIFeatures`](../utils/apiFeatures.md)
- **Returns:**
  - `200 OK`: Returns an object with `data` (array of [`RoomChangeRequest`](../models/RoomChangeRequest.md) objects) and `meta` (pagination details).
  - `500 Internal Server Error`: Error fetching requests (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRoomChangeRequestById(req, res)`

- **Description:** Retrieves detailed information about a single [`RoomChangeRequest`](../models/RoomChangeRequest.md), including student info ([`StudentProfile`](../models/StudentProfile.md)), current/requested room details ([`Room`](../models/Room.md)), and details of occupants in the requested room.
- **Method:** `GET`
- **Params:**
  - `requestId` (String, required): The ID of the [`RoomChangeRequest`](../models/RoomChangeRequest.md).
- **Returns:**
  - `200 OK`: Returns the detailed [`RoomChangeRequest`](../models/RoomChangeRequest.md) object.
  - `404 Not Found`: Request not found.
  - `500 Internal Server Error`: Error fetching request details (handled by [`errorHandler`](../utils/errorHandler.md)).

### `approveRoomChangeRequest(req, res)`

- **Description:** Approves a 'Pending' [`RoomChangeRequest`](../models/RoomChangeRequest.md). Updates the student's existing [`RoomAllocation`](../models/RoomAllocation.md) record to point to the new [`Room`](../models/Room.md) and assigned bed number.
- **Method:** `POST`
- **Params:**
  - `requestId` (String, required): The ID of the [`RoomChangeRequest`](../models/RoomChangeRequest.md) to approve.
- **Body:**
  - `bedNumber` (Number, required): The specific bed number assigned in the requested room.
- **Returns:**
  - `200 OK`: Request approved successfully. Returns details of the approved [`RoomChangeRequest`](../models/RoomChangeRequest.md) and new [`RoomAllocation`](../models/RoomAllocation.md).
  - `400 Bad Request`: Request already processed, requested room is full, bed number missing, or requested bed is occupied.
  - `404 Not Found`: Request or requested [`Room`](../models/Room.md) not found.
  - `500 Internal Server Error`: Failed to update allocation or save request status (handled by [`errorHandler`](../utils/errorHandler.md)).

### `rejectRoomChangeRequest(req, res)`

- **Description:** Rejects a 'Pending' [`RoomChangeRequest`](../models/RoomChangeRequest.md) and records the reason.
- **Method:** `POST`
- **Params:**
  - `requestId` (String, required): The ID of the [`RoomChangeRequest`](../models/RoomChangeRequest.md) to reject.
- **Body:**
  - `reason` (String, required): The reason for rejecting the request.
- **Returns:**
  - `200 OK`: Request rejected successfully. Returns details of the rejected [`RoomChangeRequest`](../models/RoomChangeRequest.md).
  - `400 Bad Request`: Request already processed.
  - `404 Not Found`: Request not found.
  - `500 Internal Server Error`: Error updating request status (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRoomsForEdit(req, res)`

- **Description:** Retrieves a simplified list of [`Room`](../models/Room.md)s for a specific [`Hostel`](../models/Hostel.md), intended for bulk editing interfaces.
- **Method:** `GET`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md).
- **Returns:**
  - `200 OK`: Returns an object with `data` (array of simplified [`Room`](../models/Room.md) objects: id, unitNumber, roomNumber, capacity, status) and `meta`.
  - `500 Internal Server Error`: Error fetching room details (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateRoom(req, res)`

- **Description:** Updates the capacity and/or status of a single [`Room`](../models/Room.md).
- **Method:** `PUT`
- **Params:**
  - `roomId` (String, required): The ID of the [`Room`](../models/Room.md) to update.
- **Body:**
  - `capacity` (Number, optional): New capacity for the room.
  - `status` (String, optional): New status ('Active' or 'Inactive'). Note: Use `updateRoomStatus` for deallocation logic.
- **Returns:**
  - `200 OK`: Room updated successfully. Returns the updated [`Room`](../models/Room.md) object.
  - `404 Not Found`: Room not found.
  - `500 Internal Server Error`: Error updating room (handled by [`errorHandler`](../utils/errorHandler.md)).

### `addRooms(req, res)`

- **Description:** Adds multiple new [`Room`](../models/Room.md)s (and potentially new [`Unit`](../models/Unit.md)s if specified and not existing) to an existing [`Hostel`](../models/Hostel.md).
- **Method:** `POST`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) to add rooms to.
- **Body:**
  - `units` (Array<Object>, optional): Array of unit objects to potentially create (uses `createUnits` helper).
    - `unitNumber` (String, required)
    - ... other unit fields
  - `rooms` (Array<Object>, required): Array of room objects to create (uses `createRooms` helper).
    - `unitNumber` (String, optional): Required for unit-based hostels.
    - `roomNumber` (String, required)
    - `capacity` (Number, required)
- **Returns:**
  - `200 OK`: Rooms added successfully.
  - `404 Not Found`: [`Hostel`](../models/Hostel.md) not found.
  - `500 Internal Server Error`: Error adding rooms/units (handled by [`errorHandler`](../utils/errorHandler.md)).

### `bulkUpdateRooms(req, res)`

- **Description:** Performs bulk updates on multiple [`Room`](../models/Room.md)s within a [`Hostel`](../models/Hostel.md), handling status changes (activation/deactivation with [`RoomAllocation`](../models/RoomAllocation.md) cleanup) and capacity updates for active rooms.
- **Method:** `POST`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md).
- **Body:**
  - `rooms` (Array<Object>, required): Array of room update objects.
    - `unitNumber` (String, required): Unit number of the room.
    - `roomNumber` (String, required): Room number.
    - `status` (String, optional): New status ('Active' or 'Inactive').
    - `capacity` (Number, optional): New capacity (only applied if status is 'Active' or not changing from 'Active').
- **Returns:**
  - `200 OK`: Rooms updated successfully (or no updates needed). Returns IDs of updated [`Room`](../models/Room.md)s.
  - `404 Not Found`: [`Hostel`](../models/Hostel.md) or specified units not found.
  - `500 Internal Server Error`: Error during bulk update (handled by [`errorHandler`](../utils/errorHandler.md)).
