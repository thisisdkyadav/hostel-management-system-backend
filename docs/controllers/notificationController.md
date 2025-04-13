# Notification Controller (`controllers/notificationController.js`)

Manages the creation and retrieval of targeted notifications within the system.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Notification.js`](../models/Notification.md): Mongoose model for Notifications.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/StudentProfile.js`](../models/StudentProfile.md): Used to get student details (hostel, gender, degree, dept) for filtering.
- [`../models/Hostel.js`](../models/Hostel.md): Mongoose model for Hostels.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features like filtering, sorting, pagination, searching.

## Functions

### `createNotification(req, res)`

- **Description:** Creates a new [`Notification`](../models/Notification.md). Notifications can be targeted based on various criteria.
- **Method:** `POST`
- **Authentication:** Requires authenticated user (sender is automatically set).
- **Body:**
  - `title` (String, required): Title of the notification.
  - `message` (String, required): Content of the notification.
  - `type` (String, optional): Type or category of the notification (e.g., 'Announcement', 'Warning', 'Event'). Default: 'announcement'.
  - `hostelId` (String or [String], optional): Target specific [`Hostel`](../models/Hostel.md)(s) by their IDs. Can be a single ID or an array of IDs.
  - `degree` (String or [String], optional): Target students in specific degree program(s). Can be a single degree or an array of degrees.
  - `department` (String or [String], optional): Target students in specific department(s). Can be a single department or an array of departments.
  - `gender` (String, optional): Target students of a specific gender.
  - `expiryDate` (Date, optional): Date and time when the notification should expire. Defaults to 15 days from creation.
- **Returns:**
  - `201 Created`: Notification created successfully. Returns the created [`Notification`](../models/Notification.md) object.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getNotifications(req, res)`

- **Description:** Retrieves a paginated list of [`Notification`](../models/Notification.md)s relevant to the authenticated [`User`](../models/User.md), with filtering and search options.
  - For **Students**: Automatically filters notifications based on their profile ([`StudentProfile`](../models/StudentProfile.md)) (hostel, gender, degree, department), showing notifications targeted specifically at them or universally (empty target fields).
  - For **Staff/Admin**: Allows filtering by `hostelId`, `degree`, `department`, `gender` query parameters.
- **Method:** `GET`
- **Authentication:** Requires authenticated user.
- **Query Parameters:**
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
  - `type` (String, optional): Filter by notification type.
  - `hostelId` (String or [String], optional): Filter by target [`Hostel`](../models/Hostel.md) ID(s). Provide multiple times for OR condition (e.g., `?hostelId=ID1&hostelId=ID2`).
  - `degree` (String or [String], optional): Filter by target degree(s). Provide multiple times for OR condition (e.g., `?degree=BSc&degree=MSc`).
  - `department` (String or [String], optional): Filter by target department(s). Provide multiple times for OR condition (e.g., `?department=CS&department=IT`).
  - `gender` (String, optional): Filter by target gender.
  - `search` (String, optional): Search term for title, message, sender, hostel, degree, or department.
  - `expiryStatus` (String, optional): Filter by expiry status ('active' or 'expired').
- **Returns:**
  - `200 OK`: Returns an object with `data` (array of [`Notification`](../models/Notification.md) objects populated with sender ([`User`](../models/User.md)) and [`Hostel`](../models/Hostel.md) name) and `meta` (pagination details).
  - `500 Internal Server Error`: Error fetching notifications (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getNotificationStats(req, res)`

- **Description:** Calculates statistics (total, active, expired) for [`Notification`](../models/Notification.md)s relevant to the authenticated [`User`](../models/User.md). Filters apply similarly to `getNotifications`.
- **Method:** `GET`
- **Authentication:** Requires authenticated user.
- **Returns:**
  - `200 OK`: Returns an object with `data: { total, active, expired }`.
  - `500 Internal Server Error`: Error fetching stats (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getActiveNotificationsCount(req, res)`

- **Description:** Gets the count of active [`Notification`](../models/Notification.md)s relevant to the authenticated [`User`](../models/User.md). Filters apply similarly to `getNotifications`.
- **Method:** `GET`
- **Authentication:** Requires authenticated user.
- **Returns:**
  - `200 OK`: Returns an object with `activeCount`.
  - `500 Internal Server Error`: Error fetching count (handled by [`errorHandler`](../utils/errorHandler.md)).
