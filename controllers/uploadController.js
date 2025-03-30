import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob"
import { AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_CONTAINER_NAME, AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY } from "../config/environment.js"

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME)

export const uploadProfileImage = async (req, res) => {
  const { userId } = req.params
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { originalname, buffer, mimetype } = req.file
    const blobName = `${userId}-${originalname}`
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimetype },
    })

    const sharedKeyCredential = new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY)
    const expiryDate = new Date()
    expiryDate.setHours(expiryDate.getHours() + 1)

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: AZURE_STORAGE_CONTAINER_NAME,
        blobName,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn: expiryDate,
      },
      sharedKeyCredential
    ).toString()

    const sasUrl = `${blockBlobClient.url}?${sasToken}`

    res.status(200).json({ url: sasUrl })
  } catch (error) {
    console.error("Upload Error:", error)
    res.status(500).json({ error: "Upload failed" })
  }
}
