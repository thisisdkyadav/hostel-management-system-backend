# Admin Controller (`controllers/adminController.js`)

This controller handles administrative tasks related to managing security personnel and maintenance staff. Note: Warden and Associate Warden management is handled in [`wardenController.md`](wardenController.md) and [`associateWardenController.md`](associateWardenController.md).

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/User.js`](../models/User.md): For managing user accounts.
- [`../models/Security.js`](../models/Security.md): For security staff profiles.
- [`../models/MaintenanceStaff.js`](../models/MaintenanceStaff.md): For maintenance staff profiles.
- [`../models/Hostel.js`](../models/Hostel.md): For hostel information (used in security assignment).
- [`bcrypt`](https://www.npmjs.com/package/bcrypt): For hashing passwords.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Likely used for `getAllSecurities` and `getAllMaintenanceStaff`.

## Functions

### `createSecurity(req, res)`

- **Description:** Creates a new security [`User`](../models/User.md) and associated [`Security`](../models/Security.md) profile.
- **Method:** `POST`
- **Body:**
  - `email` (String, required): Email address for the new security user.
  - `password` (String, required): Password for the new security user.
  - `name` (String, required): Name of the new security user.
  - `hostelId` (String, required): ID of the [`Hostel`](../models/Hostel.md) the security personnel is assigned to.
- **Returns:**
  - `201 Created`: Security created successfully. Returns the created [`Security`](../models/Security.md) object including user details.
  - `400 Bad Request`: Missing required fields or user with the email already exists.
  - `500 Internal Server Error`: Server error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getAllSecurities(req, res)`

- **Description:** Retrieves all security personnel ([`Security`](../models/Security.md)) with their associated [`User`](../models/User.md) details, likely using [`APIFeatures`](../utils/apiFeatures.md).
- **Method:** `GET`
- **Returns:**
  - `200 OK`: Returns an array of formatted security objects.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateSecurity(req, res)`

- **Description:** Updates the details of a specific [`Security`](../models/Security.md) profile and optionally their [`User`](../models/User.md) name.
- **Method:** `PUT`
- **Params:**
  - `id` (String, required): The ID of the [`Security`](../models/Security.md) profile to update.
- **Body:**
  - `hostelId` (String, optional): The new [`Hostel`](../models/Hostel.md) ID to assign.
  - `name` (String, optional): The new name for the associated [`User`](../models/User.md).
- **Returns:**
  - `200 OK`: Security updated successfully.
  - `404 Not Found`: Security profile not found.
  - `500 Internal Server Error`: Server error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteSecurity(req, res)`

- **Description:** Deletes a [`Security`](../models/Security.md) profile and its associated [`User`](../models/User.md) account.
- **Method:** `DELETE`
- **Params:**
  - `id` (String, required): The ID of the [`Security`](../models/Security.md) profile to delete.
- **Returns:**
  - `200 OK`: Security deleted successfully.
  - `404 Not Found`: Security profile not found.
  - `500 Internal Server Error`: Server error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateUserPassword(req, res)`

- **Description:** Updates the password for a [`User`](../models/User.md) identified by email. Hashes the new password using `bcrypt`.
- **Method:** `POST`
- **Body:**
  - `email` (String, required): Email address of the [`User`](../models/User.md) whose password needs updating.
  - `newPassword` (String, required): The new password for the user.
- **Returns:**
  - `200 OK`: Password updated successfully.
  - `404 Not Found`: User not found with the specified email.
  - `500 Internal Server Error`: Server error during password update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `createMaintenanceStaff(req, res)`

- **Description:** Creates a new maintenance staff [`User`](../models/User.md) and associated [`MaintenanceStaff`](../models/MaintenanceStaff.md) profile.
- **Method:** `POST`
- **Body:**
  - `email` (String, required): Email address for the new staff member.
  - `password` (String, required): Password for the new staff member.
  - `name` (String, required): Name of the new staff member.
  - `phone` (String, optional): Phone number of the new staff member.
  - `category` (String, required): Category of maintenance work (e.g., Electrician, Plumber).
- **Returns:**
  - `201 Created`: Maintenance staff created successfully.
  - `400 Bad Request`: Missing required fields or user with the email already exists.
  - `500 Internal Server Error`: Server error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getAllMaintenanceStaff(req, res)`

- **Description:** Retrieves all maintenance staff members ([`MaintenanceStaff`](../models/MaintenanceStaff.md)) with their associated [`User`](../models/User.md) details, likely using [`APIFeatures`](../utils/apiFeatures.md).
- **Method:** `GET`
- **Returns:**
  - `200 OK`: Returns an array of formatted maintenance staff objects.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateMaintenanceStaff(req, res)`

- **Description:** Updates the details of a specific [`MaintenanceStaff`](../models/MaintenanceStaff.md) profile and associated [`User`](../models/User.md) details.
- **Method:** `PUT`
- **Params:**
  - `id` (String, required): The ID of the [`MaintenanceStaff`](../models/MaintenanceStaff.md) profile to update.
- **Body:**
  - `name` (String, optional): The new name for the associated user.
  - `phone` (String, optional): The new phone number for the associated user.
  - `category` (String, optional): The new category for the maintenance staff.
- **Returns:**
  - `200 OK`: Maintenance staff updated successfully.
  - `404 Not Found`: Maintenance staff profile not found.
  - `500 Internal Server Error`: Server error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteMaintenanceStaff(req, res)`

- **Description:** Deletes a [`MaintenanceStaff`](../models/MaintenanceStaff.md) profile and its associated [`User`](../models/User.md) account.
- **Method:** `DELETE`
- **Params:**
  - `id` (String, required): The ID of the [`MaintenanceStaff`](../models/MaintenanceStaff.md) profile to delete.
- **Returns:**
  - `200 OK`: Maintenance staff deleted successfully.
  - `404 Not Found`: Maintenance staff profile not found.
  - `500 Internal Server Error`: Server error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).
