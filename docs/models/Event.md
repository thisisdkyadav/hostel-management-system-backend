# Event Model

Represents an event scheduled within the hostel management system.

[Back to Models Overview](README.md)

## Schema Definition

| Field         | Type     | Description                                                                  | Constraints/Defaults                          |
| :------------ | :------- | :--------------------------------------------------------------------------- | :-------------------------------------------- |
| `eventName`   | String   | The name of the event.                                                       | Required, Trim, MinLength: 1, MaxLength: 100  |
| `description` | String   | A detailed description of the event.                                         | Required, Trim, MinLength: 1, MaxLength: 500  |
| `dateAndTime` | Date     | The scheduled date and time of the event.                                    | Required                                      |
| `hostelId`    | ObjectId | Optional reference to a specific [`Hostel`](Hostel.md) the event relates to. | Ref: `Hostel`                                 |
| `gender`      | String   | Optional gender restriction for the event attendees.                         | Optional, Enum: `["Male", "Female", "Other"]` |

## Virtuals

- **`hostel`**: Populates the associated `Hostel` document using the `hostelId`.

## Middleware (Hooks)

- **`pre(/^find/)`**: Automatically populates the `hostel` virtual field (selecting only the `name`) whenever a `find` operation is performed on the Event model.
