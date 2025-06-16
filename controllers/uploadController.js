import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob"
import { AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_CONTAINER_NAME, AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID, USE_LOCAL_STORAGE } from "../config/environment.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Azure storage setup
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME)
const containerClientStudentId = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID)

// Local storage paths
const profileImagesPath = path.join(__dirname, "..", "uploads", "profile-images")
const studentIdCardsPath = path.join(__dirname, "..", "uploads", "student-id-cards")

// Ensure directories exist
if (USE_LOCAL_STORAGE) {
  if (!fs.existsSync(profileImagesPath)) {
    fs.mkdirSync(profileImagesPath, { recursive: true })
  }
  if (!fs.existsSync(studentIdCardsPath)) {
    fs.mkdirSync(studentIdCardsPath, { recursive: true })
  }
}

export const uploadProfileImage = async (req, res) => {
  const { userId } = req.params
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { originalname, buffer, mimetype } = req.file
    const blobName = `${userId}-${originalname}`

    if (USE_LOCAL_STORAGE) {
      // Save to local storage
      const filename = `${userId}-${Date.now()}-${originalname}`
      const filepath = path.join(profileImagesPath, filename)

      fs.writeFileSync(filepath, buffer)

      // Create a URL that can be used to access the file
      const url = `/uploads/profile-images/${filename}`

      return res.status(200).json({ url })
    } else {
      // Save to Azure
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimetype },
      })

      const sharedKeyCredential = new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY)
      const expiryDate = new Date("2099-12-31")

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

      return res.status(200).json({ url: sasUrl })
    }
  } catch (error) {
    console.error("Upload Error:", error)
    res.status(500).json({ error: "Upload failed" })
  }
}

export const uploadStudentIdCard = async (req, res) => {
  const { side } = req.params // front or back
  const user = req.user
  const userId = user._id
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { originalname, buffer, mimetype } = req.file
    const blobName = `${userId}-${side}-${originalname}`

    if (USE_LOCAL_STORAGE) {
      // Save to local storage
      const filename = `${userId}-${side}-${Date.now()}-${originalname}`
      const filepath = path.join(studentIdCardsPath, filename)

      fs.writeFileSync(filepath, buffer)

      // Create a URL that can be used to access the file
      const url = `/uploads/student-id-cards/${filename}`

      return res.status(200).json({ url })
    } else {
      // Save to Azure
      const blockBlobClient = containerClientStudentId.getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimetype },
      })

      const sharedKeyCredential = new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY)
      const expiryDate = new Date("2099-12-31")

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID,
          blobName,
          permissions: BlobSASPermissions.parse("r"),
          expiresOn: expiryDate,
        },
        sharedKeyCredential
      ).toString()

      const sasUrl = `${blockBlobClient.url}?${sasToken}`

      return res.status(200).json({ url: sasUrl })
    }
  } catch (error) {
    console.error("Upload Error:", error)
    res.status(500).json({ error: "Upload failed" })
  }
}
