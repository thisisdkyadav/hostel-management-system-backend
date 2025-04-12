# Room API Controller (`externalApi/controllers/roomApi.js`)

Provides an external API endpoint for searching room records based on various criteria.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Room.js`](../../models/Room.md): Room model.
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model.
- [`../../models/Unit.js`](../../models/Unit.md): Unit model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchRooms(req, res)`

- **Description:** Searches for rooms ([`Room`](../../models/Room.md)) based on query parameters, including room details (number, status, capacity, occupancy, availability) and associated hostel ([`Hostel`](../../models/Hostel.md))/unit ([`Unit`](../../models/Unit.md)) details. Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `roomNumber` (String, optional): Filter by room number (case-insensitive regex).
  - `hostelName` (String, optional): Filter by associated hostel name (case-insensitive regex).
  - `unitNumber` (String, optional): Filter by associated unit number (case-insensitive regex).
  - `status` (String, optional): Filter by exact room status (e.g., 'Active', 'Inactive').
  - `capacity` (Number, optional): Filter by exact capacity.
  - `minCapacity` (Number, optional): Filter by minimum capacity (inclusive).
  - `maxCapacity` (Number, optional): Filter by maximum capacity (inclusive).
  - `occupancy` (Number, optional): Filter by exact occupancy.
  - `minOccupancy` (Number, optional): Filter by minimum occupancy (inclusive).
  - `maxOccupancy` (Number, optional): Filter by maximum occupancy (inclusive).
  - `isAvailable` (String, optional): Filter by availability. Use "true" for rooms where `occupancy < capacity`, "false" for rooms where `occupancy >= capacity`.
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds filter query (`query`) directly based on room-specific parameters (`roomNumber`, `status`, capacity/occupancy ranges, `isAvailable`).
  2.  If `hostelName` is provided, queries [`Hostel`](../../models/Hostel.md) collection for matching IDs and adds `hostelId: { $in: [...] }` to the main `query`. Returns empty if no matching hostels.
  3.  If `unitNumber` is provided, queries [`Unit`](../../models/Unit.md) collection (optionally filtered by already found `hostelId`) for matching IDs and adds `unitId: { $in: [...] }` to the main `query`. Returns empty if no matching units.
  4.  Executes `countDocuments` with the final query for pagination.
  5.  Executes `find` with the final query, applying population for `hostelId` ([`Hostel`](../../models/Hostel.md) - name, type) and `unitId` ([`Unit`](../../models/Unit.md) - unitNumber, floor).
  6.  Applies sorting (by hostel name, unit number, room number), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `rooms`: An array of populated room objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching room records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
