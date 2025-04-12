# Disciplinary Committee (DisCo) Action API Controller (`externalApi/controllers/discoActionApi.js`)

Provides an external API endpoint for searching disciplinary action records.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/DisCoAction.js`](../../models/DisCoAction.md): DisCoAction model.
- [`../../models/User.js`](../../models/User.md): User model (for searching by student).
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchDisCoActions(req, res)`

- **Description:** Searches for disciplinary action records ([`DisCoAction`](../../models/DisCoAction.md)) based on query parameters, including reason, action taken, associated student details ([`User`](../../models/User.md)), and date range. Returns paginated, populated results.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `userName` (String, optional): Filter by the involved student's name (case-insensitive regex).
  - `userEmail` (String, optional): Filter by the involved student's email (case-insensitive regex).
  - `reason` (String, optional): Filter by reason text (case-insensitive regex).
  - `actionTaken` (String, optional): Filter by action taken text (case-insensitive regex).
  - `startDate` (String, optional): Filter actions that occurred on or after this date (ISO date string, YYYY-MM-DD).
  - `endDate` (String, optional): Filter actions that occurred on or before this date (ISO date string, YYYY-MM-DD).
  - `page` (Number, optional): Page number (default: 1).
  - `limit` (Number, optional): Results per page (default: 10).
- **Process:**
  1.  Builds the main query object based on direct [`DisCoAction`](../../models/DisCoAction.md) fields (`reason`, `actionTaken`, `date` range).
  2.  If `userName` or `userEmail` is provided, queries the [`User`](../../models/User.md) collection for matching IDs and adds `userId: { $in: [...] }` to the main query. Returns empty if no matching users.
  3.  Executes `countDocuments` with the final query for pagination.
  4.  Executes `find` with the final query, applying population for `userId` ([`User`](../../models/User.md) - name, email). _Note: Roll number population likely requires populating via `StudentProfile`._
  5.  Applies sorting (newest action date first), skip, and limit.
- **Returns:**
  - `200 OK`: Returns a JSON object containing:
    - `actions`: An array of populated disciplinary action objects.
    - `page`: Current page number.
    - `pages`: Total number of pages.
    - `total`: Total number of matching action records.
  - `500 Internal Server Error`: If any database query fails during the process (handled by `express-async-handler`).
