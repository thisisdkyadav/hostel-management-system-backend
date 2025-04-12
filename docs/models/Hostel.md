# Hostel Model

Represents a hostel building within the system.

[Back to Models Overview](README.md)

## Schema Definition

| Field       | Type   | Description                                  | Constraints/Defaults                          |
| :---------- | :----- | :------------------------------------------- | :-------------------------------------------- |
| `name`      | String | The unique name of the hostel.               | Required, Unique                              |
| `type`      | String | The structure type of the hostel.            | Required, Enum: `["unit-based", "room-only"]` |
| `gender`    | String | The gender accommodation type of the hostel. | Required, Enum: `["Boys", "Girls", "Co-ed"]`  |
| `createdAt` | Date   | Timestamp when the hostel was created.       | Default: `Date.now`                           |
| `updatedAt` | Date   | Timestamp when the hostel was last updated.  | Default: `Date.now`, Updated on save          |

## Hooks

- **`pre('save')`**: Automatically updates the `updatedAt` field to the current timestamp before saving the document.
