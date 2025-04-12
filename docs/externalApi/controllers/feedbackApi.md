# Feedback API Controller (`externalApi/controllers/feedbackApi.js`)

Provides an external API endpoint for searching student feedback records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Feedback.js`](../../models/Feedback.md): Feedback model.
- [`../../models/User.js`](../../models/User.md): User model (for searching by user).
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model (for searching by hostel name).
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchFeedback(req, res)`

- **Description:** Searches for feedback records ([`Feedback`](../../models/Feedback.md)) based on query parameters, including keywords, status, reply status, associated user ([`User`](../../models/User.md))/hostel ([`Hostel`](../../models/Hostel.md)) details, and date range. Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `userName` (String, optional): Filter by the submitting user's name (case-insensitive regex).
  - `userEmail` (String, optional): Filter by the submitting user's email (case-insensitive regex).
  - `hostelName` (String, optional): Filter by the associated hostel's name (case-insensitive regex).
  - `keyword` (String, optional): Search term for title or description (case-insensitive regex).
  - `status` (String, optional): Filter by exact feedback status (e.g., 'Pending', 'Seen').
  - `isReplied` (String, optional): Filter based on reply status. Use "true" for replied feedback (`reply` field is not null/empty), "false" for unreplied feedback.
  - `startDate` (String, optional): Filter feedback created on or after this date (ISO date string, YYYY-MM-DD).
  - `endDate` (String, optional): Filter feedback created on or before this date (ISO date string, YYYY-MM-DD).
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  If `userName` or `userEmail` is provided, queries the [`User`](../../models/User.md) collection for matching IDs and adds `userId: { $in: [...] }` to the main query. Returns empty if no matching users.
  2.  If `hostelName` is provided, queries the [`Hostel`](../../models/Hostel.md) collection for matching IDs and adds `hostelId: { $in: [...] }` to the main query. Returns empty if no matching hostels.
  3.  Builds the main query object based on direct feedback fields (`keyword`, `status`, `isReplied`, date range) and the retrieved `userId`s/`hostelId`s.
  4.  Executes `countDocuments` with the final query for pagination.
  5.  Executes `find` with the final query, applying population for `userId` ([`User`](../../models/User.md) - name, email) and `hostelId` ([`Hostel`](../../models/Hostel.md) - name).
  6.  Applies sorting (newest first), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `feedback`: An array of populated feedback objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching feedback records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
