import crypto from "crypto"
import forge from "node-forge"

export async function generateKey() {
  return crypto.randomBytes(32).toString("hex")
}

export async function decryptData(encryptedData, aesKeyHex) {
  try {
    if (!encryptedData.includes(":")) {
      throw new Error("Invalid encrypted data format")
    }

    const [ivBase64, encryptedBase64] = encryptedData.split(":")
    if (!ivBase64 || !encryptedBase64) {
      throw new Error("Invalid encrypted data format")
    }

    const iv = forge.util.decode64(ivBase64)
    const encrypted = forge.util.decode64(encryptedBase64)

    if (iv.length !== 16) {
      throw new Error(`Invalid IV length: ${iv.length} bytes (expected 16)`)
    }

    const aesKey = forge.util.hexToBytes(aesKeyHex)

    if (aesKey.length !== 32) {
      throw new Error(`Invalid AES key length: ${aesKey.length} bytes (expected 32)`)
    }

    const decipher = forge.cipher.createDecipher("AES-CBC", aesKey)
    decipher.start({ iv })
    decipher.update(forge.util.createBuffer(encrypted))
    const success = decipher.finish()

    if (!success) {
      throw new Error("Decryption failed: Incorrect padding or corrupt data.")
    }
    return decipher.output.toString()
  } catch (error) {
    console.error("Decryption failed:", error.message)
    throw error
  }
}
