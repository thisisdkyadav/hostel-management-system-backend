# Warden Model

Represents the specific details for a user with the "Warden" role, linking them to a hostel.

[Back to Models Overview](README.md)

## Schema Definition

| Field       | Type     | Description                                                       | Constraints/Defaults                                      |
| :---------- | :------- | :---------------------------------------------------------------- | :-------------------------------------------------------- |
| `userId`    | ObjectId | Reference to the associated [`User`](User.md) account.            | Required, Unique, Ref: `User`                             |
| `hostelId`  | ObjectId | Reference to the [`Hostel`](Hostel.md) the warden is assigned to. | Ref: `Hostel`                                             |
| `status`    | String   | The current assignment status of the warden.                      | Enum: `["assigned", "unassigned"]`, Default: "unassigned" |
| `joinDate`  | Date     | The date the user became a warden.                                | Default: `Date.now`                                       |
| `createdAt` | Date     | Timestamp when the warden record was created.                     | Default: `Date.now`                                       |
| `updatedAt` | Date     | Timestamp when the warden record was last updated.                | Default: `Date.now`                                       |
