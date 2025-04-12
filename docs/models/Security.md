# Security Model

Represents the specific details for a user with the "Security" role, linking them to a hostel.

[Back to Models Overview](README.md)

## Schema Definition

| Field       | Type     | Description                                                               | Constraints/Defaults    |
| :---------- | :------- | :------------------------------------------------------------------------ | :---------------------- |
| `userId`    | ObjectId | Reference to the associated [`User`](User.md) account.                    | Required, Ref: `User`   |
| `hostelId`  | ObjectId | Reference to the [`Hostel`](Hostel.md) the security staff is assigned to. | Required, Ref: `Hostel` |
| `createdAt` | Date     | Timestamp when the security record was created.                           | Default: `Date.now`     |
| `updatedAt` | Date     | Timestamp when the security record was last updated.                      | Default: `Date.now`     |
