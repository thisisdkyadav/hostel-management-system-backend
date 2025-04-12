# Upload Controller (`controllers/uploadController.js`)

Handles file uploads, specifically profile images, to Azure Blob Storage.

[Back to Controllers Overview](README.md)

## Dependencies

- `@azure/storage-blob`: Azure Storage Blob client library for Node.js.
- [`../config/environment.js`](../config/environment.md): Provides Azure Storage connection details (`AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`, `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_ACCOUNT_KEY`).
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Configuration

Requires Azure Storage credentials and container name set in environment variables (via [`environment.js`](../config/environment.md)).

## Functions

### `uploadProfileImage(req, res)`

- **Description:** Uploads a profile image file for a specific user to Azure Blob Storage and returns a Shared Access Signature (SAS) URL for read access.
- **Method:** `POST` (or `PUT`, depending on the route setup)
- **Middleware:** Expects middleware (like `multer`) to parse the multipart/form-data request and attach the uploaded file details to `req.file`.
- **Params:**
  - `userId` (String, required): The ID of the user whose profile image is being uploaded. Used in the blob name.
- **Request Body:** Must be `multipart/form-data` containing the image file.
- \*\*File Handling (`req.file` expected fields):
  - `originalname` (String): The original name of the uploaded file.
  - `buffer` (Buffer): The file content as a buffer.
  - `mimetype` (String): The MIME type of the file.
- **Process:**
  1.  Checks if `req.file` exists.
  2.  Constructs a unique blob name using `userId` and `originalname`.
  3.  Gets a reference to the `BlockBlobClient` in the configured container.
  4.  Uploads the file buffer using `uploadData`, setting the correct content type.
  5.  Generates a read-only SAS token for the uploaded blob with a very long expiry date (Year 2099).
  6.  Constructs the full SAS URL.
- **Returns:**
  - `200 OK`: Upload successful. Returns JSON object `{ url: sasUrl }` containing the SAS URL for the uploaded image.
  - `400 Bad Request`: No file was uploaded (`req.file` is missing).
  - `500 Internal Server Error`: Upload to Azure failed or error generating SAS token (handled by [`errorHandler`](../utils/errorHandler.md)).
