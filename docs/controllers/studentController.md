# Student Controller (`controllers/studentController.js`)

This controller handles operations related to student profiles, room allocations, data retrieval, dashboard information, and complaints.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/User.js`](../models/User.md): For managing user accounts associated with students.
- [`../models/StudentProfile.js`](../models/StudentProfile.md): For student-specific profile details.
- [`../models/RoomAllocation.js`](../models/RoomAllocation.md): For managing and retrieving room allocation information.
- [`../models/RoomChangeRequest.js`](../models/RoomChangeRequest.md): For handling student room change requests.
- [`../models/Hostel.js`](../models/Hostel.md): For accessing hostel details related to allocations.
- [`../models/Room.js`](../models/Room.md): For accessing room details related to allocations.
- [`../models/Unit.js`](../models/Unit.md): For accessing unit details related to allocations.
- [`../models/Complaint.js`](../models/Complaint.md): For managing student complaints.
- [`../models/Feedback.js`](../models/Feedback.md): Used in dashboard for feedback stats.
- [`../models/Event.js`](../models/Event.md): Used in dashboard for event stats/listings.
- [`../models/LostAndFound.js`](../models/LostAndFound.md): Used in dashboard for lost/found stats.
- [`../models/CheckInOut.js`](../models/CheckInOut.md): Used in dashboard for check-in/out stats.
- [`../models/DisCoAction.js`](../models/DisCoAction.md): Used in dashboard for disciplinary action stats.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features (pagination, filtering, searching).
- [`../utils/utils.js`](../utils/utils.md): Provides `formatDate` utility.

## Functions

### `createStudentsProfiles(req, res)`

- **Description:** Creates one or more new [`StudentProfile`](../models/StudentProfile.md)s along with their associated [`User`](../models/User.md) accounts. Supports bulk creation by passing an array of student objects.
- **Method:** `POST`
- **Body:** An object or an array of objects, each containing:
  - `email` (String, required): Student's email.
  - `name` (String, required): Student's full name.
  - `rollNumber` (String, required): Student's roll number.
  - `password` (String, optional): Password for the student user account. Defaults to `rollNumber` if not provided.
  - `phone` (String, optional): Student's phone number.
  - `profileImage` (String, optional): URL to the student's profile image.
  - `department` (String, optional): Student's department.
  - `degree` (String, optional): Student's degree program.
  - `gender` (String, optional): Student's gender.
  - `dateOfBirth` (Date/String, optional): Student's date of birth (will be formatted using [`formatDate`](../utils/utils.md#formatdate-datestring)).
  - `address` (String, optional): Student's permanent address.
  - `admissionDate` (Date/String, optional): Student's admission date (will be formatted using [`formatDate`](../utils/utils.md#formatdate-datestring)).
  - `guardian` (String, optional): Name of the student's guardian.
  - `guardianPhone` (String, optional): Guardian's phone number.
  - `guardianEmail` (String, optional): Guardian's email address.
- **Returns:**
  - `201 Created`: Student profile(s) created successfully. Returns created user and profile IDs.
  - `207 Multi-Status`: Partial success (some profiles created, some failed). Returns created data and errors.
  - `500 Internal Server Error`: Failed to create profiles due to a server error (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateStudentsProfiles(req, res)`

