# LostAndFound Model

Represents an item listed in the Lost and Found section.

[Back to Models Overview](README.md)

## Schema Definition

| Field         | Type     | Description                                      | Constraints/Defaults                                 |
| :------------ | :------- | :----------------------------------------------- | :--------------------------------------------------- |
| `itemName`    | String   | The name or brief title of the lost/found item.  | Required, Trim, MinLength: 1, MaxLength: 100         |
| `description` | String   | A detailed description of the item.              | Required, Trim, MinLength: 1, MaxLength: 500         |
| `dateFound`   | Date     | The date when the item was found or reported.    | Default: `Date.now`                                  |
| `status`      | String   | The current status of the item.                  | Enum: `["Active", "Claimed"]`, Default: "Active"     |
| `images`      | [String] | An array of URLs pointing to images of the item. | Optional, Elements are trimmed and validated as URLs |

## Validation

- **`images`**: Each string in the `images` array is validated to ensure it is a valid URL format.
