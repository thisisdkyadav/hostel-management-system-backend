# Face scanner providers

Stop scanner/admin writes and run the account migration against the deployment database before starting the updated backend:

```sh
npm run migrate:scanner-accounts
npm run migrate:scanner-accounts -- --apply
```

The first command is a read-only dry run. The second groups existing ZKTeco scanners by case-insensitive username, moves credentials to accounts, removes credentials from devices, and replaces the global device-name index with account-scoped uniqueness. Each group migrates atomically; rerunning is safe. Shared usernames produce a warning listing devices: the most recently updated device supplies the account password hash, so regenerate the account password if a device fails authentication. Time Watch and legacy documents are preserved.

Deployments older than the provider migration must first run `npm run migrate:scanner-providers -- --apply` using that release, to remove the old global unique username index.

Devices without a configured provider keep the previous authentication and payload auto-detection behavior, including API clients that omit `provider` when creating a scanner.

## Time Watch

Select **Time Watch**. Credentials are generated as before. The device sends the existing single-object format and authenticates using the username/password custom header or HTTP Basic authentication. Device identification remains credential-based.

## ZKTeco

Create a **ZKTeco account**, then add devices inside it using the exact **Device Name (TERMINAL_ALIAS)** from each machine. The display name is a separate label. Device names must be unique within an account, including for inactive devices; different accounts may use the same alias.

An account owns the username/password. Leave both fields blank at account creation to generate credentials, or supply both. Account usernames are unique case-insensitively and cannot overlap Time Watch/legacy usernames. Selecting **New Password** rotates the account password for every device in it. Device-level credentials and password regeneration are rejected.

Account management is under `/api/v1/face-scanner/accounts`, protected by the existing scanner-management role and route guard. List/detail responses include `scannerCount` and populated `scanners`; hashes are excluded. Create and password-regeneration responses include one-time `credentials`. Scanner creation requires `accountId` and returns `{ scanner }` without credentials. Update `accountId` to move a device. Accounts with devices cannot be deleted (409).

Push to `POST /api/v1/face-scanner/scan` with `Authorization: Basic base64(username:password)` and a JSON array:

```json
[
  {
    "EMP_CODE": "230001024",
    "PUNCH_DATETIME": "06-10-2026 14:04:17",
    "TERMINAL_ALIAS": "m1",
    "TERMINAL_SN": "AJE1261500721"
  }
]
```

Each record is routed by `TERMINAL_ALIAS`; `TERMINAL_SN` is scan metadata. The account must be active and its Basic credentials must match. Every named device must be active and belong to that account before any records are processed. Missing/unknown/inactive aliases, inactive accounts, or incorrect credentials return 401. There is no fallback to another configured device by username or serial number.

Dates support `DD-MM-YYYY HH:mm:ss`, `YYYY-MM-DD HH:mm:ss`, and `YYYY-MM-DDTHH:mm:ss`, interpreted in the same server-local timezone as existing scans. The example means October 6, 2026. When `PUNCH_STATE` is absent, the device's configured direction is used. Optional `PUNCH_STATE` and `VERIFY_TYPE` retain their existing mappings. Invalid punches and business rejections retain the existing batch acknowledgment behavior.

For device health checks, send the same Basic credentials to `GET /api/v1/face-scanner/ping?deviceName=m1` or `/test-auth?deviceName=m1`. Shared credentials alone do not select a device.
