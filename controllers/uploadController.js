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
const h2FormsPath = path.join(__dirname, "..", "uploads", "h2-forms")

// Ensure directories exist
if (USE_LOCAL_STORAGE) {
  if (!fs.existsSync(profileImagesPath)) {
    fs.mkdirSync(profileImagesPath, { recursive: true })
  }
  if (!fs.existsSync(studentIdCardsPath)) {
    fs.mkdirSync(studentIdCardsPath, { recursive: true })
  }
  if (!fs.existsSync(h2FormsPath)) {
    fs.mkdirSync(h2FormsPath, { recursive: true })
  }
}

export const uploadProfileImage = async (req, res) => {
  const { userId } = req.params
  const user = req.user
  const userRole = user.role
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    if (userRole === "Student" && userId !== user._id) {
      return res.status(403).json({ error: "You don't have permission to upload profile image for this user" })
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

export const h2FormPDF = async (req, res) => {
  const user = req.user
  const userId = user?._id
  try {
    // Support either single file (req.file) or any field (req.files)
    const incomingFile = req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined)
    if (!incomingFile) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { originalname, buffer, mimetype } = incomingFile

    // Basic validation for PDF
    const isPdf = mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      return res.status(400).json({ error: "Only PDF files are allowed" })
    }

    const timestamp = Date.now()
    const safeOriginal = path.parse(originalname).name.replace(/[^a-zA-Z0-9-_]/g, "_") + ".pdf"
    const blobName = `h2-forms/${userId}-${timestamp}-${safeOriginal}`

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${timestamp}-${safeOriginal}`
      const filepath = path.join(h2FormsPath, filename)

      fs.writeFileSync(filepath, buffer)

      const url = `/uploads/h2-forms/${filename}`
      return res.status(200).json({ url })
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: "application/pdf" },
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

export const uploadPaymentScreenshot = async (req, res) => {
  const user = req.user
  const userId = user?._id
  try {
    const incomingFile = req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined)
    if (!incomingFile) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { originalname, buffer, mimetype } = incomingFile

    // Basic validation for image types
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]
    if (!allowedMimeTypes.includes(mimetype)) {
      return res.status(400).json({ error: "Only image files are allowed (png, jpg, jpeg, webp, gif)" })
    }

    const timestamp = Date.now()
    const parsed = path.parse(originalname)
    const safeBase = parsed.name.replace(/[^a-zA-Z0-9-_]/g, "_")
    const safeExt = parsed.ext && parsed.ext.length <= 10 ? parsed.ext : ".png"
    const blobName = `payment-screenshots/${userId || "anonymous"}-${timestamp}-${safeBase}${safeExt}`

    if (USE_LOCAL_STORAGE) {
      // Ensure directory exists locally
      const paymentScreenshotsPath = path.join(__dirname, "..", "uploads", "payment-screenshots")
      if (!fs.existsSync(paymentScreenshotsPath)) {
        fs.mkdirSync(paymentScreenshotsPath, { recursive: true })
      }

      const filename = `${userId || "anonymous"}-${timestamp}-${safeBase}${safeExt}`
      const filepath = path.join(paymentScreenshotsPath, filename)

      fs.writeFileSync(filepath, buffer)

      const url = `/uploads/payment-screenshots/${filename}`
      return res.status(200).json({ url })
    } else {
      // Upload to Azure in the default container under payment-screenshots/
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

export const uploadLostAndFoundImage = async (req, res) => {
  const user = req.user
  const userId = user?._id
  try {
    const incomingFile = req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined)
    if (!incomingFile) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { originalname, buffer, mimetype } = incomingFile

    // Basic validation for image types
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]
    if (!allowedMimeTypes.includes(mimetype)) {
      return res.status(400).json({ error: "Only image files are allowed (png, jpg, jpeg, webp, gif)" })
    }

    const timestamp = Date.now()
    const parsed = path.parse(originalname)
    const safeBase = parsed.name.replace(/[^a-zA-Z0-9-_]/g, "_")
    const safeExt = parsed.ext && parsed.ext.length <= 10 ? parsed.ext : ".png"
    const blobName = `lost-and-found/${userId || "anonymous"}-${timestamp}-${safeBase}${safeExt}`

    if (USE_LOCAL_STORAGE) {
      // Ensure directory exists locally
      const lostAndFoundPath = path.join(__dirname, "..", "uploads", "lost-and-found")
      if (!fs.existsSync(lostAndFoundPath)) {
        fs.mkdirSync(lostAndFoundPath, { recursive: true })
      }

      const filename = `${userId || "anonymous"}-${timestamp}-${safeBase}${safeExt}`
      const filepath = path.join(lostAndFoundPath, filename)

      fs.writeFileSync(filepath, buffer)

      const url = `/uploads/lost-and-found/${filename}`
      return res.status(200).json({ url })
    } else {
      // Upload to Azure in the default container under lost-and-found/
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
