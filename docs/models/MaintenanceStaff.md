# MaintenanceStaff Model

Represents the specific details for a user with the "Maintenance Staff" role.

[Back to Models Overview](README.md)

## Schema Definition

| Field       | Type     | Description                                                        | Constraints/Defaults                                                                      |
| :---------- | :------- | :----------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| `userId`    | ObjectId | Reference to the associated [`User`](User.md) account.             | Required, Unique, Ref: `User`                                                             |
| `category`  | String   | The primary category of maintenance work the staff member handles. | Required, Enum: `["Plumbing", "Electrical", "Civil", "Cleanliness", "Internet", "Other"]` |
| `createdAt` | Date     | Timestamp when the maintenance staff record was created.           | Default: `Date.now`                                                                       |
| `updatedAt` | Date     | Timestamp when the maintenance staff record was last updated.      | Default: `Date.now`                                                                       |
