# User Model

Represents a user account in the system. Users can have different roles affecting their permissions and associated data (e.g., [`StudentProfile`](StudentProfile.md), [`Warden`](Warden.md), [`AssociateWarden`](AssociateWarden.md), [`MaintenanceStaff`](MaintenanceStaff.md), [`Security`](Security.md)).

[Back to Models Overview](README.md)

## Schema Definition

| Field          | Type   | Description                                                                                                         | Constraints/Defaults                                                                                                 |
| :------------- | :----- | :------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------- |
| `name`         | String | The full name of the user.                                                                                          | Required                                                                                                             |
| `email`        | String | The email address of the user, used for login and communication.                                                    | Required, Unique                                                                                                     |
| `phone`        | String | The phone number of the user.                                                                                       | Optional                                                                                                             |
| `profileImage` | String | URL or path to the user's profile image.                                                                            | Optional                                                                                                             |
| `role`         | String | The role assigned to the user, determining access levels and functionality.                                         | Required, Enum: `["Student", "Maintenance Staff", "Warden", "Associate Warden", "Admin", "Security", "Super Admin"]` |
| `password`     | String | The hashed password for the user account.                                                                           | Optional (e.g., for OAuth users)                                                                                     |
| `aesKey`       | String | AES encryption key associated with the user (used for QR code data, see [`utils/qrUtils.md`](../utils/qrUtils.md)). | Optional                                                                                                             |
| `createdAt`    | Date   | Timestamp when the user account was created.                                                                        | Default: `Date.now`                                                                                                  |
| `updatedAt`    | Date   | Timestamp when the user account was last updated.                                                                   | Default: `Date.now`, Updated on save                                                                                 |

## Virtuals

- **`hostel`**: Dynamically populates the associated hostel information based on the user's role (`Warden`, `Associate Warden`, `Security`). It resolves to the specific role model ([`Warden`](Warden.md), [`AssociateWarden`](AssociateWarden.md), [`Security`](Security.md)) and then populates the `hostelId` from that model.

## Middleware (Hooks)

- **`pre('save')`**: Automatically updates the `updatedAt` field to the current timestamp before saving the document.
- **`pre(/^find/)`**: Automatically populates the `hostel` virtual field whenever a `find` operation is performed. It fetches the related [`Warden`](Warden.md)/[`AssociateWarden`](AssociateWarden.md)/[`Security`](Security.md) document, then populates the `hostelId` (selecting only the `name`) from the referenced [`Hostel`](Hostel.md).
- **`post(/^find/)`**: After a `find` operation and population, this hook simplifies the populated `hostel` data to only include the hostel's `_id` and `name`, removing the intermediate role model data.
