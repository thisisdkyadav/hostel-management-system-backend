import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.config.js';
import { storageClient } from './storage.client.js';
import { isHttpUrl, isLegacyUploadPath, isMediaRef, resolveLegacyUploadPath } from './file-ref.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

const MAX_SIGNED_URL_TTL_SECONDS = 3600;

const normalizeTtlSeconds = (expiresInSeconds) => {
  const fallback = Number(env.storage.signedUrlTtlSeconds) || 300;
  const parsed = Number(expiresInSeconds);
  const ttl = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  return Math.min(Math.max(ttl, 1), MAX_SIGNED_URL_TTL_SECONDS);
};

class FileAccessService {
  isStorageRef(value) {
    return isMediaRef(value);
  }

  isLegacyUploadPath(value) {
    return isLegacyUploadPath(value);
  }

  async createSignedUrl(fileValue, { expiresInSeconds, disposition = 'inline' } = {}) {
    const signed = await this.signForAccess(fileValue, { expiresInSeconds, disposition });
    return signed.url;
  }

  async signForAccess(fileValue, { expiresInSeconds, disposition = 'inline' } = {}) {
    if (!isMediaRef(fileValue)) {
      return { url: '', meta: null };
    }

    const result = await storageClient.sign({
      fileRef: fileValue.trim(),
      expiresInSeconds: normalizeTtlSeconds(expiresInSeconds),
      disposition,
    });

    return {
      url: result.url || '',
      meta: result.policy ? result : null,
    };
  }

  async getMetadata(fileValue) {
    if (!isMediaRef(fileValue)) {
      throw new Error('Invalid storage file ref');
    }

    return storageClient.getMetadata(fileValue.trim());
  }

  async getBuffer(fileValue) {
    if (!fileValue || typeof fileValue !== 'string') {
      throw new Error('Invalid file value');
    }

    if (isMediaRef(fileValue)) {
      return storageClient.fetchBytes(fileValue.trim());
    }

    if (isLegacyUploadPath(fileValue)) {
      const resolved = resolveLegacyUploadPath(fileValue, uploadsRoot);
      if (!resolved) {
        throw new Error('Invalid path');
      }

      return {
        buffer: fs.readFileSync(resolved),
        contentType: undefined,
      };
    }

    if (isHttpUrl(fileValue)) {
      throw new Error('Remote HTTP file references are not supported');
    }

    throw new Error('Unsupported file reference');
  }

  resolveLegacyPath(fileValue) {
    return resolveLegacyUploadPath(fileValue, uploadsRoot);
  }
}

export const fileAccessService = new FileAccessService();
export default fileAccessService;

