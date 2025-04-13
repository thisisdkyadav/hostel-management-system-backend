# Notification API Controller (`externalApi/controllers/notificationApi.js`)

Provides an external API endpoint for searching notification records based on various criteria.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Notification.js`](../../models/Notification.md): Notification model.
- [`../../models/User.js`](../../models/User.md): User model (for searching by sender).
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model (for searching by hostel name).
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchNotifications(req, res)`

- **Description:** Searches for notifications ([`Notification`](../../models/Notification.md)) based on query parameters, including content keywords, type, targeting criteria, sender details ([`User`](../../models/User.md)), target hostel ([`Hostel`](../../models/Hostel.md)), and date ranges. Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `keyword` (String, optional): Search term for title or message (case-insensitive regex).
  - `type` (String, optional): Filter by notification type.
  - `senderName` (String, optional): Filter by sender's user name (case-insensitive regex).
  - `senderEmail` (String, optional): Filter by sender's user email (case-insensitive regex).
  - `hostelName` (String or [String], optional): Filter by target hostel name(s) (case-insensitive regex). Use multiple parameters for OR (e.g., `?hostelName=Block A&hostelName=Block B`).
  - `degree` (String or [String], optional): Filter by target degree(s) (case-insensitive regex). Use multiple parameters for OR (e.g., `?degree=BSc&degree=MSc`).
  - `department` (String or [String], optional): Filter by target department(s) (case-insensitive regex). Use multiple parameters for OR (e.g., `?department=CS&department=IT`).
  - `gender` (String, optional): Filter by target gender.
  - `startDate` (String, optional): Filter notifications created on or after this date (ISO date string, e.g., YYYY-MM-DD).
  - `endDate` (String, optional): Filter notifications created on or before this date (ISO date string, e.g., YYYY-MM-DD). Includes the entire end day.
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds the main query object based on direct notification fields (`keyword`, `type`, `gender`, date range).
  2.  If `degree` is provided (single or array), adds `degree: { $in: [/degree1/i, /degree2/i, ...] }` to the query.
  3.  If `department` is provided (single or array), adds `department: { $in: [/dept1/i, /dept2/i, ...] }` to the query.
  4.  If `senderName` or `senderEmail` is provided, queries the [`User`](../../models/User.md) collection for matching IDs and adds `sender: { $in: [...] }` to the main query. Returns empty if no matching senders.
  5.  If `hostelName` is provided (single or array), queries the [`Hostel`](../../models/Hostel.md) collection for matching IDs based on name regex and adds `hostelId: { $in: [...] }` to the main query. Returns empty if no matching hostels.
  6.  Executes `countDocuments` with the final query for pagination.
  7.  Executes `find` with the final query, populating `sender` and `hostelId` details.
  8.  Applies sorting (newest first), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `notifications`: Array of populated [`Notification`](../../models/Notification.md) objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching notifications.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
