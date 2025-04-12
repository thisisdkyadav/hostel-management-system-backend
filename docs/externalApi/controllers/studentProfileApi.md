# Student Profile API Controller (`externalApi/controllers/studentProfileApi.js`)

Provides an external API endpoint for searching student profiles based on various criteria.

[Back to External API Controllers Overview](README.md)

## Dependencies

- [`../../models/StudentProfile.js`](../../models/StudentProfile.md): StudentProfile model, including the [`getFullStudentData`](../../models/StudentProfile.md#getfullstudentdatauserid) static method.
- [`../../models/User.js`](../../models/User.md): User model.
- [`mongoose`](https://mongoosejs.com/): Used for creating `ObjectId` instances if filtering by `_id`.
- [`express-async-handler`](https://www.npmjs.com/package/express-async-handler): Utility for handling errors in async express routes.

## Functions

### `searchStudentProfiles(req, res)`

- **Description:** Searches for student profiles using an aggregation pipeline to match criteria from both the [`StudentProfile`](../../models/StudentProfile.md) and associated [`User`](../../models/User.md) collections. Returns detailed, formatted student data.
- **Method:** `GET`
- **Authentication:** Assumed to be handled by preceding middleware (e.g., API key check).
- **Query Parameters:**
  - `_id` (String, optional): Filter by `StudentProfile` ID.
  - `rollNumber` (String, optional): Filter by roll number (case-insensitive regex).
  - `name` (String, optional): Filter by associated user name (case-insensitive regex).
  - `email` (String, optional): Filter by associated user email (case-insensitive regex).
  - `phone` (String, optional): Filter by associated user phone number (case-insensitive regex).
  - `degree` (String, optional): Filter by degree (case-insensitive regex).
  - `department` (String, optional): Filter by department (case-insensitive regex).
  - `gender` (String, optional): Filter by gender.
- **Process:**
  1.  Constructs an aggregation pipeline.
  2.  Adds a `$match` stage for [`StudentProfile`](../../models/StudentProfile.md) fields (`_id`, `rollNumber`, `degree`, `department`, `gender`).
  3.  Uses `$lookup` to join with the `users` collection ([`User`](../../models/User.md)).
  4.  Uses `$unwind` to deconstruct the `userData` array.
  5.  Adds a `$match` stage for [`User`](../../models/User.md) fields (`name`, `email`, `phone`) if provided.
  6.  Executes the aggregation pipeline.
  7.  Extracts the `userId`s from the results.
  8.  Calls [`StudentProfile.getFullStudentData(userIds)`](../../models/StudentProfile.md#getfullstudentdatauserid) to get fully populated and formatted profile data.
- **Returns:**
  - `200 OK`: Returns an array of detailed student profile objects matching the criteria, formatted by `getFullStudentData`.
  - `500 Internal Server Error`: Error during aggregation or data fetching (handled by `express-async-handler`).
