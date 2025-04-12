# DisCoAction Model

Represents a disciplinary or commendation action taken regarding a specific user.

[Back to Models Overview](README.md)

## Schema Definition

| Field         | Type     | Description                                               | Constraints/Defaults          |
| :------------ | :------- | :-------------------------------------------------------- | :---------------------------- |
| `userId`      | ObjectId | Reference to the [`User`](User.md) subject to the action. | Required, Ref: `User`         |
| `reason`      | String   | The reason for the disciplinary/commendation action.      | Required                      |
| `actionTaken` | String   | Description of the action taken.                          | Required                      |
| `date`        | Date     | The date the action was recorded/took place.              | Required, Default: `Date.now` |
| `remarks`     | String   | Additional remarks or notes about the action.             | Optional                      |
