# User API Controller (`externalApi/controllers/userApi.js`)

Provides an external API endpoint for searching user records based on specified criteria.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/User.js`](../../models/User.md): User model.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchUsers(req, res)`

- **Description:** Searches for users in the database ([`User`](../../models/User.md) model) based on query parameters provided in the request.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `_id` (String, optional): Filter by user ID.
  - `email` (String, optional): Filter by exact email address.
  - `name` (String, optional): Filter by exact name.
  - `phone` (String, optional): Filter by exact phone number.
  - `role` (String, optional): Filter by user role (e.g., 'Student', 'Warden', 'Admin').
- **Returns:**
  - `200 OK`: Returns an array of user objects matching the filter criteria (passwords are excluded by default schema settings).
  - `500 Internal Server Error`: Error during database query (handled by `express-async-handler`).
