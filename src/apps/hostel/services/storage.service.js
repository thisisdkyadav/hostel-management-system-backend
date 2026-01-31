/**
 * Storage Service
 * Handles file uploads to Azure Blob Storage or local storage
 */

import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get env vars from process.env (avoiding circular dependency)
const getEnvConfig = () => ({
  azureConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
  azureContainerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploads',
  azureAccountName: process.env.AZURE_STORAGE_ACCOUNT_NAME || '',
  azureAccountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY || '',
  azureStudentIdContainer: process.env.AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID || 'student-ids',
  useLocalStorage: process.env.USE_LOCAL_STORAGE === 'true'
})

// Local storage paths - 4 levels up from src/apps/hostel/services/ to backend/uploads/
const uploadsBasePath = path.join(__dirname, '..', '..', '..', '..', 'uploads')

class StorageService {
  constructor() {
    this._initialized = false
    this.blobServiceClient = null
    this.containers = {}
  }

  /**
   * Initialize Azure Blob Storage clients
   */
  initialize() {
    if (this._initialized) return

    const config = getEnvConfig()
    
    if (!config.useLocalStorage && config.azureConnectionString) {
      try {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(config.azureConnectionString)
        this.containers = {
          default: this.blobServiceClient.getContainerClient(config.azureContainerName),
          studentId: this.blobServiceClient.getContainerClient(config.azureStudentIdContainer)
        }
      } catch (error) {
        console.error('Failed to initialize Azure Blob Storage:', error)
      }
    }

    // Ensure local directories exist
    this._ensureLocalDirectories()
    
    this._initialized = true
  }

  /**
   * Ensure local storage directories exist
   */
  _ensureLocalDirectories() {
    const directories = [
      'profile-images',
      'student-id-cards',
      'h2-forms',
      'certificates',
      'complaints',
      'lost-found',
      'visitor-images'
    ]

    for (const dir of directories) {
      const dirPath = path.join(uploadsBasePath, dir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
    }
  }

  /**
   * Upload a file to storage
   * @param {Object} options Upload options
   * @param {Buffer} options.buffer File buffer
   * @param {string} options.originalname Original filename
   * @param {string} options.mimetype MIME type
   * @param {string} options.folder Folder/category for the file
   * @param {string} [options.customName] Custom filename (optional)
   * @param {string} [options.containerType='default'] Container type for Azure
   * @returns {Promise<{url: string, filename: string}>} Upload result
   */
  async uploadFile({ buffer, originalname, mimetype, folder, customName, containerType = 'default' }) {
    this.initialize()

    const config = getEnvConfig()
    const filename = customName || `${Date.now()}-${originalname}`

    if (config.useLocalStorage) {
      return this._uploadLocal({ buffer, filename, folder })
    } else {
      return this._uploadAzure({ buffer, filename, mimetype, containerType })
    }
  }

  /**
   * Upload file to local storage
   */
  async _uploadLocal({ buffer, filename, folder }) {
    const dirPath = path.join(uploadsBasePath, folder)
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    const filepath = path.join(dirPath, filename)
    fs.writeFileSync(filepath, buffer)

    return {
      url: `/uploads/${folder}/${filename}`,
      filename
    }
  }

  /**
   * Upload file to Azure Blob Storage
   */
  async _uploadAzure({ buffer, filename, mimetype, containerType }) {
    const config = getEnvConfig()
    const container = this.containers[containerType] || this.containers.default

    if (!container) {
      throw new Error('Azure Blob Storage not initialized')
    }

    const blockBlobClient = container.getBlockBlobClient(filename)

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimetype }
    })

    // Generate SAS URL with long expiry
    const sharedKeyCredential = new StorageSharedKeyCredential(
      config.azureAccountName,
      config.azureAccountKey
    )
    
    const expiryDate = new Date('2099-12-31')
    const containerName = containerType === 'studentId' 
      ? config.azureStudentIdContainer 
      : config.azureContainerName

    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName: filename,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: expiryDate
    }, sharedKeyCredential).toString()

    return {
      url: `${blockBlobClient.url}?${sasToken}`,
      filename
    }
  }

  /**
   * Delete a file from storage
   * @param {string} fileUrl The URL or path of the file to delete
   * @param {string} [containerType='default'] Container type for Azure
   */
  async deleteFile(fileUrl, containerType = 'default') {
    this.initialize()

    const config = getEnvConfig()

    if (config.useLocalStorage) {
      // Extract path from URL
      const relativePath = fileUrl.replace('/uploads/', '')
      const filepath = path.join(uploadsBasePath, relativePath)
      
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
    } else {
      // Extract blob name from URL
      const container = this.containers[containerType] || this.containers.default
      const blobName = this._extractBlobName(fileUrl)
      
      if (container && blobName) {
        const blockBlobClient = container.getBlockBlobClient(blobName)
        await blockBlobClient.deleteIfExists()
      }
    }
  }

  /**
   * Extract blob name from Azure URL
   */
  _extractBlobName(url) {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      return pathParts[pathParts.length - 1].split('?')[0]
    } catch {
      return null
    }
  }

  /**
   * Generate a presigned URL for a file
   * @param {string} blobName The blob name
   * @param {string} [containerType='default'] Container type
   * @param {number} [expiryMinutes=60] Expiry time in minutes
   * @returns {string} Presigned URL
   */
  async generatePresignedUrl(blobName, containerType = 'default', expiryMinutes = 60) {
    this.initialize()

    const config = getEnvConfig()

    if (config.useLocalStorage) {
      return `/uploads/${blobName}`
    }

    const container = this.containers[containerType] || this.containers.default
    const blockBlobClient = container.getBlockBlobClient(blobName)

    const sharedKeyCredential = new StorageSharedKeyCredential(
      config.azureAccountName,
      config.azureAccountKey
    )

    const expiryDate = new Date()
    expiryDate.setMinutes(expiryDate.getMinutes() + expiryMinutes)

    const containerName = containerType === 'studentId'
      ? config.azureStudentIdContainer
      : config.azureContainerName

    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: expiryDate
    }, sharedKeyCredential).toString()

    return `${blockBlobClient.url}?${sasToken}`
  }

  /**
   * Check if using local storage
   */
  isUsingLocalStorage() {
    return getEnvConfig().useLocalStorage
  }
}

// Export singleton instance
export const storageService = new StorageService()
export default storageService
