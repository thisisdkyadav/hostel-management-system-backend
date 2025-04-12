## 4. Detailed Requirements by Component

### 4.1 Models (`/models`)

**Purpose:** Models define the structure (schema) of the data stored in the MongoDB database and provide an interface for interacting with specific collections. They enforce data types, validation rules, and relationships between different data entities.

**General Requirements:**

- **MOD-GR-1:** All models shall be defined using Mongoose schemas.
- **MOD-GR-2:** Each model shall correspond to a specific collection in the MongoDB database (e.g., `User` model maps to `users` collection).
- **MOD-GR-3:** Models shall define appropriate data types for each field (e.g., `String`, `Number`, `Date`, `Boolean`, `ObjectId`, `Array`).
- **MOD-GR-4:** Necessary validation rules (e.g., `required`, `enum`, `unique`, `trim`, `lowercase`, `uppercase`) shall be applied at the schema level where applicable.
- **MOD-GR-5:** Relationships between models shall be defined using `mongoose.Schema.Types.ObjectId` and the `ref` property (e.g., `Complaint.userId` references `User`).
- **MOD-GR-6:** Timestamps (`createdAt`, `updatedAt`) shall be automatically managed for relevant models, typically using Mongoose's built-in timestamp option or pre-save hooks.
- **MOD-GR-7:** Indexes shall be defined on fields frequently used in queries for performance optimization (e.g., `userId`, `rollNumber`, `email`).
- **MOD-GR-8:** Virtual fields or static/instance methods may be used to encapsulate common data retrieval or formatting logic (e.g., `StudentProfileSchema.statics.getFullStudentData`).
- **MOD-GR-9:** Sensitive data fields should not be included in default query results unless explicitly requested (e.g., user password).

**Specific Model Examples:**

- **MOD-User-1 (`User.js`):**
  - Shall store core user information: `name`, `email` (unique, required), `phone`, `profileImage`, `role` (required, enum: Student, Maintenance Staff, Warden, Associate Warden, Admin, Security, Super Admin), `password`, `aesKey`.
  - Shall include `createdAt` and `updatedAt` timestamps.
  - Shall include a virtual field `hostel` to populate associated hostel details for staff roles (Warden, Associate Warden, Security).
- **MOD-Complaint-1 (`Complaint.js`):**
  - Shall link to the reporting user (`userId`, required, ref: `User`).
  - Shall include details: `title` (required), `description` (required), `status` (required, enum: Pending, Resolved, In Progress, default: Pending), `category` (required, enum, default: Other), `priority` (enum, default: Low).
  - Shall include location context: `location`, `hostelId` (ref: `Hostel`), `unitId` (ref: `Unit`), `roomId` (ref: `Room`).
  - Shall support attachments (`attachments`: array of strings).
  - Shall track assignment and resolution: `assignedTo` (ref: `User`), `resolutionNotes`, `resolutionDate`, `resolvedBy` (ref: `User`).
  - Shall include user feedback fields: `feedback`, `feedbackRating` (enum: 1-5).
  - Shall include `createdAt` and `updatedAt` timestamps.
- **MOD-StudentProfile-1 (`StudentProfile.js`):**
  - Shall link uniquely to a `User` (`userId`, required, unique, ref: `User`).
  - Shall store academic/personal details: `rollNumber` (required, unique, index), `department`, `degree`, `admissionDate`, `address`, `dateOfBirth`, `gender` (enum), `guardian`, `guardianPhone`, `guardianEmail`.
  - Shall link to the student's current room allocation (`currentRoomAllocation`, ref: `RoomAllocation`).
  - Shall provide static methods (`getFullStudentData`, `getBasicStudentData`, `searchStudents`) for retrieving formatted and potentially aggregated student data.

_(Similar detailed requirements should be derived for all other models listed: `ApiClient`, `Notification`, `Event`, `Room`, `DisCoAction`, `RoomAllocation`, `VisitorRequest`, `VisitorProfile`, `Feedback`, `Hostel`, `AssociateWarden`, `Unit`, `MaintenanceStaff`, `RoomChangeRequest`, `CheckInOut`, `LostAndFound`, `Visitors`, `Security`, `Warden`, `Poll`)_
