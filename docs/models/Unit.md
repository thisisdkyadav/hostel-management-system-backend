# Unit Model

Represents a specific unit (like a wing or apartment) within a `unit-based` hostel.

[Back to Models Overview](README.md)

## Schema Definition

| Field               | Type     | Description                                           | Constraints/Defaults                 |
| :------------------ | :------- | :---------------------------------------------------- | :----------------------------------- |
| `hostelId`          | ObjectId | Reference to the [`Hostel`](Hostel.md) it belongs to. | Required, Ref: `Hostel`              |
| `unitNumber`        | String   | The identifier for the unit (e.g., "A", "10").        | Required                             |
| `floor`             | Number   | The floor number where the unit is located.           | Optional                             |
| `commonAreaDetails` | String   | Details about the common area within the unit.        | Optional                             |
| `createdAt`         | Date     | Timestamp when the unit was created.                  | Default: `Date.now`                  |
| `updatedAt`         | Date     | Timestamp when the unit was last updated.             | Default: `Date.now`, Updated on save |

## Indexes

- Unique compound index on `hostelId` and `unitNumber`.

## Virtuals

- **`rooms`**: Populates an array of [`Room`](Room.md) documents associated with this unit.
- **`roomCount`**: Returns the total number of rooms associated with this unit (getter).
- **`capacity`**: Returns the total capacity of all active rooms within this unit (getter).
- **`occupancy`**: Returns the total occupancy of all active rooms within this unit (getter).

## Hooks

- **`pre('save')`**: Automatically updates the `updatedAt` field to the current timestamp before saving the document.
