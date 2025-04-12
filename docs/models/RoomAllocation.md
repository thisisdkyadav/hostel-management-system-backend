# RoomAllocation Model

Represents the allocation of a specific bed within a [`Room`](Room.md) to a [`StudentProfile`](StudentProfile.md).

[Back to Models Overview](README.md)

## Schema Definition

| Field              | Type     | Description                                                     | Constraints/Defaults                        |
| :----------------- | :------- | :-------------------------------------------------------------- | :------------------------------------------ |
| `userId`           | ObjectId | Reference to the [`User`](User.md) associated with the student. | Required, Ref: `User`                       |
| `studentProfileId` | ObjectId | Reference to the [`StudentProfile`](StudentProfile.md).         | Required, Ref: `StudentProfile`             |
| `hostelId`         | ObjectId | Reference to the [`Hostel`](Hostel.md).                         | Required, Ref: `Hostel`                     |
| `roomId`           | ObjectId | Reference to the [`Room`](Room.md).                             | Required, Ref: `Room`                       |
| `unitId`           | ObjectId | Reference to the [`Unit`](Unit.md) (if applicable).             | Ref: `Unit`                                 |
| `bedNumber`        | Number   | The specific bed number assigned within the room.               | Required                                    |
| `createdAt`        | Date     | Timestamp when the allocation was created.                      | Automatically managed by `timestamps: true` |
| `updatedAt`        | Date     | Timestamp when the allocation was last updated.                 | Automatically managed by `timestamps: true` |

## Options

- `timestamps: true`: Automatically adds `createdAt` and `updatedAt` fields.

## Virtuals

- **`room`**: Populates the associated `Room` document.
- **`displayRoomNumber`**: Returns a formatted string representing the room and bed allocation (e.g., "A101-1" for unit-based, "101-1" for room-only). Requires the `room` virtual to be populated with `unitId` (if applicable).

## Middleware (Hooks)

- **`post('save')`**: After saving a single allocation:
  - Updates the corresponding [`StudentProfile`](StudentProfile.md) to set `currentRoomAllocation` to this allocation's ID.
  - Increments the `occupancy` count of the allocated [`Room`](Room.md).
- **`post('insertMany')`**: After inserting multiple allocations:
  - Performs bulk updates on [`StudentProfile`](StudentProfile.md) documents to set `currentRoomAllocation`.
  - Performs bulk updates on [`Room`](Room.md) documents to increment `occupancy` based on the number of allocations per room.
- **`pre('findOneAndUpdate')`**: Before updating an allocation, if the `roomId` is being changed, it stores the old and new `roomId` in `this._oldRoomId` and `this._newRoomId` for use in the post hook.
- **`post('findOneAndUpdate')`**: After updating an allocation, if the `roomId` was changed (detected in the pre hook), it decrements the `occupancy` of the old room and increments the `occupancy` of the new room.
- **`pre('deleteOne')`, `pre('findOneAndDelete')`, `pre('deleteMany')`**: Before deleting one or more allocations:
  - Finds the allocation(s) being deleted.
  - Unsets the `currentRoomAllocation` field on the corresponding [`StudentProfile`](StudentProfile.md)(s).
  - Decrements the `occupancy` count of the corresponding [`Room`](Room.md)(s).
  - Handles bulk updates efficiently for `deleteMany`.
