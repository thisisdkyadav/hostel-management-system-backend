# Room Allocation API Controller (`externalApi/controllers/roomAllocationApi.js`)

Provides an external API endpoint for searching room allocation records based on a wide range of criteria across multiple related models.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/RoomAllocation.js`](../../models/RoomAllocation.md): RoomAllocation model.
- [`../../models/User.js`](../../models/User.md): User model.
- [`../../models/StudentProfile.js`](../../models/StudentProfile.md): StudentProfile model.
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model.
- [`../../models/Room.js`](../../models/Room.md): Room model.
- [`../../models/Unit.js`](../../models/Unit.md): Unit model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchAllocations(req, res)`

- **Description:** Searches for room allocation records ([`RoomAllocation`](../../models/RoomAllocation.md)) based on extensive query parameters, including details from associated student ([`StudentProfile`](../../models/StudentProfile.md)), user ([`User`](../../models/User.md)), hostel ([`Hostel`](../../models/Hostel.md)), room ([`Room`](../../models/Room.md)), and unit ([`Unit`](../../models/Unit.md)) records. Returns paginated, populated, and formatted results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - **Student/User Filters:**
    - `studentName` (String, optional): Filter by user name (case-insensitive regex).
    - `studentEmail` (String, optional): Filter by user email (case-insensitive regex).
    - `rollNumber` (String, optional): Filter by student profile roll number (case-insensitive regex).
  - **Location Filters:**
    - `hostelName` (String, optional): Filter by hostel name (case-insensitive regex).
    - `unitNumber` (String, optional): Filter by unit number (case-insensitive regex).
    - `roomNumber` (String, optional): Filter by room number (case-insensitive regex).
    - `bedNumber` (Number, optional): Filter by exact bed number.
  - **Date Filters:**
    - `startDate` (String, optional): Filter allocations created on or after this date (YYYY-MM-DD).
    - `endDate` (String, optional): Filter allocations created on or before this date (YYYY-MM-DD).
  - **Pagination:**
    - `page` (Number, optional): Page number (default: 1).
    - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds separate query objects for [`User`](../../models/User.md), [`StudentProfile`](../../models/StudentProfile.md), [`Hostel`](../../models/Hostel.md), [`Unit`](../../models/Unit.md), and [`Room`](../../models/Room.md) based on relevant query parameters.
  2.  If filters for related models exist, it performs preliminary queries to find the matching `_id`s for those models.
  3.  If any preliminary query returns no results, it immediately returns an empty result set.
  4.  Uses the retrieved `_id`s to build the main filter query for the [`RoomAllocation`](../../models/RoomAllocation.md) collection.
  5.  Adds direct filters for `bedNumber` and `createdAt` (date range) to the main query.
  6.  Executes `countDocuments` with the final query to get the total count for pagination.
  7.  Executes `find` with the final query, applying population for `userId` ([`User`](../../models/User.md)), `studentProfileId` ([`StudentProfile`](../../models/StudentProfile.md)), `hostelId` ([`Hostel`](../../models/Hostel.md)), `roomId` ([`Room`](../../models/Room.md) including nested `unitId` ([`Unit`](../../models/Unit.md))).
  8.  Applies sorting (newest first), skip, and limit for pagination.
  9.  Formats the results, including constructing a `displayRoomNumber` string (e.g., "A101-1" or "101-1").
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `allocations`: An array of populated and formatted room allocation objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching allocation records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
