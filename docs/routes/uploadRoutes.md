# Upload Routes (`/routes/uploadRoutes.js`)

Defines API routes specifically for handling file uploads, currently focused on profile images.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- `multer`: Middleware for handling `multipart/form-data`, used for file uploads.
- Controllers:
  - [`uploadController.js`](../controllers/uploadController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)
  - [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles)

## Base Path

All routes defined in this file are mounted under `/api/v1/upload` (assuming `/upload` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring users are logged in.
- [`authorizeRoles`](../middlewares/authorize.md#authorizerolesroles): Applied to the specific upload route.
- `multer`: Configured with memory storage (`multer.memoryStorage()`) and applied to the POST route using `upload.single('image')` to handle a single file upload with the field name 'image'.

## Routes

- `POST /profile/:userId`:
  - Uploads a profile image for a specific user (identified by `:userId`).
  - Middleware: `authorizeRoles(['Admin', 'Warden'])`, `upload.single('image')`
  - Controller: [`uploadProfileImage`](../controllers/uploadController.md#uploadprofileimagereq-res)
  - Authentication Required: Yes
  - Authorization Required: Admin or Warden
  - Expects `multipart/form-data` with a file field named `image`.
