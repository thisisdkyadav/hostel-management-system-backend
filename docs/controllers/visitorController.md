# Visitor Controller (`controllers/visitorController.js`)

Handles the workflow for student visitor requests, including creation, approval/rejection, room allocation, and check-in/out.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/VisitorRequest.js`](../models/VisitorRequest.md): Mongoose model for Visitor Requests.
- [`../models/VisitorProfile.js`](../models/VisitorProfile.md): Mongoose model for Visitor Profiles.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/Hostel.js`](../models/Hostel.md): Mongoose model for Hostels.
- [`../models/Room.js`](../models/Room.md): Mongoose model for Rooms (including guest rooms).
- [`../models/Unit.js`](../models/Unit.md): Mongoose model for Units (if applicable).
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features (likely used in `getVisitorRequests`).

## Functions

### `createVisitorRequest(req, res)`

- **Description:** Allows an authenticated student ([`User`](../models/User.md)) to submit a request for one or more visitors ([`VisitorProfile`](../models/VisitorProfile.md)) to stay.
- **Method:** `POST`
- **Authentication:** Requires student role authentication.
- **Body:**
  - `visitors` (Array<Object>, required): Array of [`VisitorProfile`](../models/VisitorProfile.md) IDs or potentially new visitor data to create profiles.
  - `reason` (String, required): Reason for the visit.
  - `fromDate` (Date, required): Start date of the visit.
  - `toDate` (Date, required): End date of the visit.
