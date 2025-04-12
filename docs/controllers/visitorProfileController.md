# Visitor Profile Controller (`controllers/visitorProfileController.js`)

Manages the CRUD operations for pre-saved visitor profiles associated with a student.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/VisitorProfile.js`](../models/VisitorProfile.md): Mongoose model for Visitor Profiles.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts (used to get authenticated student ID).
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Functions

### `getVisitorProfiles(req, res)`

- **Description:** Retrieves all [`VisitorProfile`](../models/VisitorProfile.md) records saved by the currently authenticated student ([`User`](../models/User.md)).
- **Method:** `GET`
- **Authentication:** Requires student role authentication.
- **Returns:**
  - `200 OK`: Returns an object `{ message, success: true, data }` where `data` is an array of [`VisitorProfile`](../models/VisitorProfile.md) objects associated with the student.
  - `500 Internal Server Error`: Error fetching profiles (handled by [`errorHandler`](../utils/errorHandler.md)).

### `createVisitorProfile(req, res)`

- **Description:** Creates a new [`VisitorProfile`](../models/VisitorProfile.md) and associates it with the currently authenticated student ([`User`](../models/User.md)).
- **Method:** `POST`
- **Authentication:** Requires student role authentication.
- **Body:**
  - `name` (String, required): Visitor's name.
  - `phone` (String, required): Visitor's phone number.
  - `email` (String, optional): Visitor's email address.
  - `relation` (String, required): Visitor's relationship to the student.
  - `address` (String, optional): Visitor's address.
- **Returns:**
  - `201 Created`: Profile created successfully. Returns the created [`VisitorProfile`](../models/VisitorProfile.md) object.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateVisitorProfile(req, res)`

- **Description:** Updates an existing [`VisitorProfile`](../models/VisitorProfile.md).
- **Method:** `PUT`
- **Authentication:** Requires student role authentication (implicitly checks ownership via subsequent operations, though ideally should verify ownership here).
- **Params:**
  - `visitorId` (String, required): The ID of the [`VisitorProfile`](../models/VisitorProfile.md) to update.
- **Body:** Contains fields to update:
  - `name`, `phone`, `email`, `relation`, `address`.
- **Returns:**
  - `200 OK`: Profile updated successfully. Returns the updated [`VisitorProfile`](../models/VisitorProfile.md) object.
  - `404 Not Found`: Visitor profile not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteVisitorProfile(req, res)`

- **Description:** Deletes an existing [`VisitorProfile`](../models/VisitorProfile.md). Note: This might fail if the profile is linked to pending/approved [`VisitorRequest`](../models/VisitorRequest.md)s due to model middleware.
- **Method:** `DELETE`
- **Authentication:** Requires student role authentication (implicitly checks ownership).
- **Params:**
  - `visitorId` (String, required): The ID of the [`VisitorProfile`](../models/VisitorProfile.md) to delete.
- **Returns:**
  - `200 OK`: Profile deleted successfully.
  - `404 Not Found`: Visitor profile not found.
  - `500 Internal Server Error`: Error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).
