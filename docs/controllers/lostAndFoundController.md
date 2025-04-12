# Lost and Found Controller (`controllers/lostAndFoundController.js`)

Manages the CRUD operations for items reported as lost and found within the hostel premises.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/LostAndFound.js`](../models/LostAndFound.md): Mongoose model for Lost and Found items.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features like filtering, sorting, pagination (likely used in `getLostAndFound`).

## Functions

### `createLostAndFound(req, res)`

- **Description:** Creates a new record for a lost or found item using the [`LostAndFound`](../models/LostAndFound.md) model.
- **Method:** `POST`
- **Authentication:** Requires authenticated user (likely staff/admin).
- **Body:**
  - `itemName` (String, required): Name or brief description of the item.
  - `description` (String, required): More detailed description of the item and where it was found/lost.
  - `dateFound` (Date, required): Date the item was found or reported.
  - `images` (Array<String>, optional): Array of URLs for images of the item.
  - `status` (String, required): Current status (e.g., 'Active', 'Claimed', 'Disposed').
- **Returns:**
  - `201 Created`: Item created successfully. Returns the created [`LostAndFound`](../models/LostAndFound.md) item object.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getLostAndFound(req, res)`

- **Description:** Retrieves all lost and found item records, likely utilizing [`APIFeatures`](../utils/apiFeatures.md).
- **Method:** `GET`
- **Returns:**
  - `200 OK`: Returns an object `{ lostAndFoundItems }` containing an array of all [`LostAndFound`](../models/LostAndFound.md) items.
  - `500 Internal Server Error`: Error fetching items (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateLostAndFound(req, res)`

- **Description:** Updates the details of an existing [`LostAndFound`](../models/LostAndFound.md) item record.
- **Method:** `PUT`
- **Authentication:** Requires authenticated user (likely staff/admin).
- **Params:**
  - `id` (String, required): The ID of the [`LostAndFound`](../models/LostAndFound.md) record to update.
- **Body:** Contains fields to update:
  - `itemName`, `description`, `dateFound`, `images`, `status`.
- **Returns:**
  - `200 OK`: Item updated successfully. Returns the updated [`LostAndFound`](../models/LostAndFound.md) item object.
  - `404 Not Found`: Item record not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteLostAndFound(req, res)`

- **Description:** Deletes a specific [`LostAndFound`](../models/LostAndFound.md) item record.
- **Method:** `DELETE`
- **Authentication:** Requires authenticated user (likely staff/admin).
- **Params:**
  - `id` (String, required): The ID of the [`LostAndFound`](../models/LostAndFound.md) record to delete.
- **Returns:**
  - `200 OK`: Item deleted successfully.
  - `404 Not Found`: Item record not found.
  - `500 Internal Server Error`: Error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).
