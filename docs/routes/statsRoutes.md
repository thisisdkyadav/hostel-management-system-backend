# Statistics Routes (`/routes/statsRoutes.js`)

Defines API routes dedicated to retrieving various statistics across the application.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`statsController.js`](../controllers/statsController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/stats` (assuming `/stats` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied individually to each route, ensuring the user is logged in before accessing any statistics endpoint.

## Routes

- `GET /hostel`:
  - Retrieves general hostel statistics.
  - Controller: [`getHostelStats`](../controllers/statsController.md#gethostelstatsreq-res)
- `GET /lostandfound`:
  - Retrieves lost and found statistics.
  - Controller: [`getLostAndFoundStats`](../controllers/statsController.md#getlostandfoundstatsreq-res)
- `GET /security`:
  - Retrieves security staff statistics.
  - Controller: [`getSecurityStaffStats`](../controllers/statsController.md#getsecuritystaffstatsreq-res)
- `GET /maintenancestaff`:
  - Retrieves maintenance staff statistics.
  - Controller: [`getMaintenanceStaffStats`](../controllers/statsController.md#getmaintenancestaffstatsreq-res)
- `GET /room/:hostelId`:
  - Retrieves room statistics for a specific hostel.
  - Controller: [`getRoomStats`](../controllers/statsController.md#getroomstatsreq-res)
- `GET /room-change-requests/:hostelId`:
  - Retrieves room change request statistics for a specific hostel.
  - Controller: [`getRoomChangeRequestStats`](../controllers/statsController.md#getroomchangerequeststatsreq-res)
- `GET /visitor/:hostelId`:
  - Retrieves visitor statistics for a specific hostel.
  - Controller: [`getVisitorStats`](../controllers/statsController.md#getvisitorstatsreq-res)
- `GET /event/:hostelId`:
  - Retrieves event statistics for a specific hostel.
  - Controller: [`getEventStats`](../controllers/statsController.md#geteventstatsreq-res)
- `GET /wardens`:
  - Retrieves warden statistics.
  - Controller: [`getWardenStats`](../controllers/statsController.md#getwardenstatsreq-res)
- `GET /complaints`:
  - Retrieves complaint statistics.
  - Controller: [`getComplaintsStats`](../controllers/statsController.md#getcomplaintsstatsreq-res)
