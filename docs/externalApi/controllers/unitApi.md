# Unit API Controller (`externalApi/controllers/unitApi.js`)

Provides an external API endpoint for searching hostel unit records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Unit.js`](../../models/Unit.md): Unit model.
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model.
- [`../../models/Room.js`](../../models/Room.md): Used indirectly via Unit's virtual `rooms` field.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchUnits(req, res)`

- **Description:** Searches for hostel units ([`Unit`](../../models/Unit.md)) based on query parameters like unit number, floor, and associated hostel name ([`Hostel`](../../models/Hostel.md)). Returns paginated results with populated hostel details and calculated room statistics (count, capacity, occupancy) for each unit (using virtual `rooms` from [`Room`](../../models/Room.md)).
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `hostelName` (String, optional): Filter by associated hostel name (case-insensitive regex).
  - `unitNumber` (String, optional): Filter by unit number (case-insensitive regex).
  - `floor` (Number, optional): Filter by exact floor number.
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  If `hostelName` is provided, queries the [`Hostel`](../../models/Hostel.md) collection for matching IDs and adds `hostelId: { $in: [...] }` to the main query. Returns empty if no matching hostels.
  2.  Builds the main query object based on `unitNumber`, `floor`, and the retrieved `hostelId`s.
  3.  Executes `countDocuments` with the query for pagination.
  4.  Executes `find` with the query, applying population for `hostelId` ([`Hostel`](../../models/Hostel.md) - name) and the virtual `rooms` field (selecting capacity, occupancy, status from [`Room`](../../models/Room.md)).
  5.  Applies sorting (by hostel name, unit number), skip, and limit.
  6.  Formats the results, calculating `roomCount`, total `capacity`, and total `occupancy` for _active_ rooms within each unit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `units`: An array of unit objects, including calculated `roomCount`, `capacity`, and `occupancy`.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching unit records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
