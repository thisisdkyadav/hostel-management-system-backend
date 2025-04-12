# Room Model

Represents an individual room within a hostel. Can belong to a [`Unit`](Unit.md) if the hostel is `unit-based`.

[Back to Models Overview](README.md)

## Schema Definition

| Field                   | Type     | Description                                                                                 | Constraints/Defaults                              |
| :---------------------- | :------- | :------------------------------------------------------------------------------------------ | :------------------------------------------------ |
| `hostelId`              | ObjectId | Reference to the [`Hostel`](Hostel.md) it belongs to.                                       | Required, Ref: `Hostel`                           |
| `unitId`                | ObjectId | Reference to the [`Unit`](Unit.md) it belongs to (optional, only for `unit-based` hostels). | Optional, Ref: `Unit`                             |
| `roomNumber`            | String   | Identifier for the room (e.g., "A", "B" for unit-based; "101", "102" for room-only).        | Required                                          |
| `capacity`              | Number   | The maximum number of occupants the room can hold.                                          | Required, Default: 1                              |
| `occupancy`             | Number   | The current number of occupants in the room.                                                | Default: 0                                        |
| `status`                | String   | The current status of the room.                                                             | Enum: `["Active", "Inactive"]`, Default: "Active" |
| `originalCapacity`      | Number   | Stores the capacity before deactivation. Used when reactivating the room.                   | Optional                                          |
| `currentRoomAllocation` | ObjectId | Reference to the latest [`RoomAllocation`](RoomAllocation.md) document for this room.       | Optional, Ref: `RoomAllocation`                   |
| `createdAt`             | Date     | Timestamp when the room was created.                                                        | Default: `Date.now`                               |
| `updatedAt`             | Date     | Timestamp when the room was last updated.                                                   | Default: `Date.now`                               |

## Indexes

- Unique compound index on `hostelId`, `unitId`, and `roomNumber`.

## Virtuals

- **`allocations`**: Populates an array of `RoomAllocation` documents associated with this room.
- **`students`**: Populates an array of `StudentProfile` documents for students currently allocated to this room (via `allocations`).

## Static Methods

- **`deactivateRoom(roomId)`**: Sets the room status to `Inactive`, saves the current `capacity` to `originalCapacity`, and sets `capacity` and `occupancy` to 0.
- **`activateRoom(roomId)`**: Sets the room status to `Active` and restores `capacity` from `originalCapacity` (if available).
- **`deactivateRooms(roomIds)`**: Performs bulk deactivation for multiple rooms.
- **`activateRooms(roomIds)`**: Performs bulk activation for multiple rooms.
