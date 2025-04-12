# Event API Controller (`externalApi/controllers/eventApi.js`)

Provides an external API endpoint for searching event records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/Event.js`](../../models/Event.md): Event model.
- [`../../models/Hostel.js`](../../models/Hostel.md): Hostel model (for searching by hostel name).
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchEvents(req, res)`

- **Description:** Searches for events ([`Event`](../../models/Event.md)) based on query parameters, including keywords, target gender, target hostel name ([`Hostel`](../../models/Hostel.md)), and date range. Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `keyword` (String, optional): Search term for event name or description (case-insensitive regex).
  - `hostelName` (String, optional): Filter by target hostel name (case-insensitive regex).
  - `gender` (String, optional): Filter by target gender.
  - `startDate` (String, optional): Filter events occurring on or after this date (ISO date string, YYYY-MM-DD).
  - `endDate` (String, optional): Filter events occurring on or before this date (ISO date string, YYYY-MM-DD).
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds the main query object based on direct [`Event`](../../models/Event.md) fields (`keyword`, `gender`, `dateAndTime` range).
  2.  If `hostelName` is provided, queries the [`Hostel`](../../models/Hostel.md) collection for matching IDs and adds `hostelId: { $in: [...] }` to the main query. Returns empty if no matching hostels.
  3.  Executes `countDocuments` with the final query for pagination.
  4.  Executes `find` with the final query, applying population for `hostelId` ([`Hostel`](../../models/Hostel.md) - name).
  5.  Applies sorting (newest event date first), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `events`: An array of populated event objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching event records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
