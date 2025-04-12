# Disciplinary Committee (DisCo) Controller (`controllers/disCoController.js`)

Manages records of disciplinary actions taken against students.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/DisCoAction.js`](../models/DisCoAction.md): Mongoose model for Disciplinary/Commendation actions.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts (to find the student).
- [`../models/StudentProfile.js`](../models/StudentProfile.md): Used to verify the student exists.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Functions

### `addDisCoAction(req, res)`

- **Description:** Adds a new disciplinary action record ([`DisCoAction`](../models/DisCoAction.md)) for a specific student ([`User`](../models/User.md)).
- **Method:** `POST`
- **Authentication:** Requires authenticated user (presumably staff/admin).
- **Body:**
  - `studentId` (String, required): The User ID ([`User`](../models/User.md)) of the student involved.
  - `reason` (String, required): Reason for the disciplinary action.
  - `actionTaken` (String, required): Description of the action taken.
  - `date` (Date, required): Date the action was taken.
  - `remarks` (String, optional): Additional remarks or notes.
- **Returns:**
  - `201 Created`: DisCo action added successfully.
  - `404 Not Found`: [`StudentProfile`](../models/StudentProfile.md) not found for the provided `studentId`.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getDisCoActionsByStudent(req, res)`

- **Description:** Retrieves all disciplinary action records ([`DisCoAction`](../models/DisCoAction.md)) associated with a specific student ([`User`](../models/User.md)).
- **Method:** `GET`
- **Params:**
  - `studentId` (String, required): The User ID ([`User`](../models/User.md)) of the student whose actions are to be fetched.
- **Returns:**
  - `200 OK`: Returns an object `{ success: true, message, actions }` where `actions` is an array of [`DisCoAction`](../models/DisCoAction.md) objects populated with user details (name, email) from [`User`](../models/User.md).
  - `500 Internal Server Error`: Error fetching actions (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateDisCoAction(req, res)`

- **Description:** Updates an existing disciplinary action record ([`DisCoAction`](../models/DisCoAction.md)).
- **Method:** `PUT`
- **Params:**
  - `disCoId` (String, required): The ID of the [`DisCoAction`](../models/DisCoAction.md) record to update.
- **Body:**
  - `reason` (String, optional): Updated reason.
  - `actionTaken` (String, optional): Updated action description.
  - `date` (Date, optional): Updated date.
  - `remarks` (String, optional): Updated remarks.
- **Returns:**
  - `200 OK`: Action updated successfully. Returns the updated [`DisCoAction`](../models/DisCoAction.md) object.
  - `404 Not Found`: DisCo action record not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).
