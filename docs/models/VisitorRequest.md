# VisitorRequest Model

Represents a request made by a student ([`User`](User.md)) for one or more visitors ([`VisitorProfile`](VisitorProfile.md)) to visit the hostel ([`Hostel`](Hostel.md)).

[Back to Models Overview](README.md)

## Schema Definition

| Field                | Type       | Description                                                                                  | Constraints/Defaults                                            |
| :------------------- | :--------- | :------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| `userId`             | ObjectId   | Reference to the [`User`](User.md) (student) making the request.                             | Required, Ref: `User`                                           |
| `visitors`           | [ObjectId] | Array of references to the [`VisitorProfile`](VisitorProfile.md)(s) included in the request. | Ref: `VisitorProfile`                                           |
| `reason`             | String     | The reason for the visit request.                                                            | Required                                                        |
| `fromDate`           | Date       | The start date/time of the requested visit.                                                  | Required                                                        |
| `toDate`             | Date       | The end date/time of the requested visit.                                                    | Required                                                        |
| `hostelId`           | ObjectId   | Reference to the [`Hostel`](Hostel.md) the visitor(s) intend to visit.                       | Ref: `Hostel`                                                   |
| `allocatedRooms`     | [ObjectId] | Array of references to [`Room`](Room.md)(s) allocated for the visitor(s) (if any).           | Ref: `Room`                                                     |
| `status`             | String     | The current status of the visitor request.                                                   | Enum: `["Pending", "Approved", "Rejected"]`, Default: "Pending" |
| `reasonForRejection` | String     | If the status is "Rejected", the reason provided.                                            | Optional                                                        |
| `checkInTime`        | Date       | Timestamp when the visitor(s) actually checked in (recorded by security).                    | Optional                                                        |
| `checkOutTime`       | Date       | Timestamp when the visitor(s) actually checked out (recorded by security).                   | Optional                                                        |
| `securityNotes`      | String     | Notes added by security staff regarding the visit.                                           | Optional                                                        |
| `createdAt`          | Date       | Timestamp when the visitor request was created.                                              | Default: `Date.now`                                             |

## Middleware (Hooks)

- **`pre('findOneAndDelete')`**: Prevents deletion of a visitor request if its `status` is not "Pending".
- **`post('save')`**: After saving a visitor request, automatically adds the request's ID to the `requests` array of each associated [`VisitorProfile`](VisitorProfile.md).
- **`post('findOneAndDelete')`**: After deleting a visitor request, automatically removes the request's ID from the `requests` array of each associated [`VisitorProfile`](VisitorProfile.md).
