# Maintenance Staff API Controller (`externalApi/controllers/maintenanceStaffApi.js`)

Provides an external API endpoint for searching maintenance staff records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/MaintenanceStaff.js`](../../models/MaintenanceStaff.md): MaintenanceStaff model.
- [`../../models/User.js`](../../models/User.md): User model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchMaintenanceStaff(req, res)`

- **Description:** Searches for maintenance staff ([`MaintenanceStaff`](../../models/MaintenanceStaff.md)) based on query parameters, including their category and associated user details ([`User`](../../models/User.md) - name, email). Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `userName` (String, optional): Filter by user name (case-insensitive regex).
  - `userEmail` (String, optional): Filter by user email (case-insensitive regex).
  - `category` (String, optional): Filter by maintenance category (e.g., 'Plumbing', 'Electrical').
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds a query for the [`User`](../../models/User.md) collection based on `userName` and `userEmail`, **always filtering for `role: "Maintenance Staff"`**. If `userName` or `userEmail` is provided, it queries [`User`](../../models/User.md) to get matching IDs. If neither is provided, it queries [`User`](../../models/User.md) to get IDs of _all_ users with the 'Maintenance Staff' role.
  2.  If the user query returns no results, it returns an empty result set.
  3.  Uses the retrieved `userId`s to build the main filter query for the [`MaintenanceStaff`](../../models/MaintenanceStaff.md) collection.
  4.  Adds the `category` filter to the main query if provided.
  5.  Executes `countDocuments` with the final query for pagination.
  6.  Executes `find` with the final query, applying population for `userId` ([`User`](../../models/User.md) - name, email, phone).
  7.  Applies sorting (by user name), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `staff`: An array of populated maintenance staff objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching maintenance staff records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