- **Returns:**
  - `201 Created`: Request submitted successfully. Returns the created [`VisitorRequest`](../models/VisitorRequest.md) object.
  - `500 Internal Server Error`: Error during submission (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getVisitorRequests(req, res)`

- **Description:** Retrieves [`VisitorRequest`](../models/VisitorRequest.md)s. Behavior depends on the authenticated user's role ([`User`](../models/User.md)):
  - Student: Retrieves their own requests.
  - Staff (with `user.hostel`): Retrieves requests associated with their assigned [`Hostel`](../models/Hostel.md).
- **Method:** `GET`
- **Authentication:** Requires authentication. Role determines filtering.
- **Returns:**
  - `200 OK`: Returns an array of formatted [`VisitorRequest`](../models/VisitorRequest.md) objects, including visitor count, names, allocation status, and student details ([`User`](../models/User.md), [`VisitorProfile`](../models/VisitorProfile.md)).
  - `500 Internal Server Error`: Error fetching requests (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getVisitorRequestById(req, res)`

- **Description:** Retrieves detailed information about a single [`VisitorRequest`](../models/VisitorRequest.md), including student details ([`User`](../models/User.md)), visitor profiles ([`VisitorProfile`](../models/VisitorProfile.md)), allocated room details ([`Room`](../models/Room.md), [`Unit`](../models/Unit.md) if applicable), hostel assignment ([`Hostel`](../models/Hostel.md)), and check-in/out times.
- **Method:** `GET`
- **Params:**
  - `requestId` (String, required): The ID of the [`VisitorRequest`](../models/VisitorRequest.md).
- **Returns:**
  - `200 OK`: Returns the detailed, formatted [`VisitorRequest`](../models/VisitorRequest.md) object.
  - `404 Not Found`: Visitor request not found.
  - `500 Internal Server Error`: Error fetching request details (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateVisitorRequest(req, res)`

- **Description:** Allows a student ([`User`](../models/User.md)) to update their own _pending_ [`VisitorRequest`](../models/VisitorRequest.md) (reason, dates).
- **Method:** `PUT`
- **Authentication:** Requires student role authentication (implicitly checks if the request belongs to the user).
- **Params:**
  - `requestId` (String, required): The ID of the [`VisitorRequest`](../models/VisitorRequest.md) to update.
- **Body:**
  - `reason` (String, optional): Updated reason.
  - `fromDate` (Date, optional): Updated start date.
  - `toDate` (Date, optional): Updated end date.
- **Returns:**
  - `200 OK`: Request updated successfully. Returns the updated [`VisitorRequest`](../models/VisitorRequest.md) object.
  - `400 Bad Request`: Request is not in 'Pending' status.
  - `404 Not Found`: Visitor request not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteVisitorRequest(req, res)`

- **Description:** Allows a student ([`User`](../models/User.md)) to delete their own [`VisitorRequest`](../models/VisitorRequest.md) (presumably only if pending, although not explicitly checked here).
- **Method:** `DELETE`
- **Authentication:** Requires student role authentication (implicitly checks ownership).
- **Params:**
  - `requestId` (String, required): The ID of the [`VisitorRequest`](../models/VisitorRequest.md) to delete.
- **Returns:**
  - `200 OK`: Request deleted successfully.
  - `404 Not Found`: Visitor request not found.
  - `500 Internal Server Error`: Error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateVisitorRequestStatus(req, res)`

- **Description:** Allows authorized staff (e.g., Warden) to approve or reject a pending [`VisitorRequest`](../models/VisitorRequest.md).
- **Method:** `PUT`
- **Authentication:** Requires staff role authentication.
- **Params:**
  - `requestId` (String, required): The ID of the [`VisitorRequest`](../models/VisitorRequest.md).
  - `action` (String, required): Must be either 'approve' or 'reject'.
- **Body:**
  - `reason` (String, optional): Required if `action` is 'reject'. Reason for rejection.
  - `hostelId` (String, optional): Required if `action` is 'approve'. The ID of the [`Hostel`](../models/Hostel.md) where the visitor will stay.
- **Returns:**
  - `200 OK`: Status updated successfully. Returns the updated [`VisitorRequest`](../models/VisitorRequest.md) object.
  - `400 Bad Request`: Invalid action specified.
  - `404 Not Found`: Visitor request not found.
  - `500 Internal Server Error`: Error updating status (handled by [`errorHandler`](../utils/errorHandler.md)).

### `allocateRoomsToVisitorRequest(req, res)`

- **Description:** Allows authorized staff (e.g., Warden associated with the [`Hostel`](../models/Hostel.md)) to allocate specific vacant guest [`Room`](../models/Room.md)(s) to an approved [`VisitorRequest`](../models/VisitorRequest.md).
- **Method:** `POST`
- **Authentication:** Requires staff role with `user.hostel`.
- **Params:**
  - `requestId` (String, required): The ID of the _approved_ [`VisitorRequest`](../models/VisitorRequest.md).
- **Body:**
  - `allocationData` (Array<Array<String>>, required): An array of room identifiers. Each inner array represents a [`Room`](../models/Room.md), typically `[roomNumber]` or `[roomNumber, unitNumber]` for [`Unit`](../models/Unit.md)-based hostels.
- **Returns:**
  - `200 OK`: Rooms allocated successfully. Returns the updated [`VisitorRequest`](../models/VisitorRequest.md) object with `allocatedRooms` populated.
  - `404 Not Found`: Request, specified [`Unit`](../models/Unit.md), or specified [`Room`](../models/Room.md) not found.
  - `400 Bad Request`: Specified [`Room`](../models/Room.md) is already occupied by a student.
  - `500 Internal Server Error`: Error during allocation (transaction rolled back, handled by [`errorHandler`](../utils/errorHandler.md)).

### `checkInVisitor(req, res)`

- **Description:** Records the check-in time for an approved and allocated [`VisitorRequest`](../models/VisitorRequest.md). Typically performed by security.
- **Method:** `POST`
- **Authentication:** Requires staff/security role authentication.
- **Params:**
  - `requestId` (String, required): The ID of the [`VisitorRequest`](../models/VisitorRequest.md).
- **Body:**
  - `checkInTime` (Date, required): The date and time of check-in.
  - `notes` (String, optional): Security notes related to the check-in.
- **Returns:**
  - `200 OK`: Check-in successful. Returns the updated [`VisitorRequest`](../models/VisitorRequest.md) object.
  - `404 Not Found`: Visitor request not found.
  - `500 Internal Server Error`: Error during check-in (transaction rolled back, handled by [`errorHandler`](../utils/errorHandler.md)).

### `checkOutVisitor(req, res)`

- **Description:** Records the check-out time for a [`VisitorRequest`](../models/VisitorRequest.md). Typically performed by security.
- **Method:** `POST`
- **Authentication:** Requires staff/security role authentication.
- **Params:**
  - `requestId` (String, required): The ID of the [`VisitorRequest`](../models/VisitorRequest.md).
- **Body:**
  - `checkOutTime` (Date, required): The date and time of check-out.
  - `notes` (String, optional): Security notes related to the check-out.
- **Returns:**
  - `200 OK`: Check-out successful. Returns the updated [`VisitorRequest`](../models/VisitorRequest.md) object.
  - `404 Not Found`: Visitor request not found.
  - `500 Internal Server Error`: Error during check-out (transaction rolled back, handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateCheckTime(req, res)`

- **Description:** Allows staff to manually update the check-in and/or check-out times and security notes for a [`VisitorRequest`](../models/VisitorRequest.md) after the fact.
- **Method:** `PUT`
- **Authentication:** Requires staff/security role authentication.
- **Params:**
  - `requestId` (String, required): The ID of the [`VisitorRequest`](../models/VisitorRequest.md).
- **Body:**
  - `checkInTime` (Date, optional): Updated check-in time.
  - `checkOutTime` (Date, optional): Updated check-out time.
  - `notes` (String, optional): Updated security notes.
- **Returns:**
  - `200 OK`: Times/notes updated successfully. Returns the updated [`VisitorRequest`](../models/VisitorRequest.md) object.
  - `404 Not Found`: Visitor request not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudentVisitorRequests(req, res)`

- **Description:** Retrieves all [`VisitorRequest`](../models/VisitorRequest.md)s submitted by a specific student, identified by their User ID ([`User`](../models/User.md)).
- **Method:** `GET`
- **Params:**
  - `userId` (String, required): The [`User`](../models/User.md) ID of the student.
- **Returns:**
  - `200 OK`: Returns an array of formatted [`VisitorRequest`](../models/VisitorRequest.md)s for the specified student.
  - `500 Internal Server Error`: Error fetching requests (handled by [`errorHandler`](../utils/errorHandler.md)).
