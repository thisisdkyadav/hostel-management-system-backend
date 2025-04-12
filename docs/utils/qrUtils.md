# QR Code Utilities (`/utils/qrUtils.js`)

This file contains utility functions related to generating encryption keys and decrypting data, likely used for securing and verifying QR code content.

[Back to Utilities Overview](README.md)

## Dependencies

- `crypto`: Node.js built-in crypto module (used for generating random bytes).
- `node-forge`: A JavaScript implementation of cryptographic tools (used for AES decryption).

## Functions

### `generateKey()`

- **Description:** Generates a cryptographically secure 32-byte (256-bit) random key.
- **Process:** Uses `crypto.randomBytes(32)` to generate random data.
- **Returns:** (String) The generated key encoded as a hexadecimal string.
- **Usage:** Used by [`authController.login`](../controllers/authController.md#loginreq-res) and [`authController.loginWithGoogle`](../controllers/authController.md#loginwithgooglereq-res) to generate or ensure an `aesKey` exists for a user.

### `decryptData(encryptedData, aesKeyHex)`

- **Description:** Decrypts data previously encrypted using AES-CBC, expecting a specific format for the input string.
- **Parameters:**
  - `encryptedData` (String): The encrypted data string. Expected format is "`ivBase64`:`encryptedBase64`", where `ivBase64` is the base64 encoded Initialization Vector (IV) and `encryptedBase64` is the base64 encoded ciphertext.
  - `aesKeyHex` (String): The 32-byte (256-bit) AES key encoded as a hexadecimal string (likely corresponds to the user's `aesKey` field).
- **Process:**
  1.  **Input Validation:** Checks if `encryptedData` contains a ":" separator and if both parts (IV and ciphertext) are present.
  2.  **Decode:** Decodes the base64 encoded IV and ciphertext using `forge.util.decode64()`.
  3.  **Length Validation:** Validates that the decoded IV is 16 bytes long and the AES key (decoded from hex using `forge.util.hexToBytes()`) is 32 bytes long. Throws an error if lengths are incorrect.
  4.  **Decryption:**
      - Creates an AES-CBC decipher using `node-forge` (`forge.cipher.createDecipher("AES-CBC", aesKey)`).
      - Starts the decipher with the provided IV.
      - Updates the decipher with the encrypted data buffer.
      - Finishes the decryption process.
  5.  **Check Success:** Verifies if `decipher.finish()` returns true. Throws an error if decryption fails (e.g., incorrect padding, wrong key, corrupt data).
- **Returns:** (String) The original plaintext data if decryption is successful.
- **Throws:** Throws an error if the input format is invalid, key/IV lengths are wrong, or decryption fails.
- **Usage:** Used in [`securityController.verifyQR`](../controllers/securityController.md#verifyqrreq-res) function to decrypt the payload from a student's QR code using the student's stored `aesKey`.
