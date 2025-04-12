# Complaint Controller (`controllers/complaintController.js`)

Manages the lifecycle of student complaints, including creation, retrieval, status updates, and aggregation of statistics.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Complaint.js`](../models/Complaint.md): Mongoose model for Complaints.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/StudentProfile.js`](../models/StudentProfile.md): Used to find student details.
- [`../models/RoomAllocation.js`](../models/RoomAllocation.md): Used to find the student's current allocation/hostel/room/unit.
- [`../models/Hostel.js`](../models/Hostel.md): Mongoose model for Hostels.
- [`../models/Room.js`](../models/Room.md): Mongoose model for Rooms.
- [`../models/Unit.js`](../models/Unit.md): Mongoose model for Units.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features like filtering, sorting, pagination.

## Functions

### `createComplaint(req, res)`

- **Description:** Allows a student (identified by `userId` in the body - [`User`](../models/User.md)) to create a new [`Complaint`](../models/Complaint.md). Automatically determines and associates the student's current [`Hostel`](../models/Hostel.md), [`Unit`](../models/Unit.md), and [`Room`](../models/Room.md) based on their [`RoomAllocation`](../models/RoomAllocation.md).
- **Method:** `POST`
- **Body:**
  - `userId` (String, required): The User ID of the student filing the complaint.
  - `title` (String, required): Title of the complaint.
  - `description` (String, required): Detailed description.
  - `category` (String, required): Category of the complaint (e.g., 'Maintenance', 'Security', 'Admin').
  - `priority` (String, required): Priority level (e.g., 'Low', 'Medium', 'High').
  - `attachments` (Array<String>, optional): Array of URLs for attached images/files.
- **Returns:**
  - `201 Created`: Complaint created successfully.
  - `404 Not Found`: Student's [`RoomAllocation`](../models/RoomAllocation.md) not found.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getAllComplaints(req, res)`

- **Description:** Retrieves a paginated and filterable list of [`Complaint`](../models/Complaint.md)s. Filtering is role-based ([`User`](../models/User.md)):
  - **Student:** Sees only their own complaints.
  - **Staff (Warden, Assoc. Warden, Security):** Sees complaints for their assigned [`Hostel`](../models/Hostel.md).
  - **Admin/Maintenance Staff:** Can see all complaints but can filter by `hostelId`.
- **Method:** `GET`
- **Authentication:** Requires authenticated user.
- **Query Parameters:**
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
  - `category` (String, optional): Filter by complaint category.
  - `status` (String, optional): Filter by status ('Pending', 'In Progress', 'Resolved').
  - `priority` (String, optional): Filter by priority.
  - `hostelId` (String, optional): Filter by [`Hostel`](../models/Hostel.md) ID (for Admin/Maintenance).
  - `startDate` (String, optional): Filter by creation date (YYYY-MM-DD, inclusive).
  - `endDate` (String, optional): Filter by creation date (YYYY-MM-DD, inclusive).
- **Returns:**
  - `200 OK`: Returns an object containing `data` (array of formatted [`Complaint`](../models/Complaint.md) objects with populated details) and `meta` (pagination info).
  - `500 Internal Server Error`: Error fetching complaints (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateComplaintStatus(req, res)`

- **Description:** Updates the status and related fields of a specific [`Complaint`](../models/Complaint.md). Typically used by staff/admin.
- **Method:** `PUT`
- **Authentication:** Requires authenticated user (staff/admin).
- **Params:**
  - `id` (String, required): The ID of the [`Complaint`](../models/Complaint.md) to update.
- **Body:**
  - `status` (String, optional): New status ('Pending', 'In Progress', 'Resolved').
  - `assignedTo` (String, optional): [`User`](../models/User.md) ID of the staff member ([`MaintenanceStaff`](../models/MaintenanceStaff.md)?) assigned to handle the complaint.
  - `resolutionNotes` (String, optional): Notes added upon resolution.
  - `feedback` (String, optional): Feedback provided by the student (likely updated via a different endpoint/controller, e.g., [`feedbackController.md`](feedbackController.md)).
  - `feedbackRating` (Number, optional): Rating provided by the student (likely updated via [`feedbackController.md`](feedbackController.md)).
- **Process:** If `status` is set to 'Resolved', the `resolutionDate` is automatically set to the current time.
- **Returns:**
  - `200 OK`: Complaint updated successfully. Returns the updated [`Complaint`](../models/Complaint.md) object.
  - `404 Not Found`: Complaint not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStats(req, res)`

- **Description:** Retrieves overall [`Complaint`](../models/Complaint.md) statistics (total, pending, in progress, resolved). (Note: Currently fetches system-wide stats regardless of user role/hostel, could be enhanced to filter based on [`User`](../models/User.md) context).
- **Method:** `GET`
- **Authentication:** Requires authenticated user.
- **Returns:**
  - `200 OK`: Returns an object with keys: `total`, `pending`, `inProgress`, `resolved`.
  - `500 Internal Server Error`: Error fetching stats (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudentComplaints(req, res)`

- **Description:** Retrieves a paginated list of all [`Complaint`](../models/Complaint.md)s filed by a _specific student_, identified by their User ID ([`User`](../models/User.md)).
- **Method:** `GET`
- **Params:**
  - `userId` (String, required): The [`User`](../models/User.md) ID of the student whose complaints are requested.
- **Query Parameters:**
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Returns:**
  - `200 OK`: Returns an object containing `data` (array of formatted [`Complaint`](../models/Complaint.md) objects) and `meta` (pagination info).
  - `500 Internal Server Error`: Error fetching student complaints (handled by [`errorHandler`](../utils/errorHandler.md)).
