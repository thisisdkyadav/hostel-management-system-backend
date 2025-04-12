# Security API Controller (`externalApi/controllers/securityApi.js`)

Provides an external API endpoint for searching security personnel records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Security.js`](../../models/Security.md): Security model.
- [`../../models/User.js`](../../models/User.md): User model.
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchSecurity(req, res)`

- **Description:** Searches for security personnel ([`Security`](../../models/Security.md)) based on query parameters, including associated user details ([`User`](../../models/User.md) - name, email) and assigned hostel name ([`Hostel`](../../models/Hostel.md)). Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `userName` (String, optional): Filter by user name (case-insensitive regex).
  - `userEmail` (String, optional): Filter by user email (case-insensitive regex).
  - `hostelName` (String, optional): Filter by assigned hostel name (case-insensitive, exact match).
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  If `hostelName` is provided, queries the [`Hostel`](../../models/Hostel.md) collection to find the matching hostel ID. If not found, returns empty results.
  2.  Builds a query for the [`User`](../../models/User.md) collection based on `userName` and `userEmail`, **always filtering for `role: "Security"`**. If `userName` or `userEmail` is provided, it queries [`User`](../../models/User.md) to get matching IDs. If neither is provided, it queries [`User`](../../models/User.md) to get IDs of _all_ users with the 'Security' role.
  3.  If the user query (either specific or general security role) returns no results, it returns an empty result set.
  4.  Uses the retrieved `userId`s and `hostelId` (if applicable) to build the main filter query for the [`Security`](../../models/Security.md) collection.
  5.  Executes `countDocuments` with the final query for pagination.
  6.  Executes `find` with the final query, applying population for `userId` ([`User`](../../models/User.md) - name, email, phone) and `hostelId` ([`Hostel`](../../models/Hostel.md) - name).
  7.  Applies sorting (by user name), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `security`: An array of populated security personnel objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching security records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
