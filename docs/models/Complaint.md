# Complaint Model

Represents a complaint or issue reported by a user.

[Back to Models Overview](README.md)

## Schema Definition

| Field             | Type     | Description                                                                    | Constraints/Defaults                                                                              |
| :---------------- | :------- | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `userId`          | ObjectId | Reference to the [`User`](User.md) who submitted the complaint.                | Required, Ref: `User`                                                                             |
| `title`           | String   | A brief title summarizing the complaint.                                       | Required                                                                                          |
| `description`     | String   | A detailed description of the complaint.                                       | Required                                                                                          |
| `status`          | String   | The current status of the complaint resolution.                                | Enum: `["Pending", "Resolved", "In Progress"]`, Default: "Pending"                                |
| `category`        | String   | The category the complaint falls under.                                        | Enum: `["Plumbing", "Electrical", "Civil", "Cleanliness", "Internet", "Other"]`, Default: "Other" |
| `priority`        | String   | The priority level assigned to the complaint.                                  | Enum: `["Low", "Medium", "High"]`, Default: "Low"                                                 |
| `location`        | String   | Specific location of the issue if not tied to a room/unit (e.g., common area). | Optional                                                                                          |
| `hostelId`        | ObjectId | Reference to the relevant [`Hostel`](Hostel.md) (if applicable).               | Ref: `Hostel`                                                                                     |
| `unitId`          | ObjectId | Reference to the relevant [`Unit`](Unit.md) (if applicable).                   | Ref: `Unit`                                                                                       |
| `roomId`          | ObjectId | Reference to the relevant [`Room`](Room.md) (if applicable).                   | Ref: `Room`                                                                                       |
| `attachments`     | [String] | An array of URLs or paths to attached files (e.g., images).                    | Optional                                                                                          |
| `assignedTo`      | ObjectId | Reference to the [`User`](User.md) (staff) assigned to handle the complaint.   | Ref: `User`                                                                                       |
| `resolutionNotes` | String   | Notes provided by the staff upon resolving the complaint.                      | Optional                                                                                          |
| `resolutionDate`  | Date     | The date when the complaint was marked as resolved.                            | Optional                                                                                          |
| `resolvedBy`      | ObjectId | Reference to the [`User`](User.md) (staff) who resolved the complaint.         | Ref: `User`                                                                                       |
| `feedback`        | String   | Feedback provided by the original reporter after resolution.                   | Optional                                                                                          |
| `feedbackRating`  | Number   | A numerical rating (1-5) provided by the reporter after resolution.            | Optional, Enum: `[1, 2, 3, 4, 5]`                                                                 |
| `createdAt`       | Date     | Timestamp when the complaint was created.                                      | Default: `Date.now`                                                                               |
| `updatedAt`       | Date     | Timestamp when the complaint was last updated.                                 | Default: `Date.now`, Updated on save                                                              |

## Middleware (Hooks)

- **`pre('save')`**: Automatically updates the `updatedAt` field to the current timestamp before saving the document.
