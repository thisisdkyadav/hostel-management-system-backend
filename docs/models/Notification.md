# Notification Model

Represents a notification or announcement sent within the system, potentially targeted to specific groups.

[Back to Models Overview](README.md)

## Schema Definition

| Field        | Type     | Description                                                                     | Constraints/Defaults                              |
| :----------- | :------- | :------------------------------------------------------------------------------ | :------------------------------------------------ |
| `title`      | String   | The title of the notification.                                                  | Required, Trim                                    |
| `message`    | String   | The main content/body of the notification.                                      | Required                                          |
| `type`       | String   | The type of notification (currently only "announcement").                       | Enum: `["announcement"]`, Default: "announcement" |
| `sender`     | ObjectId | Reference to the [`User`](User.md) who sent the notification.                   | Required, Ref: `User`                             |
| `hostelId`   | ObjectId | Optional target: Send only to users associated with this [`Hostel`](Hostel.md). | Ref: `Hostel`                                     |
| `degree`     | String   | Optional target: Send only to students in this degree program.                  | Optional                                          |
| `department` | String   | Optional target: Send only to students in this department.                      | Optional                                          |
| `gender`     | String   | Optional target: Send only to students of this gender.                          | Optional, Enum: `["Male", "Female", "Other"]`     |
| `createdAt`  | Date     | Timestamp when the notification was created.                                    | Default: `Date.now`                               |
| `expiryDate` | Date     | Timestamp when the notification should expire (automatically removed?).         | Default: 15 days from `createdAt`                 |

## Indexes

- Index on `createdAt` (descending).
- Index on `expiryDate` (ascending).
