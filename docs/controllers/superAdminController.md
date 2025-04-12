# Super Admin Controller (`controllers/superAdminControllers.js`)

This controller manages API clients, allowing for their creation, retrieval, updating, and deletion.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/ApiClient.js`](../models/ApiClient.md): Mongoose model for API Clients.
- [`crypto`](https://nodejs.org/api/crypto.html): Node.js crypto module (likely for generating API keys).
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Functions

### `createApiClient(req, res)`

- **Description:** Creates a new [`ApiClient`](../models/ApiClient.md) with a unique API key (generated using `crypto`).
- **Method:** `POST`
- **Body:**
  - `name` (String, required): A descriptive name for the API client.
  - `expiresAt` (Date, optional): The expiration date for the API key. If not provided, the key might not expire or have a default expiration.
- **Returns:**
  - `201 Created`: API client created successfully. Returns the client ID and the generated API key.
  - `400 Bad Request`: Missing required `name` field.
  - `500 Internal Server Error`: Failed to create the API client (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getApiClients(req, res)`

- **Description:** Retrieves a list of all existing [`ApiClient`](../models/ApiClient.md)s.
- **Method:** `GET`
- **Returns:**
  - `200 OK`: Returns an array of [`ApiClient`](../models/ApiClient.md) objects.
  - `500 Internal Server Error`: Failed to fetch API clients (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteApiClient(req, res)`

- **Description:** Deletes a specific [`ApiClient`](../models/ApiClient.md) by its ID.
- **Method:** `DELETE`
- **Params:**
  - `clientId` (String, required): The ID of the [`ApiClient`](../models/ApiClient.md) to delete.
- **Returns:**
  - `200 OK`: API client deleted successfully.
  - `500 Internal Server Error`: Failed to delete the API client (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateApiClient(req, res)`

- **Description:** Updates the details (name and/or expiration date) of an existing [`ApiClient`](../models/ApiClient.md).
- **Method:** `PUT`
- **Params:**
  - `clientId` (String, required): The ID of the [`ApiClient`](../models/ApiClient.md) to update.
- **Body:**
  - `name` (String, optional): The new name for the API client.
  - `expiresAt` (Date, optional): The new expiration date for the API key.
- **Returns:**
  - `200 OK`: API client updated successfully. Returns the updated [`ApiClient`](../models/ApiClient.md) object.
  - `500 Internal Server Error`: Failed to update the API client (handled by [`errorHandler`](../utils/errorHandler.md)).
