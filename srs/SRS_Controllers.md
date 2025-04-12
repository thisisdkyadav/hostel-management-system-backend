### 4.3 Controllers (`/controllers`)

**Purpose:** Controllers contain the core application logic. They handle requests forwarded by the routes, validate input, interact with models to perform CRUD operations or other business logic, and formulate the HTTP response to be sent back to the client.

**General Requirements:**

- **CTL-GR-1:** Each route file shall generally correspond to one or more controller files containing the implementation logic.
- **CTL-GR-2:** Controller functions shall be asynchronous (using `async/await`) when dealing with database operations or other I/O.
- **CTL-GR-3:** The `express-async-handler` middleware should be used to wrap controller functions, automatically handling promise rejections and passing errors to Express error handlers.
- **CTL-GR-4:** Controllers shall extract necessary data from the request object (`req.params`, `req.query`, `req.body`, `req.user`).
- **CTL-GR-5:** Input validation (beyond basic type checking in models) should be performed within controllers or dedicated validation middleware (if used).
- **CTL-GR-6:** Controllers shall interact with Mongoose models to fetch, create, update, or delete data.
- **CTL-GR-7:** Controllers shall implement the specific business logic associated with the endpoint (e.g., calculating statistics, formatting data, checking permissions beyond basic role checks).
- **CTL-GR-8:** Controllers shall construct appropriate HTTP responses using the response object (`res`), setting status codes (e.g., 200, 201, 400, 401, 403, 404, 500) and sending JSON data.
- **CTL-GR-9:** Sensitive information (e.g., passwords) should be explicitly excluded from data sent back in responses.
- **CTL-GR-10:** Errors should be handled gracefully, providing informative (but not overly revealing) error messages in responses.

**Specific Controller Function Examples (Inferred from Routes):**

- **CTL-Auth-Login (`authController.login`):**
  - Shall extract `email` and `password` from `req.body`.
  - Shall find the user by email using the `User` model.
  - Shall verify the provided password against the stored hash using `bcrypt`.
  - Shall generate a JWT if credentials are valid.
  - Shall send the JWT (e.g., in a cookie or response body) and user details (excluding password) with a 200 status.
  - Shall send appropriate error responses (e.g., 401 for invalid credentials, 500 for server errors).
- **CTL-Student-GetProfile (`studentController.getStudentProfile`):**
  - Shall extract the logged-in `userId` from `req.user` (populated by `authenticate` middleware).
  - Shall use the `StudentProfile` model (e.g., `StudentProfile.getFullStudentData(userId)`) to fetch the profile data associated with the user.
  - Shall populate necessary related data (User details, Room Allocation details).
  - Shall send the formatted student profile data with a 200 status.
  - Shall send a 404 status if the profile is not found.
- **CTL-Student-FileComplaint (`studentController.fileComplaint`):**
  - Shall extract complaint details (`title`, `description`, `category`, etc.) from `req.body` and `userId` from `req.params`.
  - Shall potentially perform validation on input fields.
  - Shall create a new document using the `Complaint` model.
  - Shall potentially link the complaint to the student's current `hostelId`, `unitId`, `roomId` fetched from their profile or allocation.
  - Shall send the created complaint data with a 201 status.
  - Shall handle potential errors during creation (e.g., validation errors, database errors).

_(Similar detailed requirements should be derived for all other controller functions.)_
