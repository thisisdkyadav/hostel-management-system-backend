# Security Controller (`controllers/securityController.js`)

This controller handles endpoints typically used by security personnel, focusing on student entry/exit tracking, visitor management, and QR code verification within their assigned hostel.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Security.js`](../models/Security.md): For security staff profiles.
- [`../models/User.js`](../models/User.md): For user details (students, staff).
- [`../models/Hostel.js`](../models/Hostel.md): For hostel information.
- [`../models/StudentProfile.js`](../models/StudentProfile.md): For student details and linking to allocations.
- [`../models/RoomAllocation.js`](../models/RoomAllocation.md): For finding student room/unit details.
- [`../models/CheckInOut.js`](../models/CheckInOut.md): For recording and retrieving student entry/exit logs.
- [`../models/Visitor.js`](../models/Visitor.md): Mongoose model for ad-hoc visitor entries (distinct from `VisitorRequest` workflow).
- [`../models/Room.js`](../models/Room.md): For room details.
- [`../models/Unit.js`](../models/Unit.md): For unit details.
- [`../utils/qrUtils.js`](../utils/qrUtils.md): Provides `decryptData` for QR code verification.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features (pagination, searching).

## Functions

### `getSecurity(req, res)`

- **Description:** Retrieves the profile details of the currently authenticated security user ([`User`](../models/User.md)), including their assigned [`Hostel`](../models/Hostel.md) information via the [`Security`](../models/Security.md) model.
- **Method:** `GET`
- **Authentication:** Requires security role authentication.
- **Returns:**
  - `200 OK`: Returns an object containing the security user's details and hostel assignment.
  - `404 Not Found`: [`Security`](../models/Security.md) profile not found for the authenticated user.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `addStudentEntry(req, res)`

- **Description:** Manually records a student check-in or check-out event ([`CheckInOut`](../models/CheckInOut.md)) based on their room details. Finds the student's [`User`](../models/User.md) ID via [`RoomAllocation`](../models/RoomAllocation.md).
- **Method:** `POST`
- **Body:**
  - `hostelId` (String, required): ID of the [`Hostel`](../models/Hostel.md).
  - `unit` (String, required for unit-based hostels): [`Unit`](../models/Unit.md) number.
  - `room` (String, required): [`Room`](../models/Room.md) number.
  - `bed` (Number, required): Bed number.
  - `date` (String, optional): Date of the event (e.g., "YYYY-MM-DD"). Defaults to current date if not provided.
  - `time` (String, optional): Time of the event (e.g., "HH:MM"). Defaults to current time if not provided.
  - `status` (String, required): Status, typically 'Checked In' or 'Checked Out'.
- **Returns:**
  - `201 Created`: Entry added successfully. Returns the created [`CheckInOut`](../models/CheckInOut.md) record.
  - `404 Not Found`: [`Unit`](../models/Unit.md), [`Room`](../models/Room.md), or [`RoomAllocation`](../models/RoomAllocation.md) not found for the provided details.
  - `500 Internal Server Error`: Server error during entry creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `addStudentEntryWithEmail(req, res)`

- **Description:** Records a student check-in or check-out event ([`CheckInOut`](../models/CheckInOut.md)) based on the student's email address ([`User`](../models/User.md)). Automatically determines [`Hostel`](../models/Hostel.md)/[`Room`](../models/Room.md) details from the student's current [`RoomAllocation`](../models/RoomAllocation.md).
- **Method:** `POST`
- **Body:**
  - `email` (String, required): Email address of the student.
  - `status` (String, required): Status, typically 'Checked In' or 'Checked Out'.
- **Returns:**
  - `201 Created`: Entry added successfully. Returns the created [`CheckInOut`](../models/CheckInOut.md) record.
  - `404 Not Found`: [`User`](../models/User.md) or their [`RoomAllocation`](../models/RoomAllocation.md) not found.
  - `500 Internal Server Error`: Server error during entry creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRecentEntries(req, res)`

- **Description:** Retrieves the 10 most recent check-in/out entries ([`CheckInOut`](../models/CheckInOut.md)) for the [`Hostel`](../models/Hostel.md) assigned to the authenticated security user.
- **Method:** `GET`
- **Authentication:** Requires security (or potentially other staff) role authentication with an assigned hostel.
- **Returns:**
  - `200 OK`: Returns an array of the 10 most recent [`CheckInOut`](../models/CheckInOut.md) records, populated with [`User`](../models/User.md) details.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudentEntries(req, res)`

- **Description:** Retrieves a paginated and filterable list of student check-in/out entries ([`CheckInOut`](../models/CheckInOut.md)). Filters based on the authenticated [`User`](../models/User.md)'s role and [`Hostel`](../models/Hostel.md) assignment.
- **Method:** `GET`
- **Authentication:** Requires authenticated user. Behavior varies by role:
  - Student: Sees only their own entries.
  - Admin/Warden/Associate Warden/Security: Can filter by `userId`, results restricted to their assigned [`Hostel`](../models/Hostel.md) (if applicable).
- **Query Parameters:** Handled by [`APIFeatures`](../utils/apiFeatures.md)
  - `userId` (String, optional): Filter by specific student [`User`](../models/User.md) ID (for staff roles).
  - `status` (String, optional): Filter by status ('Checked In', 'Checked Out').
  - `date` (String, optional): Filter entries on or after this date (YYYY-MM-DD).
  - `search` (String, optional): Search term matching user ([`User`](../models/User.md)) name, email, [`Room`](../models/Room.md), [`Unit`](../models/Unit.md), or bed.
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Returns:**
  - `200 OK`: Returns an object containing `studentEntries` (array of [`CheckInOut`](../models/CheckInOut.md) records) and `meta` (pagination details).
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateStudentEntry(req, res)`

