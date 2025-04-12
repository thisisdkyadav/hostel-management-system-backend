# Stats Controller (`controllers/statsController.js`)

This controller provides endpoints for retrieving aggregated statistics across various aspects of the hostel management system.

[Back to Controllers Overview](README.md)

## Dependencies

- [`../models/Hostel.js`](../models/Hostel.md): For hostel counts and details.
- [`../models/Room.js`](../models/Room.md): For room counts, capacity, and occupancy stats.
- [`../models/User.js`](../models/User.md): For user role-based counts (Warden, Security, Maintenance).
- [`../models/Warden.js`](../models/Warden.md): For warden status counts.
- [`../models/Security.js`](../models/Security.md): For security staff status counts.
- [`../models/MaintenanceStaff.js`](../models/MaintenanceStaff.md): For maintenance staff category counts.
- [`../models/Event.js`](../models/Event.md): For event timing stats (upcoming/past).
- [`../models/LostAndFound.js`](../models/LostAndFound.md): For lost/found item status counts.
- [`../models/RoomChangeRequest.js`](../models/RoomChangeRequest.md): For room change request status counts.
- [`../models/VisitorRequest.js`](../models/VisitorRequest.md): For visitor check-in/out stats.
- [`../models/Complaint.js`](../models/Complaint.md): For complaint status counts.
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Functions

### `getHostelStats(req, res)`

- **Description:** Calculates and returns overall statistics for all [`Hostel`](../models/Hostel.md)s, including total count, active [`Room`](../models/Room.md) counts (total, occupied, available), and occupancy rate.
- **Method:** `GET`
- **Returns:**
  - `200 OK`: JSON object with keys: `totalHostels`, `totalRooms`, `occupancyRate`, `availableRooms`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getWardenStats(req, res)`

- **Description:** Returns statistics about warden users ([`User`](../models/User.md) with role 'Warden', linked via [`Warden`](../models/Warden.md)): total count, count of assigned wardens, and count of unassigned wardens.
- **Method:** `GET`
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `assigned`, `unassigned`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getEventStats(req, res)`

- **Description:** Returns statistics about [`Event`](../models/Event.md)s for a specific [`Hostel`](../models/Hostel.md): total count, count of upcoming events, and count of past events.
- **Method:** `GET`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) for which to retrieve event stats.
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `upcoming`, `past`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getLostAndFoundStats(req, res)`

- **Description:** Returns system-wide statistics for [`LostAndFound`](../models/LostAndFound.md) items: total count, count of active items, and count of claimed items.
- **Method:** `GET`
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `active`, `claimed`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getSecurityStaffStats(req, res)`

- **Description:** Returns statistics about security staff users ([`User`](../models/User.md) with role 'Security', linked via [`Security`](../models/Security.md)): total count, count of assigned staff (associated with a hostel), and count of unassigned staff.
- **Method:** `GET`
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `assigned`, `unassigned`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getMaintenanceStaffStats(req, res)`

- **Description:** Returns statistics about maintenance staff users ([`User`](../models/User.md) with role 'Maintenance Staff', linked via [`MaintenanceStaff`](../models/MaintenanceStaff.md)): total count and counts broken down by category (Plumbing, Electrical, Cleanliness, Internet, Civil).
- **Method:** `GET`
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `plumbing`, `electrical`, `cleanliness`, `internet`, `civil`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRoomStats(req, res)`

- **Description:** Returns statistics about [`Room`](../models/Room.md)s within a specific [`Hostel`](../models/Hostel.md): total count, count of available rooms (occupancy 0), and count of occupied rooms (occupancy > 0).
- **Method:** `GET`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) for which to retrieve room stats.
- **Returns:**
  - `200 OK`: JSON object with keys: `totalRooms`, `availableRooms`, `occupiedRooms`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getRoomChangeRequestStats(req, res)`

- **Description:** Returns statistics about [`RoomChangeRequest`](../models/RoomChangeRequest.md)s for a specific [`Hostel`](../models/Hostel.md): total count, and counts broken down by status (Pending, Approved, Rejected).
- **Method:** `GET`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) for which to retrieve request stats.
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `pending`, `approved`, `rejected`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getVisitorStats(req, res)`

- **Description:** Returns statistics about [`VisitorRequest`](../models/VisitorRequest.md)s for a specific [`Hostel`](../models/Hostel.md): total count, count of currently checked-in visitors, count of checked-out visitors, and count of visitors who checked in today.
- **Method:** `GET`
- **Params:**
  - `hostelId` (String, required): The ID of the [`Hostel`](../models/Hostel.md) for which to retrieve visitor stats.
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `checkedIn`, `checkedOut`, `todays`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).

### `getComplaintsStats(req, res)`

- **Description:** Returns system-wide statistics for [`Complaint`](../models/Complaint.md)s: total count, and counts broken down by status (Pending, Resolved, In Progress).
- **Method:** `GET`
- **Returns:**
  - `200 OK`: JSON object with keys: `total`, `pending`, `resolved`, `inProgress`.
  - `500 Internal Server Error`: Server error during calculation (handled by [`errorHandler`](../utils/errorHandler.md)).
