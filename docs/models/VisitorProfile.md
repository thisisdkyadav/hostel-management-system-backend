# VisitorProfile Model

Represents the profile of a potential visitor associated with a specific student.

[Back to Models Overview](README.md)

## Schema Definition

| Field           | Type       | Description                                                                                     | Constraints/Defaults  |
| :-------------- | :--------- | :---------------------------------------------------------------------------------------------- | :-------------------- |
| `studentUserId` | ObjectId   | Reference to the [`User`](User.md) (student) this visitor is associated with.                   | Required, Ref: `User` |
| `name`          | String     | The full name of the visitor.                                                                   | Required              |
| `phone`         | String     | The visitor's phone number.                                                                     | Required              |
| `email`         | String     | The visitor's email address.                                                                    | Required              |
| `relation`      | String     | The visitor's relationship to the student.                                                      | Required              |
| `address`       | String     | The visitor's address.                                                                          | Optional              |
| `requests`      | [ObjectId] | An array of references to [`VisitorRequest`](VisitorRequest.md) documents made by this visitor. | Ref: `VisitorRequest` |

## Middleware (Hooks)

- **`pre(['findOneAndDelete', 'findOneAndUpdate'])`**: Prevents deletion or update of a visitor profile if it has associated [`VisitorRequest`](VisitorRequest.md) records. Returns an error if deletion/update is attempted on a profile with existing requests.
