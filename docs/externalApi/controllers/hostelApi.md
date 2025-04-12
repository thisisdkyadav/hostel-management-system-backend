# Hostel API Controller (`externalApi/controllers/hostelApi.js`)

Provides an external API endpoint for searching hostel records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchHostels(req, res)`

- **Description:** Searches for hostels ([`Hostel`](../../models/Hostel.md)) based on query parameters like name, type, and gender. Returns paginated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `name` (String, optional): Filter by hostel name (case-insensitive regex).
  - `type` (String, optional): Filter by exact hostel type (e.g., 'unit-based').
  - `gender` (String, optional): Filter by exact gender accommodation (e.g., 'Male', 'Female').
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds a filter query based on `name`, `type`, and `gender`.
  2.  Executes `countDocuments` with the query for pagination.
  3.  Executes `find` with the query.
  4.  Applies sorting (by name ascending), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `hostels`: An array of hostel objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching hostel records.
  - `500 Internal Server Error`: If the database query fails (handled by `express-async-handler`).