- **Description:** Updates the details of an existing student check-in/out record ([`CheckInOut`](../models/CheckInOut.md)).
- **Method:** `PUT`
- **Params:**
  - `entryId` (String, required): The ID of the [`CheckInOut`](../models/CheckInOut.md) record to update.
- **Body:** Contains fields to update:
  - `unit`, `room`, `bed`, `date`, `time`, `status` (as defined in `addStudentEntry`).
- **Returns:**
  - `200 OK`: Entry updated successfully. Returns the updated [`CheckInOut`](../models/CheckInOut.md) record.
  - `404 Not Found`: Entry record not found.
  - `500 Internal Server Error`: Server error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `addVisitor(req, res)`

- **Description:** Records a new visitor entry ([`Visitor`](../models/Visitor.md)) for the [`Hostel`](../models/Hostel.md) assigned to the authenticated security user ([`Security`](../models/Security.md)). Note: This seems to be for ad-hoc visitors, separate from the `VisitorRequest` flow.
- **Method:** `POST`
- **Authentication:** Requires security role authentication.
- **Body:**
  - `name` (String, required): Visitor's name.
  - `phone` (String, required): Visitor's phone number.
  - `room` (String, required): [`Room`](../models/Room.md) the visitor is visiting.
- **Returns:**
  - `201 Created`: Visitor added successfully. Returns the created [`Visitor`](../models/Visitor.md) record.
  - `404 Not Found`: Authenticated security user ([`User`](../models/User.md) + [`Security`](../models/Security.md)) or their hostel assignment not found.
  - `500 Internal Server Error`: Server error during visitor creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getVisitors(req, res)`

- **Description:** Retrieves all ad-hoc visitor records ([`Visitor`](../models/Visitor.md)) for the [`Hostel`](../models/Hostel.md) assigned to the authenticated security, warden, or associate warden user.
- **Method:** `GET`
- **Authentication:** Requires Security, Warden, or Associate Warden role.
- **Returns:**
  - `200 OK`: Returns an array of [`Visitor`](../models/Visitor.md) records for the user's hostel.
  - `403 Forbidden`: User role does not have permission.
  - `404 Not Found`: User's [`Hostel`](../models/Hostel.md) assignment not found.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateVisitor(req, res)`

- **Description:** Updates the details of an existing ad-hoc visitor record ([`Visitor`](../models/Visitor.md)).
- **Method:** `PUT`
- **Params:**
  - `visitorId` (String, required): The ID of the [`Visitor`](../models/Visitor.md) record to update.
- **Body:** Contains fields to update:
  - `name`, `phone`, `DateTime`, `room`, `status`.
- **Returns:**
  - `200 OK`: Visitor updated successfully. Returns the updated [`Visitor`](../models/Visitor.md) record.
  - `404 Not Found`: Visitor record not found.
  - `500 Internal Server Error`: Server error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteStudentEntry(req, res)`

- **Description:** Deletes a specific student check-in/out record ([`CheckInOut`](../models/CheckInOut.md)).
- **Method:** `DELETE`
- **Params:**
  - `entryId` (String, required): The ID of the [`CheckInOut`](../models/CheckInOut.md) record to delete.
- **Returns:**
  - `200 OK`: Entry deleted successfully.
  - `404 Not Found`: Entry record not found.
  - `500 Internal Server Error`: Server error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteVisitor(req, res)`

- **Description:** Deletes a specific ad-hoc visitor record ([`Visitor`](../models/Visitor.md)).
- **Method:** `DELETE`
- **Params:**
  - `visitorId` (String, required): The ID of the [`Visitor`](../models/Visitor.md) record to delete.
- **Returns:**
  - `200 OK`: Visitor deleted successfully.
  - `404 Not Found`: Visitor record not found.
  - `500 Internal Server Error`: Server error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).

### `verifyQR(req, res)`

- **Description:** Verifies a student's encrypted QR code data. Decrypts the data using the student's stored AES key (from [`User`](../models/User.md)) via [`decryptData`](../utils/qrUtils.md#decryptdata), checks the expiry timestamp, and returns basic [`StudentProfile`](../models/StudentProfile.md) data and their last [`CheckInOut`](../models/CheckInOut.md) status if valid.
- **Method:** `POST`
- **Body:**
  - `email` (String, required): The email address ([`User`](../models/User.md)) associated with the QR code.
  - `encryptedData` (String, required): The encrypted payload from the QR code.
- **Returns:**
  - `200 OK`: QR code is valid and not expired. Returns `{ success: true, studentProfile, lastCheckInOut }`.
  - `400 Bad Request`: Invalid QR code (missing fields, decryption failed via [`decryptData`](../utils/qrUtils.md#decryptdata), expired).
  - `404 Not Found`: [`StudentProfile`](../models/StudentProfile.md) not found for the email.
  - `500 Internal Server Error`: Server error during verification (handled by [`errorHandler`](../utils/errorHandler.md)).
