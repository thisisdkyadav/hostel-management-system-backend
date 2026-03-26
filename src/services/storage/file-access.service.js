import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storageClient } from './storage.client.js';
import { isHttpUrl, isLegacyUploadPath, isMediaRef } from './file-ref.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

class FileAccessService {
  isStorageRef(value) {
    return isMediaRef(value);
  }

  isLegacyUploadPath(value) {
    return isLegacyUploadPath(value);
  }

  async createSignedUrl(fileValue, { expiresInSeconds, disposition = 'inline' } = {}) {
    if (!fileValue || typeof fileValue !== 'string') {
      return '';
    }

    if (isMediaRef(fileValue)) {
      const result = await storageClient.sign({
        fileRef: fileValue,
        expiresInSeconds,
        disposition,
      });
      return result.url;
    }

    return fileValue;
  }

  async getBuffer(fileValue) {
    if (!fileValue || typeof fileValue !== 'string') {
      throw new Error('Invalid file value');
    }

    if (isMediaRef(fileValue)) {
      return storageClient.fetchBytes(fileValue);
    }

    if (isLegacyUploadPath(fileValue)) {
      const relativePart = fileValue.replace(/^\/uploads\//, '');
      const absolutePath = path.join(uploadsRoot, relativePart);
      return {
        buffer: fs.readFileSync(absolutePath),
        contentType: undefined,
      };
    }

    if (isHttpUrl(fileValue)) {
      const response = await fetch(fileValue);
      if (!response.ok) {
        throw new Error(`Failed to fetch remote file with status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType: response.headers.get('content-type') || undefined,
      };
    }

    if (path.isAbsolute(fileValue) && fs.existsSync(fileValue)) {
      return {
        buffer: fs.readFileSync(fileValue),
        contentType: undefined,
      };
    }

    throw new Error('Unsupported file reference');
  }
}

export const fileAccessService = new FileAccessService();
export default fileAccessService;

