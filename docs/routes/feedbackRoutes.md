# Feedback Routes (`/routes/feedbackRoutes.js`)

Defines API routes for managing feedback submitted by users (likely students).

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`feedbackController.js`](../controllers/feedbackController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/feedback` (assuming `/feedback` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing feedback routes are logged in.

## Routes

- `POST /add`:
  - Submits new feedback.
  - Controller: [`createFeedback`](../controllers/feedbackController.md#createfeedbackreq-res)
- `GET /`:
  - Retrieves all feedback (likely for admin/staff view).
  - Controller: [`getFeedbacks`](../controllers/feedbackController.md#getfeedbacksreq-res)
- `GET /student/:userId`:
  - Retrieves all feedback submitted by a specific student (identified by `:userId`).
  - Controller: [`getStudentFeedbacks`](../controllers/feedbackController.md#getstudentfeedbacksreq-res)
- `PUT /:feedbackId`:
  - Updates the content of existing feedback (identified by `:feedbackId`). (Permissions might be restricted based on user role/ownership in the controller).
  - Controller: [`updateFeedback`](../controllers/feedbackController.md#updatefeedbackreq-res)
- `DELETE /:feedbackId`:
  - Deletes existing feedback (identified by `:feedbackId`). (Permissions might be restricted based on user role/ownership in the controller).
  - Controller: [`deleteFeedback`](../controllers/feedbackController.md#deletefeedbackreq-res)
- `PUT /update-status/:feedbackId`:
  - Updates the status of feedback (e.g., read, addressed) (identified by `:feedbackId`).
  - Controller: [`updateFeedbackStatus`](../controllers/feedbackController.md#updatefeedbackstatusreq-res)
- `POST /reply/:feedbackId`:
  - Adds a reply to existing feedback (identified by `:feedbackId`).
  - Controller: [`replyToFeedback`](../controllers/feedbackController.md#replytofeedbackreq-res)
