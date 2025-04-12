# Feedback Controller (`controllers/feedbackController.js`)

Manages the submission and handling of feedback provided by students.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Feedback.js`](../models/Feedback.md): Mongoose model for Feedback submissions.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/StudentProfile.js`](../models/StudentProfile.md): Used to find the student's current allocation/hostel.
- [`../models/RoomAllocation.js`](../models/RoomAllocation.md): Used to find the student's current allocation/hostel.
- [`../models/Hostel.js`](../models/Hostel.md): Used for hostel information.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features like filtering, sorting, pagination.

## Functions

### `createFeedback(req, res)`

- **Description:** Allows an authenticated student ([`User`](../models/User.md)) with a current hostel allocation ([`RoomAllocation`](../models/RoomAllocation.md)) to submit feedback using the [`Feedback`](../models/Feedback.md) model.
- **Method:** `POST`
- **Authentication:** Requires student role authentication.
- **Body:**
  - `title` (String, required): Title of the feedback.
  - `description` (String, required): Detailed feedback content.
- **Process:** Automatically associates the feedback with the student's current `hostelId` based on their allocation.
- **Returns:**
  - `201 Created`: Feedback created successfully. Returns the created [`Feedback`](../models/Feedback.md) object.
  - `400 Bad Request`: Student does not have an active hostel allocation.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getFeedbacks(req, res)`

- **Description:** Retrieves feedback ([`Feedback`](../models/Feedback.md)) based on the user's role and context.
  - **Student:** Retrieves only their own submitted feedback.
  - **Staff (with `user.hostel`):** Retrieves feedback associated with their assigned [`Hostel`](../models/Hostel.md).
  - **Admin (without `user.hostel`):** Retrieves all feedback (based on current implementation, could be refined).
- **Method:** `GET`
- **Authentication:** Requires authenticated user.
- **Query Parameters:** Accepts general query parameters (`req.query`), likely handled by [`APIFeatures`](../utils/apiFeatures.md).
- **Returns:**
  - `200 OK`: Returns an object `{ feedbacks, success: true }` where `feedbacks` is an array of [`Feedback`](../models/Feedback.md) objects populated with [`User`](../models/User.md) and [`Hostel`](../models/Hostel.md) details.
  - `500 Internal Server Error`: Error fetching feedback (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateFeedbackStatus(req, res)`

- **Description:** Allows authorized staff to update the status of a [`Feedback`](../models/Feedback.md) record (e.g., 'Pending', 'Seen', 'Resolved') and clears any existing reply.
- **Method:** `PUT`
- **Authentication:** Requires staff/admin role authentication.
- **Params:**
  - `feedbackId` (String, required): The ID of the [`Feedback`](../models/Feedback.md) record to update.
- **Body:**
  - `status` (String, required): The new status for the feedback.
- **Returns:**
  - `200 OK`: Status updated successfully. Returns the updated [`Feedback`](../models/Feedback.md) object.
  - `404 Not Found`: Feedback record not found.
  - `500 Internal Server Error`: Error updating status (handled by [`errorHandler`](../utils/errorHandler.md)).

### `replyToFeedback(req, res)`

- **Description:** Allows authorized staff to add a reply to a [`Feedback`](../models/Feedback.md) record and automatically sets the status to 'Seen'.
- **Method:** `POST` (or potentially `PUT`)
- **Authentication:** Requires staff/admin role authentication.
- **Params:**
  - `feedbackId` (String, required): The ID of the [`Feedback`](../models/Feedback.md) record.
- **Body:**
  - `reply` (String, required): The reply content.
- **Returns:**
  - `200 OK`: Reply added successfully. Returns the updated [`Feedback`](../models/Feedback.md) object.
  - `404 Not Found`: Feedback record not found.
  - `500 Internal Server Error`: Error adding reply (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateFeedback(req, res)`

- **Description:** Allows a student ([`User`](../models/User.md)) to update the title and description of their own [`Feedback`](../models/Feedback.md) (presumably only if it's still pending, though not checked).
- **Method:** `PUT`
- **Authentication:** Requires student role authentication (implicitly checks ownership).
- **Params:**
  - `feedbackId` (String, required): The ID of the [`Feedback`](../models/Feedback.md) to update.
- **Body:**
  - `title` (String, optional): New title.
  - `description` (String, optional): New description.
- **Returns:**
  - `200 OK`: Feedback updated successfully. Returns the updated [`Feedback`](../models/Feedback.md) object.
  - `404 Not Found`: Feedback record not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteFeedback(req, res)`

- **Description:** Allows a student ([`User`](../models/User.md)) to delete their own [`Feedback`](../models/Feedback.md).
- **Method:** `DELETE`
- **Authentication:** Requires student role authentication (implicitly checks ownership).
- **Params:**
  - `feedbackId` (String, required): The ID of the [`Feedback`](../models/Feedback.md) to delete.
- **Returns:**
  - `200 OK`: Feedback deleted successfully.
  - `404 Not Found`: Feedback record not found.
  - `500 Internal Server Error`: Error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getStudentFeedbacks(req, res)`

- **Description:** Retrieves all [`Feedback`](../models/Feedback.md) records submitted by a _specific student_, identified by their User ID ([`User`](../models/User.md)).
- **Method:** `GET`
- **Params:**
  - `userId` (String, required): The User ID of the student whose feedback is requested.
- **Returns:**
  - `200 OK`: Returns an object `{ feedbacks, success: true }` where `feedbacks` is an array populated with [`User`](../models/User.md) and [`Hostel`](../models/Hostel.md) details.
  - `500 Internal Server Error`: Error fetching feedback (handled by [`errorHandler`](../utils/errorHandler.md)).
