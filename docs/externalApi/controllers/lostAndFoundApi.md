# Lost and Found API Controller (`externalApi/controllers/lostAndFoundApi.js`)

Provides an external API endpoint for searching lost and found item records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/LostAndFound.js`](../../models/LostAndFound.md): LostAndFound model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchLostAndFound(req, res)`

- **Description:** Searches for lost and found items ([`LostAndFound`](../../models/LostAndFound.md)) based on query parameters including keywords, status, and date range. Returns paginated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `keyword` (String, optional): Search term for item name or description (case-insensitive regex).
  - `status` (String, optional): Filter by exact status (e.g., 'Active', 'Claimed').
  - `startDate` (String, optional): Filter items found on or after this date (ISO date string, YYYY-MM-DD).
  - `endDate` (String, optional): Filter items found on or before this date (ISO date string, YYYY-MM-DD).
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds a filter query based on `keyword`, `status`, and `dateFound` range.
  2.  Executes `countDocuments` with the query for pagination.
  3.  Executes `find` with the query.
  4.  Applies sorting (newest found date first), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `items`: An array of lost and found item objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching item records.
  - `500 Internal Server Error`: If the database query fails (handled by `express-async-handler`).
