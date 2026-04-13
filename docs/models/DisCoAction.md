# DisCoAction Model

Represents a disciplinary or commendation action taken regarding a specific user.

[Back to Models Overview](README.md)

## Schema Definition

| Field         | Type     | Description                                               | Constraints/Defaults          |
| :------------ | :------- | :-------------------------------------------------------- | :---------------------------- |
| `userId`      | ObjectId | Reference to the [`User`](User.md) subject to the action. | Required, Ref: `User`         |
| `reason`      | String   | The reason for the disciplinary/commendation action.      | Required                      |
| `actionTaken` | String   | Description of the action taken.                          | Required                      |
| `date`        | Date     | Legacy creation/recorded date for the action.             | Required, Default: `Date.now` |
| `punishmentStartDate` | Date | The date the punishment starts.                      | Optional, defaults to `date` on new writes |
| `punishmentEndDate` | Date | The date the punishment ends.                          | Optional, defaults to `punishmentStartDate` on new writes |
| `remarks`     | String   | Additional remarks or notes about the action.             | Optional                      |
