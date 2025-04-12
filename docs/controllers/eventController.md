# Event Controller (`controllers/eventController.js`)

Manages the creation, retrieval, update, and deletion of events, which can be targeted to specific hostels or genders.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Event.js`](../models/Event.md): Mongoose model for Events.
- [`../models/User.js`](../models/User.md): Mongoose model for User accounts.
- [`../models/StudentProfile.js`](../models/StudentProfile.md): Used to get student's gender and hostel allocation.
- [`../models/RoomAllocation.js`](../models/RoomAllocation.md): Used to get student's hostel allocation.
- [`../models/Hostel.js`](../models/Hostel.md): Mongoose model for Hostels.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.
- [`../utils/apiFeatures.js`](../utils/apiFeatures.md): Utility for handling API features like filtering, sorting, pagination.

## Functions

### `createEvent(req, res)`

- **Description:** Creates a new [`Event`](../models/Event.md).
- **Method:** `POST`
- **Authentication:** Requires authenticated user (typically staff/admin).
- **Body:**
  - `eventName` (String, required): Name of the event.
  - `description` (String, required): Description of the event.
  - `dateAndTime` (Date, required): Date and time of the event.
  - `hostelId` (String, optional): ID of the [`Hostel`](../models/Hostel.md) the event is specific to. If null, it's considered general.
  - `gender` (String, optional): Target gender for the event (e.g., 'Male', 'Female'). If null, it's for all genders.
- **Returns:**
  - `201 Created`: Event created successfully. Returns the created [`Event`](../models/Event.md) object.
  - `500 Internal Server Error`: Error during creation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getEvents(req, res)`

- **Description:** Retrieves [`Event`](../models/Event.md)s relevant to the authenticated [`User`](../models/User.md).
  - For **Students**: Filters events based on their assigned [`Hostel`](../models/Hostel.md) (from [`RoomAllocation`](../models/RoomAllocation.md)) (or general events) and their gender (from [`StudentProfile`](../models/StudentProfile.md)) (or events for all genders).
  - For **Staff/Admin** (with `user.hostel`): Filters events specific to their assigned [`Hostel`](../models/Hostel.md) or general events.
  - For **Staff/Admin** (without `user.hostel`): Retrieves all events (no filtering).
- **Method:** `GET`
- **Authentication:** Requires authenticated user.
- **Query:** Likely uses [`APIFeatures`](../utils/apiFeatures.md) for potential future filtering/sorting.
- **Returns:**
  - `200 OK`: Returns an object `{ events }` containing an array of [`Event`](../models/Event.md) objects populated with `hostelId` details ([`Hostel`](../models/Hostel.md)).
  - `404 Not Found`: No events found matching the criteria.
  - `500 Internal Server Error`: Error fetching events (handled by [`errorHandler`](../utils/errorHandler.md)).

### `updateEvent(req, res)`

- **Description:** Updates the details of an existing [`Event`](../models/Event.md).
- **Method:** `PUT`
- **Authentication:** Requires authenticated user (typically staff/admin).
- **Params:**
  - `id` (String, required): The ID of the [`Event`](../models/Event.md) to update.
- **Body:**
  - `eventName` (String, optional): New name.
  - `description` (String, optional): New description.
  - `dateAndTime` (Date, optional): New date and time.
  - `hostelId` (String, optional): New target [`Hostel`](../models/Hostel.md) ID (or null for general).
  - `gender` (String, optional): New target gender (or null for all).
- **Returns:**
  - `200 OK`: Event updated successfully. Returns the updated [`Event`](../models/Event.md) object.
  - `404 Not Found`: Event not found.
  - `500 Internal Server Error`: Error during update (handled by [`errorHandler`](../utils/errorHandler.md)).

### `deleteEvent(req, res)`

- **Description:** Deletes a specific [`Event`](../models/Event.md).
- **Method:** `DELETE`
- **Authentication:** Requires authenticated user (typically staff/admin).
- **Params:**
  - `id` (String, required): The ID of the [`Event`](../models/Event.md) to delete.
- **Returns:**
  - `200 OK`: Event deleted successfully.
  - `404 Not Found`: Event not found.
  - `500 Internal Server Error`: Error during deletion (handled by [`errorHandler`](../utils/errorHandler.md)).
