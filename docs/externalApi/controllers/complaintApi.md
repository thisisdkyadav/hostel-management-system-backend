# Complaint API Controller (`externalApi/controllers/complaintApi.js`)

Provides a comprehensive external API endpoint for searching complaint records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Complaint.js`](../../models/Complaint.md): Complaint model.
- [`../../models/User.js`](../../models/User.md): User model.
- [`../../models/StudentProfile.js`](../../models/StudentProfile.md): StudentProfile model.
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model.
- [`../../models/Room.js`](../../models/Room.md): Room model.
- [`../../models/Unit.js`](../../models/Unit.md): Unit model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Helper Functions (Internal)

- `findUserIds(name, email)`: Finds [`User`](../../models/User.md) IDs matching name/email regex.
- `findRoomIds(hostelId, unitNumber, roomNumber)`: Finds [`Room`](../../models/Room.md) IDs based on hostel ([`Hostel`](../../models/Hostel.md)), unit number ([`Unit`](../../models/Unit.md)), and room number.

## Functions

### `searchComplaints(req, res)`

- **Description:** Searches for [`Complaint`](../../models/Complaint.md)s based on a wide array of criteria related to the complaint itself, the complainant ([`User`](../../models/User.md)/[`StudentProfile`](../../models/StudentProfile.md)), location ([`Hostel`](../../models/Hostel.md), [`Unit`](../../models/Unit.md), [`Room`](../../models/Room.md)), assigned/resolved staff ([`User`](../../models/User.md)), and dates. Returns paginated, populated, and formatted results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - **Complainant Filters:**
    - `complainantName` (String, optional): Filter by complainant's name (case-insensitive regex).
    - `complainantEmail` (String, optional): Filter by complainant's email (case-insensitive regex).
    - `complainantRollNumber` (String, optional): Filter by complainant's roll number (case-insensitive regex).
  - **Complaint Content Filters:**
    - `keyword` (String, optional): Search term for title or description (case-insensitive regex).
    - `status` (String, optional): Filter by exact status ('Pending', 'In Progress', 'Resolved').
    - `category` (String, optional): Filter by exact category.
    - `priority` (String, optional): Filter by exact priority.
  - **Location Filters:**
    - `hostelName` (String, optional): Filter by hostel name (case-insensitive, exact match expected).
    - `unitNumber` (String, optional): Filter by unit number (case-insensitive, exact match expected).
    - `roomNumber` (String, optional): Filter by room number (case-insensitive, exact match expected).
  - **Staff Filters:**
    - `assignedStaffName` (String, optional): Filter by assigned staff's name (case-insensitive regex).
    - `assignedStaffEmail` (String, optional): Filter by assigned staff's email (case-insensitive regex).
    - `resolvedStaffName` (String, optional): Filter by resolving staff's name (case-insensitive regex).
    - `resolvedStaffEmail` (String, optional): Filter by resolving staff's email (case-insensitive regex).
  - **Date Filters:**
    - `createdStartDate` (String, optional): Filter complaints created on or after this date (ISO date string).
    - `createdEndDate` (String, optional): Filter complaints created on or before this date (ISO date string).
    - `resolvedStartDate` (String, optional): Filter complaints resolved on or after this date (ISO date string).
    - `resolvedEndDate` (String, optional): Filter complaints resolved on or before this date (ISO date string).
  - **Pagination:**
    - `page` (Number, optional): Page number (default: 1).
    - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Uses helper `findUserIds` ([`User`](../../models/User.md)) and `findRoomIds` ([`Room`](../../models/Room.md)) and direct queries on [`Hostel`](../../models/Hostel.md) and [`StudentProfile`](../../models/StudentProfile.md) to get relevant IDs based on name/email/number/roll number parameters.
  2.  Returns empty results if any preliminary ID search yields no matches.
  3.  Builds the main query for the [`Complaint`](../../models/Complaint.md) collection using direct fields (`keyword`, `status`, `category`, `priority`), date ranges (`createdAt`, `resolutionDate`), and the retrieved IDs (`userId`, `hostelId`, `roomId`, `unitId`, `assignedTo`, `resolvedBy`).
  4.  Executes `countDocuments` with the final query for pagination.
  5.  Executes `find` with the final query, populating `userId` ([`User`](../../models/User.md)), `hostelId` ([`Hostel`](../../models/Hostel.md)), `roomId` ([`Room`](../../models/Room.md) with nested `unitId` ([`Unit`](../../models/Unit.md))), `assignedTo` ([`User`](../../models/User.md)), and `resolvedBy` ([`User`](../models/User.md)).
  6.  Applies sorting (newest created first), skip, and limit.
  7.  Performs a separate lookup for [`StudentProfile`](../../models/StudentProfile.md) to get roll numbers for the complainants in the results.
  8.  Formats the results into a cleaner structure, creating `complainant`, `roomLocation`, `hostelName`, `assignedStaff`, and `resolverStaff` objects and removing redundant populated fields.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `complaints`: An array of populated and formatted complaint objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching complaint records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