- **Description:** Updates one or more existing [`StudentProfile`](../models/StudentProfile.md)s and their associated [`User`](../models/User.md) accounts based on `rollNumber`. Supports bulk updates.
- **Method:** `PUT`
- **Body:** An object or an array of objects, each containing:
  - `rollNumber` (String, required): The roll number of the student to update.
  - `name` (String, optional): New name.
  - `email` (String, optional): New email.
  - `password` (String, optional): New password (will be hashed).
  - `phone` (String, optional): New phone number.
  - `profileImage` (String, optional): New profile image URL.
  - `gender` (String, optional): New gender.
  - `dateOfBirth` (Date/String, optional): New date of birth (will be formatted using [`formatDate`](../utils/utils.md#formatdate-datestring)).
  - `department` (String, optional): New department.
  - `degree` (String, optional): New degree.
  - `address` (String, optional): New address.
  - `admissionDate` (Date/String, optional): New admission date (will be formatted using [`formatDate`](../utils/utils.md#formatdate-datestring)).
  - `guardian` (String, optional): New guardian name.
  - `guardianPhone` (String, optional): New guardian phone number.
  - `guardianEmail` (String, optional): New guardian email address.
- **Returns:**
  - `200 OK`: Student profile(s) updated successfully.
  - `207 Multi-Status`: Partial success (some profiles updated, some failed, e.g., student not found). Returns updated data and errors.
  - `400 Bad Request`: No valid `rollNumber` provided in the request.
  - `500 Internal Server Error`: Failed to update profiles due to a server error (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateRoomAllocations(req, res)`

- **Description:** Updates or creates [`RoomAllocation`](../models/RoomAllocation.md)s for multiple students ([`StudentProfile`](../models/StudentProfile.md)) within a specific [`Hostel`](../models/Hostel.md). Handles moving students between rooms ([`Room`](../models/Room.md)) or beds, potentially deleting old allocations.
- **Method:** `POST`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) where allocations are being updated.
- **Body:** An array of allocation objects, each containing:
  - `unit` (String, required): [`Unit`](../models/Unit.md) number (e.g., 'A', 'B').
  - `room` (String, required): [`Room`](../models/Room.md) number.
  - `bedNumber` (Number, required): Bed number within the room.
  - `rollNumber` (String, required): Roll number of the student ([`StudentProfile`](../models/StudentProfile.md)) to allocate.
- **Returns:**
  - `200 OK`: Allocations updated successfully. Returns details of successful allocations.
  - `207 Multi-Status`: Partial success. Some allocations successful, others failed (e.g., student/room/unit not found, room inactive). Returns successful data and errors.
  - `400 Bad Request`: No valid allocation data provided.
  - `500 Internal Server Error`: Failed to update allocations due to a server error (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudents(req, res)`

- **Description:** Retrieves a paginated list of [`StudentProfile`](../models/StudentProfile.md)s, allowing for searching and filtering based on query parameters using [`APIFeatures`](../utils/apiFeatures.md) and the `StudentProfile.searchStudents` static method. If the requesting user ([`User`](../models/User.md)) is associated with a [`Hostel`](../models/Hostel.md), results are filtered by that hostel.
- **Method:** `GET`
- **Query Parameters:** Supports pagination (`page`, `limit`) and filtering/searching via [`StudentProfile.searchStudents`](../models/StudentProfile.md#searchstudentsparams) static method (implementation details needed for specific filters).
- **Returns:**
  - `200 OK`: Returns an object containing `data` (array of student profiles) and `pagination` details.
  - `500 Internal Server Error`: Failed to retrieve students (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudentDetails(req, res)`

- **Description:** Retrieves comprehensive details for a single [`StudentProfile`](../models/StudentProfile.md), including user info ([`User`](../models/User.md)) and allocation details ([`RoomAllocation`](../models/RoomAllocation.md)) using the `StudentProfile.getFullStudentData` static method.
- **Method:** `GET`
- **Params:**
  - `userId` (String, required): The [`User`](../models/User.md) ID of the student.
- **Returns:**
  - `200 OK`: Returns the detailed student profile object.
  - `404 Not Found`: [`StudentProfile`](../models/StudentProfile.md) not found for the given User ID.
  - `500 Internal Server Error`: Failed to retrieve student details (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getMultipleStudentDetails(req, res)`

- **Description:** Retrieves comprehensive details for multiple [`StudentProfile`](../models/StudentProfile.md)s based on an array of [`User`](../models/User.md) IDs using the `StudentProfile.getFullStudentData` static method.
- **Method:** `POST`
- **Body:**
  - `userIds` (Array<String>, required): An array of [`User`](../models/User.md) IDs (max 50).
- **Returns:**
  - `200 OK`: Returns an array of detailed student profile objects.
  - `207 Multi-Status`: Partial success. Some profiles found, others missing. Returns found data and errors for missing IDs.
  - `400 Bad Request`: Invalid or missing `userIds` array, or exceeds the limit of 50.
  - `404 Not Found`: No student profiles found for any of the provided IDs.
  - `500 Internal Server Error`: Failed to retrieve student details (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudentProfile(req, res)`

- **Description:** Retrieves the comprehensive profile details for the currently authenticated student user ([`User`](../models/User.md)) using the `StudentProfile.getFullStudentData` static method.
- **Method:** `GET`
- **Authentication:** Requires student authentication.
- **Returns:**
  - `200 OK`: Returns the detailed student profile object for the logged-in user.
  - `404 Not Found`: [`StudentProfile`](../models/StudentProfile.md) not found for the authenticated user.
  - `500 Internal Server Error`: Failed to retrieve student profile (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateStudentProfile(req, res)`

- **Description:** Updates the profile information for a specific student identified by [`User`](../models/User.md) ID. Allows updating both [`User`](../models/User.md) details (name, email, phone, profileImage) and [`StudentProfile`](../models/StudentProfile.md) details.
- **Method:** `PUT`
- **Params:**
  - `userId` (String, required): The [`User`](../models/User.md) ID of the student to update.
- **Body:** Contains fields to update (all optional):
  - User fields: `name`, `email`, `phone`, `profileImage`.
  - Profile fields: `rollNumber`, `gender`, `dateOfBirth`, `address`, `department`, `degree`, `admissionDate`, `guardian`, `guardianPhone`, `guardianEmail`.
- **Returns:**
  - `200 OK`: Student profile updated successfully.
  - `400 Bad Request`: Duplicate value error (e.g., email or rollNumber already exists).
  - `404 Not Found`: [`User`](../models/User.md) or [`StudentProfile`](../models/StudentProfile.md) not found.
  - `500 Internal Server Error`: Failed to update student profile (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudentDashboard(req, res)`

- **Description:** Retrieves aggregated dashboard information for the currently authenticated student user ([`User`](../models/User.md)), including [`StudentProfile`](../models/StudentProfile.md) summary, room/roommate details ([`RoomAllocation`](../models/RoomAllocation.md)), stats on [`Complaint`](../models/Complaint.md)s, [`LostAndFound`](../models/LostAndFound.md) items, [`Event`](../models/Event.md)s, [`CheckInOut`](../models/CheckInOut.md), [`DisCoAction`](../models/DisCoAction.md), and lists of active complaints and upcoming events.
- **Method:** `GET`
- **Authentication:** Requires student authentication.
- **Returns:**
  - `200 OK`: Returns the dashboard data object.
  - `404 Not Found`: [`StudentProfile`](../models/StudentProfile.md) not found for the authenticated user.
  - `500 Internal Server Error`: Failed to retrieve dashboard information (handled by [`errorHandler`](../utils/errorHandler.md)).

### `fileComplaint(req, res)`

- **Description:** Allows a student (identified by `userId` in params - [`User`](../models/User.md)) to file a new [`Complaint`](../models/Complaint.md).
- **Method:** `POST`
- **Params:**
  - `userId` (String, required): The [`User`](../models/User.md) ID of the student filing the complaint.
- **Body:**
  - `title` (String, required): Title of the complaint.
  - `description` (String, required): Detailed description of the complaint.
  - `complaintType` (String, optional): Type/category of the complaint.
  - `priority` (String, optional): Priority level (e.g., 'Low', 'Medium', 'High').
  - `attachments` (Array<String>, optional): Array of URLs to attached files.
  - `location` (String, optional): Specific location related to the complaint.
  - `hostel` (String, optional): [`Hostel`](../models/Hostel.md) name/ID related to the complaint.
  - `roomNumber` (String, optional): [`Room`](../models/Room.md) number related to the complaint.
- **Returns:**
  - `201 Created`: Returns the newly created [`Complaint`](../models/Complaint.md) object.
  - `500 Internal Server Error`: Failed to save the complaint (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getAllComplaints(req, res)`

- **Description:** Retrieves all [`Complaint`](../models/Complaint.md)s filed by a specific student ([`User`](../models/User.md)).
- **Method:** `GET`
- **Params:**
  - `userId` (String, required): The [`User`](../models/User.md) ID of the student whose complaints are to be fetched.
- **Returns:**
  - `200 OK`: Returns an array of [`Complaint`](../models/Complaint.md) objects filed by the student, populated with user details.
  - `500 Internal Server Error`: Failed to retrieve complaints (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateComplaint(req, res)`

- **Description:** Updates an existing [`Complaint`](../models/Complaint.md) identified by its ID. (Note: The success message mentions deletion, which might be inaccurate based on the code using `findOneAndUpdate`).
- **Method:** `PUT` or `PATCH` (Method used is `findOneAndUpdate`, suitable for both)
- **Params:**
  - `complaintId` (String, required): The ID of the [`Complaint`](../models/Complaint.md) to update.
- **Body:** An object containing fields to update (e.g., `title`, `description`, `status`, etc.).
- **Returns:**
  - `200 OK`: Complaint updated successfully (message might say deleted).
  - `404 Not Found`: Complaint not found.
  - `500 Internal Server Error`: Failed to update complaint (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteComplaint(req, res)`

- **Description:** Deletes a specific [`Complaint`](../models/Complaint.md) by its ID.
- **Method:** `DELETE`
- **Params:**
  - `complaintId` (String, required): The ID of the [`Complaint`](../models/Complaint.md) to delete.
- **Returns:**
  - `200 OK`: Complaint deleted successfully.
  - `404 Not Found`: Complaint not found.
  - `500 Internal Server Error`: Failed to delete complaint (handled by [`errorHandler`](../utils/errorHandler.md)).
