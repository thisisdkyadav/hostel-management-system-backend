# ApiClient Model

Represents a registered client application or service that can interact with the API using an API key.

[Back to Models Overview](README.md)

## Usage

This model is primarily used by the external API authentication middleware ([`externalApi/middleware/apiAuth.md`](../externalApi/middleware/apiAuth.md)) to validate incoming API keys.

## Schema Definition

| Field       | Type    | Description                                         | Constraints/Defaults |
| :---------- | :------ | :-------------------------------------------------- | :------------------- |
| `name`      | String  | A unique name identifying the client application.   | Required, Unique     |
| `apiKey`    | String  | The API key assigned to the client.                 | Required             |
| `createdAt` | Date    | Timestamp when the API client record was created.   | Default: `Date.now`  |
| `expiresAt` | Date    | Optional expiration date for the API key.           | Optional             |
| `isActive`  | Boolean | Flag indicating if the API key is currently active. | Default: `true`      |
