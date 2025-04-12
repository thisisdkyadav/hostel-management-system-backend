# Complaint Routes (`/routes/complaintRoutes.js`)

Defines API routes for managing student complaints.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`complaintController.js`](../controllers/complaintController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/complaints` (assuming `/complaints` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Ensures the user is logged in before accessing any complaint-related route.

## Routes

- `POST /student/complaints`:
  - Creates a new complaint (likely submitted by a student).
  - Controller: [`createComplaint`](../controllers/complaintController.md#createcomplaintreq-res)
- `GET /student/complaints/:userId`:
  - Retrieves all complaints submitted by a specific student (identified by `:userId`).
  - Controller: [`getStudentComplaints`](../controllers/complaintController.md#getstudentcomplaintsreq-res)
- `GET /all`:
  - Retrieves all complaints (likely for admin/staff view).
  - Controller: [`getAllComplaints`](../controllers/complaintController.md#getallcomplaintsreq-res)
- `PUT /update-status/:id`:
  - Updates the status of a specific complaint (identified by `:id`).
  - Controller: [`updateComplaintStatus`](../controllers/complaintController.md#updatecomplaintstatusreq-res)
- `GET /stats`:
  - Retrieves statistics related to complaints.
  - Controller: [`getStats`](../controllers/complaintController.md#getstatsreq-res)
- `GET /:id`: (Commented out)
  - Intended to retrieve a single complaint by its ID.
