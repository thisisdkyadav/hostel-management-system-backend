# Warden Controller (`controllers/wardenController.js`)

Manages CRUD operations for Warden users and their associated profiles. Functionality mirrors the Associate Warden controller.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Warden.js`](../models/Warden.md): Mongoose model for Warden profiles.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/Hostel.js`](../models/Hostel.md): Mongoose model for Hostels.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Functions

### `getWardenProfile(req, res)`

- **Description:** Retrieves the profile details of the currently authenticated Warden user, including their assigned [`Hostel`](../models/Hostel.md) information, using the [`Warden`](../models/Warden.md) and [`User`](../models/User.md) models.
- **Method:** `GET`
- **Authentication:** Requires Warden role authentication.
- **Returns:**
  - `200 OK`: Returns the [`Warden`](../models/Warden.md) profile object, populated with user details (name, email, role) and hostel details (name, type).
  - `404 Not Found`: Warden profile not found for the authenticated user.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `createWarden(req, res)`

- **Description:** Creates a new Warden [`User`](../models/User.md) and their corresponding [`Warden`](../models/Warden.md) profile.
- **Method:** `POST`
- **Authentication:** Requires administrative privileges.
- **Body:**
  - `email` (String, required): Email address for the new user.
  - `password` (String, required): Password for the new user.
  - `name` (String, required): Name of the Warden.
  - `phone` (String, optional): Phone number.
  - `hostelId` (String, optional): ID of the [`Hostel`](../models/Hostel.md) to assign. If provided, status defaults to 'assigned'.
  - `status` (String, optional): Initial status ('assigned' or 'unassigned'). Defaults to 'unassigned' if `hostelId` is null.
  - `joinDate` (Date, optional): Date the Warden joined. Defaults to the current date.
- **Returns:**
  - `201 Created`: Warden created successfully.
  - `400 Bad Request`: Missing required fields (email, password, name) or user with the email already exists.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getAllWardens(req, res)`

- **Description:** Retrieves a list of all Wardens ([`Warden`](../models/Warden.md)) with their [`User`](../models/User.md) details.
- **Method:** `GET`
- **Authentication:** Requires administrative privileges.
- **Returns:**
  - `200 OK`: Returns an array of formatted Warden objects, including user details (name, email, phone, profileImage), hostel ID, join date, and status.
  - `500 Internal Server Error`: Error fetching data (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateWarden(req, res)`

- **Description:** Updates the details of an existing [`Warden`](../models/Warden.md) profile and optionally their associated [`User`](../models/User.md) phone number.
- **Method:** `PUT`
- **Authentication:** Requires administrative privileges.
- **Params:**
  - `id` (String, required): The ID of the [`Warden`](../models/Warden.md) profile to update.
- **Body:**
  - `phone` (String, optional): New phone number for the associated [`User`](../models/User.md).
  - `joinDate` (Date, optional): New join date.
  - `hostelId` (String, optional): New [`Hostel`](../models/Hostel.md) assignment ID. Setting this automatically updates the status to 'assigned'; setting it to null/omitting updates status to 'unassigned'.
- **Returns:**
  - `200 OK`: Warden updated successfully.
  - `404 Not Found`: Warden profile not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteWarden(req, res)`

- **Description:** Deletes a [`Warden`](../models/Warden.md) profile and their associated [`User`](../models/User.md) account.
- **Method:** `DELETE`
- **Authentication:** Requires administrative privileges.
- **Params:**
  - `id` (String, required): The ID of the [`Warden`](../models/Warden.md) profile to delete.
- **Returns:**
  - `200 OK`: Warden deleted successfully.
  - `404 Not Found`: Warden profile not found.
  - `500 Internal Server Error`: Error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).
