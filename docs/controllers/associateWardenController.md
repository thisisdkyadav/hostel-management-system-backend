# Associate Warden Controller (`controllers/associateWardenController.js`)

Manages CRUD operations for Associate Warden users and their associated profiles.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/AssociateWarden.js`](../models/AssociateWarden.md): Mongoose model for Associate Warden profiles.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/Hostel.js`](../models/Hostel.md): Mongoose model for Hostels.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Functions

### `getAssociateWardenProfile(req, res)`

- **Description:** Retrieves the profile details of the currently authenticated Associate Warden user, including their assigned [`Hostel`](../models/Hostel.md) information, using the [`AssociateWarden`](../models/AssociateWarden.md) and [`User`](../models/User.md) models.
- **Method:** `GET`
- **Authentication:** Requires Associate Warden role authentication.
- **Returns:**
  - `200 OK`: Returns the [`AssociateWarden`](../models/AssociateWarden.md) profile object, populated with user details (name, email, role) and hostel details (name, type).
  - `404 Not Found`: Associate Warden profile not found for the authenticated user.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `createAssociateWarden(req, res)`

- **Description:** Creates a new Associate Warden [`User`](../models/User.md) and their corresponding [`AssociateWarden`](../models/AssociateWarden.md) profile.
- **Method:** `POST`
- **Authentication:** Requires administrative privileges.
- **Body:**
  - `email` (String, required): Email address for the new user.
  - `password` (String, required): Password for the new user.
  - `name` (String, required): Name of the Associate Warden.
  - `phone` (String, optional): Phone number.
  - `hostelId` (String, optional): ID of the [`Hostel`](../models/Hostel.md) to assign. If provided, status defaults to 'assigned'.
  - `status` (String, optional): Initial status ('assigned' or 'unassigned'). Defaults to 'unassigned' if `hostelId` is null.
  - `joinDate` (Date, optional): Date the Associate Warden joined. Defaults to the current date.
- **Returns:**
  - `201 Created`: Associate Warden created successfully.
  - `400 Bad Request`: Missing required fields (email, password, name) or user with the email already exists.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getAllAssociateWardens(req, res)`

- **Description:** Retrieves a list of all Associate Wardens ([`AssociateWarden`](../models/AssociateWarden.md)) with their [`User`](../models/User.md) details.
- **Method:** `GET`
- **Authentication:** Requires administrative privileges.
- **Returns:**
  - `200 OK`: Returns an array of formatted Associate Warden objects, including user details (name, email, phone, profileImage), hostel ID, join date, and status.
  - `500 Internal Server Error`: Error fetching data (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateAssociateWarden(req, res)`

- **Description:** Updates the details of an existing [`AssociateWarden`](../models/AssociateWarden.md) profile and optionally their associated [`User`](../models/User.md) phone number.
- **Method:** `PUT`
- **Authentication:** Requires administrative privileges.
- **Params:**
  - `id` (String, required): The ID of the [`AssociateWarden`](../models/AssociateWarden.md) profile to update.
- **Body:**
  - `phone` (String, optional): New phone number for the associated [`User`](../models/User.md).
  - `joinDate` (Date, optional): New join date.
  - `hostelId` (String, optional): New [`Hostel`](../models/Hostel.md) assignment ID. Setting this automatically updates the status to 'assigned'; setting it to null/omitting updates status to 'unassigned'.
- **Returns:**
  - `200 OK`: Associate Warden updated successfully.
  - `404 Not Found`: Associate Warden profile not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteAssociateWarden(req, res)`

- **Description:** Deletes an [`AssociateWarden`](../models/AssociateWarden.md) profile and their associated [`User`](../models/User.md) account.
- **Method:** `DELETE`
- **Authentication:** Requires administrative privileges.
- **Params:**
  - `id` (String, required): The ID of the [`AssociateWarden`](../models/AssociateWarden.md) profile to delete.
- **Returns:**
  - `200 OK`: Associate Warden deleted successfully.
  - `404 Not Found`: Associate Warden profile not found.
  - `500 Internal Server Error`: Error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).
