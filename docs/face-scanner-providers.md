# Face scanner providers

Run the index migration against the deployment database before starting the updated backend:

```sh
npm run migrate:scanner-providers
npm run migrate:scanner-providers -- --apply
```

The first command is a dry run. The second replaces the global unique username index with a regular username index, a unique Time Watch username index, and a unique ZKTeco device-name index. It is safe to rerun. Existing scanner documents and credentials are preserved.

In Face Scanners, select the provider when adding a device. Use **Scanner Settings** to configure an existing device. Devices without a configured provider keep the previous authentication and payload auto-detection behavior, including API clients that omit `provider` when creating a scanner.

## Time Watch

Select **Time Watch**. Credentials are generated as before. The device sends the existing single-object format and authenticates using the username/password custom header or HTTP Basic authentication. Device identification remains credential-based.

## ZKTeco

Select **ZKTeco** and enter the exact **Device Name (TERMINAL_ALIAS)** from the machine. The display name is a separate label. Device names must be unique, including for inactive devices.

Leave both credential fields blank to generate credentials, or enter an existing username and password. Multiple ZKTeco devices can share credentials. When editing, leaving both fields blank keeps the current credentials. Selecting **New Password** rotates only that device's password.

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

Each record is routed by `TERMINAL_ALIAS`; `TERMINAL_SN` is scan metadata. Every named device must be active and its credentials must match the request before any records are processed. Missing names return 400; unknown/inactive devices or incorrect credentials return 401. There is no fallback to another configured device by username or serial number.

Dates support `DD-MM-YYYY HH:mm:ss`, `YYYY-MM-DD HH:mm:ss`, and `YYYY-MM-DDTHH:mm:ss`, interpreted in the same server-local timezone as existing scans. The example means October 6, 2026. When `PUNCH_STATE` is absent, the device's configured direction is used. Optional `PUNCH_STATE` and `VERIFY_TYPE` retain their existing mappings. Invalid punches and business rejections retain the existing batch acknowledgment behavior.

For device health checks, send the same Basic credentials to `GET /api/v1/face-scanner/ping?deviceName=m1` or `/test-auth?deviceName=m1`. Shared credentials alone do not select a device.
