# Visitor Request API Controller (`externalApi/controllers/visitorRequestApi.js`)

Provides an external API endpoint for searching visitor request records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/VisitorRequest.js`](../../models/VisitorRequest.md): VisitorRequest model.
- [`../../models/User.js`](../../models/User.md): User model (for searching by student).
- [`../../models/VisitorProfile.js`](../../models/VisitorProfile.md): VisitorProfile model (for searching by visitor details).
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model (for searching by hostel name).
- [`../../models/Room.js`](../../models/Room.md): Room model (for searching by allocated room).
- [`../../models/Unit.js`](../../models/Unit.md): Unit model (needed indirectly via Room).
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchVisitorRequests(req, res)`

- **Description:** Searches for [`VisitorRequest`](../../models/VisitorRequest.md)s based on various criteria including student details ([`User`](../../models/User.md)), visitor details ([`VisitorProfile`](../../models/VisitorProfile.md)), reason, hostel ([`Hostel`](../../models/Hostel.md)), allocated room ([`Room`](../../models/Room.md)), status, and date ranges. Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `studentName` (String, optional): Filter by requesting student's name (case-insensitive regex).
  - `studentEmail` (String, optional): Filter by requesting student's email (case-insensitive regex).
  - `visitorName` (String, optional): Filter if any visitor in the request matches this name (case-insensitive regex).
  - `visitorEmail` (String, optional): Filter if any visitor matches this email (case-insensitive regex).
  - `visitorPhone` (String, optional): Filter if any visitor matches this phone (case-insensitive regex).
  - `reason` (String, optional): Filter by reason text (case-insensitive regex).
  - `hostelName` (String, optional): Filter by assigned hostel name (case-insensitive regex).
  - `allocatedRoomNumber` (String, optional): Filter by the room number (digits only) of any allocated room.
  - `status` (String, optional): Filter by request status (e.g., 'Pending', 'Approved', 'Rejected').
  - `requestStartDate` (String, optional): Filter requests created on or after this date (ISO date string, YYYY-MM-DD).
  - `requestEndDate` (String, optional): Filter requests created on or before this date (ISO date string, YYYY-MM-DD).
  - `visitStartDate` (String, optional): Filter requests where the visit end date (`toDate`) is on or after this date (ISO date string).
  - `visitEndDate` (String, optional): Filter requests where the visit start date (`fromDate`) is on or before this date (ISO date string).
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  If student details provided, queries [`User`](../../models/User.md) for matching IDs. Adds `userId: { $in: [...] }`.
  2.  If visitor details provided, queries [`VisitorProfile`](../../models/VisitorProfile.md) for matching IDs. Adds `visitors: { $in: [...] }`.
  3.  If `hostelName` provided, queries [`Hostel`](../../models/Hostel.md) for matching IDs. Adds `hostelId: { $in: [...] }`.
  4.  If `allocatedRoomNumber` provided, queries [`Room`](../../models/Room.md) (filtered by `hostelId` if known) for matching room numbers. Adds `allocatedRooms: { $in: [...] }`.
  5.  Returns empty if any preliminary query yields no results.
  6.  Builds the main query object based on direct fields (`reason`, `status`) and date ranges (`createdAt`, `fromDate`/`toDate` overlap).
  7.  Combines filters using retrieved IDs from preliminary searches.
  8.  Executes `countDocuments` with the final query for pagination.
  9.  Executes `find` with the final query, populating `userId` ([`User`](../../models/User.md)), `visitors` ([`VisitorProfile`](../../models/VisitorProfile.md)), `hostelId` ([`Hostel`](../../models/Hostel.md)), and `allocatedRooms` ([`Room`](../../models/Room.md) with nested `unitId` ([`Unit`](../../models/Unit.md))).
  10. Applies sorting (newest request first), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `requests`: An array of populated visitor request objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching request records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
