# Associate Warden API Controller (`externalApi/controllers/associateWardenApi.js`)

Provides an external API endpoint for searching Associate Warden records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/AssociateWarden.js`](../../models/AssociateWarden.md): AssociateWarden model.
- [`../../models/User.js`](../../models/User.md): User model.
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchAssociateWardens(req, res)`

- **Description:** Searches for Associate Wardens ([`AssociateWarden`](../../models/AssociateWarden.md)) based on query parameters, including their status, join date range, associated user details ([`User`](../../models/User.md) - name, email), and assigned hostel name ([`Hostel`](../../models/Hostel.md)). Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `userName` (String, optional): Filter by user name (case-insensitive regex).
  - `userEmail` (String, optional): Filter by user email (case-insensitive regex).
  - `hostelName` (String, optional): Filter by assigned hostel name (case-insensitive regex).
  - `status` (String, optional): Filter by status ('assigned' or 'unassigned').
  - `joinStartDate` (String, optional): Filter by join date (ISO date string, YYYY-MM-DD) - inclusive start.
  - `joinEndDate` (String, optional): Filter by join date (ISO date string, YYYY-MM-DD) - inclusive end.
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds a query for the [`User`](../../models/User.md) collection based on `userName` and `userEmail`, **always filtering for `role: "Associate Warden"`**. Retrieves matching user IDs. Returns empty if no matching users.
  2.  If `hostelName` is provided, queries the [`Hostel`](../../models/Hostel.md) collection for matching IDs. Returns empty if no matching hostels.
  3.  Builds the main query object for the [`AssociateWarden`](../../models/AssociateWarden.md) collection using retrieved `userId`s, `hostelId`s (if applicable), `status`, and `joinDate` range.
  4.  Executes `countDocuments` with the final query for pagination.
  5.  Executes `find` with the final query, applying population for `userId` ([`User`](../../models/User.md) - name, email, phone) and `hostelId` ([`Hostel`](../../models/Hostel.md) - name).
  6.  Applies sorting (by user name), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `associateWardens`: An array of populated associate warden objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching associate warden records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
