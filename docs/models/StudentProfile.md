# StudentProfile Model

Represents the detailed profile information for a user with the "Student" role.

[Back to Models Overview](README.md)

## Schema Definition

| Field                   | Type     | Description                                                                        | Constraints/Defaults                                |
| :---------------------- | :------- | :--------------------------------------------------------------------------------- | :-------------------------------------------------- |
| `userId`                | ObjectId | Reference to the associated [`User`](User.md) account.                             | Required, Unique, Indexed, Ref: `User`              |
| `rollNumber`            | String   | The student's unique roll number.                                                  | Required, Unique, Indexed, Trim, Uppercase          |
| `department`            | String   | The academic department of the student.                                            | Optional, Trim                                      |
| `degree`                | String   | The degree program the student is enrolled in.                                     | Optional, Trim                                      |
| `admissionDate`         | Date     | The date the student was admitted.                                                 | Optional                                            |
| `address`               | String   | The permanent address of the student.                                              | Optional, Trim                                      |
| `dateOfBirth`           | Date     | The student's date of birth.                                                       | Optional                                            |
| `gender`                | String   | The gender of the student.                                                         | Optional, Enum: `["Male", "Female", "Other"]`, Trim |
| `guardian`              | String   | The name of the student's guardian.                                                | Optional, Trim                                      |
| `guardianPhone`         | String   | The phone number of the student's guardian.                                        | Optional, Trim                                      |
| `guardianEmail`         | String   | The email address of the student's guardian.                                       | Optional                                            |
| `currentRoomAllocation` | ObjectId | Reference to the student's current [`RoomAllocation`](RoomAllocation.md) document. | Optional, Ref: `RoomAllocation`                     |

## Indexes

- Unique index on `userId`.
- Unique index on `rollNumber`.

## Static Methods

- **`getFullStudentData(userId)`**: Asynchronously retrieves comprehensive data for one or more students based on their `userId`(s). Populates related [`User`](User.md) and [`RoomAllocation`](RoomAllocation.md) data (including nested [`Room`](Room.md), [`Unit`](Unit.md), [`Hostel`](Hostel.md)). Calculates the student's current year based on `admissionDate`. Formats the output for display.
- **`getBasicStudentData(userId)`**: Asynchronously retrieves basic data for one or more students based on their `userId`(s). Populates related [`User`](User.md) and limited [`RoomAllocation`](RoomAllocation.md) data (hostel name, display room string). Formats the output.
- **`searchStudents(params)`**: Asynchronously searches and filters student profiles based on various criteria provided in the `params` object (e.g., `name`, `email`, `rollNumber`, `department`, `hostelId`, `hasAllocation`, etc.). Supports pagination (`page`, `limit`) and sorting (`sortBy`, `sortOrder`). Uses an aggregation pipeline to perform lookups and matching across [`User`](User.md), `StudentProfile`, and potentially [`RoomAllocation`](RoomAllocation.md) collections.
  - _Note: The full implementation details of the aggregation pipeline were not fully visible in the partial file read._

## Methods (Instance)

- _(Potentially others - full file view was restricted)_

## Hooks

- _(Potentially others - full file view was restricted)_
