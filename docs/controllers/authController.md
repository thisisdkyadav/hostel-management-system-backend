# Auth Controller (`controllers/authController.js`)

Handles user authentication, session management, and basic user profile actions like fetching user data and updating passwords.

[Back to Controllers Overview](README.md)

## Dependencies

- `jsonwebtoken`: For creating and verifying JWTs.
- `axios`: For making requests to Google's OAuth2 token info endpoint.
- `bcrypt`: For hashing and comparing passwords.
- [`../config/environment.js`](../config/environment.md): Provides `JWT_SECRET` and `isDevelopmentEnvironment` flag.
- [`../models/User.js`](../models/User.md): User model.
- [`../utils/qrUtils.js`](../utils/qrUtils.md): Provides `generateKey` for AES key generation related to QR codes.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Functions

### `login(req, res)`

- **Description:** Authenticates a user ([`User`](../models/User.md)) using email and password.
- **Method:** `POST`
- **Body:**
  - `email` (String, required): User's email address.
  - `password` (String, required): User's plain text password.
- **Process:**
  1.  Finds user by email.
  2.  Compares provided password with the stored hash using `bcrypt`.
  3.  If valid, generates a JWT using [`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken) and the `JWT_SECRET` from [`environment.js`](../config/environment.md), containing user ID, role, and email, valid for 7 days.
  4.  Generates or retrieves an AES key (`aesKey`) for the user using [`generateKey`](../utils/qrUtils.md#generatekey) (related to QR functionality) and updates the [`User`](../models/User.md) record.
  5.  Sets the JWT as an HTTP-only cookie named `token` (secure flag based on `isDevelopmentEnvironment` from [`environment.js`](../config/environment.md)).
  6.  Returns the [`User`](../models/User.md) object (excluding password) and a success message.
- **Returns:**
  - `200 OK`: Login successful. Returns `{ user, message }` and sets the `token` cookie.
  - `400 Bad Request`: Missing email or password.
  - `401 Unauthorized`: Invalid email or password.
  - `500 Internal Server Error`: Server error during login (handled by [`errorHandler`](../utils/errorHandler.md)).

### `loginWithGoogle(req, res)`

- **Description:** Authenticates a user ([`User`](../models/User.md)) using a Google ID token.
- **Method:** `POST`
- **Body:**
  - `token` (String, required): The Google ID token obtained from the client-side Google Sign-In.
- **Process:**
  1.  Verifies the Google ID token by calling Google's token info endpoint using [`axios`](https://axios-http.com/).
  2.  Extracts the email from the verified token data.
  3.  Finds the [`User`](../models/User.md) in the local database by email.
  4.  If user exists, generates a JWT using [`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken) and `JWT_SECRET` from [`environment.js`](../config/environment.md), containing user ID, role, and email, valid for 7 days.
  5.  Generates or retrieves an AES key (`aesKey`) for the user using [`generateKey`](../utils/qrUtils.md#generatekey) and updates the [`User`](../models/User.md) record.
  6.  Sets the JWT as an HTTP-only cookie named `token` (secure flag based on `isDevelopmentEnvironment` from [`environment.js`](../config/environment.md)).
  7.  Returns the [`User`](../models/User.md) object (excluding password) and a success message.
- **Returns:**
  - `200 OK`: Login successful. Returns `{ user, message }` and sets the `token` cookie.
  - `401 Unauthorized`: Invalid Google token or user not found in the local database.
  - `500 Internal Server Error`: (Implicit via `catchAsync`, handled by [`errorHandler`](../utils/errorHandler.md)).

### `logout(req, res)`

- **Description:** Logs out the user by clearing the `token` cookie.
- **Method:** `POST`
- **Returns:**
  - `200 OK`: Returns `{ message: "Logged out successfully" }`.

### `getUser(req, res)`

- **Description:** Retrieves the profile data for the currently authenticated user ([`User`](../models/User.md)) (based on the JWT decoded by the [`authenticate` middleware](../middlewares/auth.md#authenticate-req-res-next)).
- **Method:** `GET`
- **Authentication:** Requires valid JWT cookie (handled by [`authenticate` middleware](../middlewares/auth.md#authenticate-req-res-next)).
- **Returns:**
  - `200 OK`: Returns the [`User`](../models/User.md) object (excluding password).
  - `404 Not Found`: User specified in the token not found in the database.
  - `500 Internal Server Error`: Server error during retrieval (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updatePassword(req, res)`

- **Description:** Allows the authenticated user ([`User`](../models/User.md)) to update their own password.
- **Method:** `PUT`
- **Authentication:** Requires valid JWT cookie (handled by [`authenticate` middleware](../middlewares/auth.md#authenticate-req-res-next)).
- **Body:**
  - `oldPassword` (String, required): The user's current password.
  - `newPassword` (String, required): The desired new password.
- **Process:**
  1.  Finds the authenticated [`User`](../models/User.md).
  2.  Compares `oldPassword` with the stored hash using `bcrypt`.
  3.  If valid, hashes `newPassword` using `bcrypt`.
  4.  Updates the user's password hash in the [`User`](../models/User.md) database record.
- **Returns:**
  - `200 OK`: Returns `{ message: "Password updated successfully" }`.
  - `400 Bad Request`: Missing old or new password.
  - `401 Unauthorized`: `oldPassword` is incorrect.
  - `404 Not Found`: Authenticated user not found.
  - `500 Internal Server Error`: Server error during update (handled by [`errorHandler`](../utils/errorHandler.md)).
