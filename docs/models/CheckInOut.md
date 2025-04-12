# CheckInOut Model

Represents a record of a student checking into or out of their allocated room.

[Back to Models Overview](README.md)

_Note: It seems this model stores room/unit/bed as strings rather than references. Consider if referencing [`RoomAllocation`](RoomAllocation.md) or [`Room`](Room.md) directly might be more appropriate._

## Schema Definition

| Field         | Type     | Description                                                   | Constraints/Defaults                            |
| :------------ | :------- | :------------------------------------------------------------ | :---------------------------------------------- |
| `userId`      | ObjectId | Reference to the [`User`](User.md) (student) checking in/out. | Required, Ref: `User`                           |
| `hostelId`    | ObjectId | Reference to the [`Hostel`](Hostel.md) involved.              | Required, Ref: `Hostel`                         |
| `room`        | String   | The room number (stored as string).                           | Required                                        |
| `unit`        | String   | The unit number (stored as string).                           | Required                                        |
| `bed`         | String   | The bed number (stored as string).                            | Required                                        |
| `dateAndTime` | Date     | Timestamp of the check-in/out event.                          | Default: `Date.now`                             |
| `status`      | String   | Indicates whether it's a check-in or check-out event.         | Required, Enum: `["Checked In", "Checked Out"]` |
