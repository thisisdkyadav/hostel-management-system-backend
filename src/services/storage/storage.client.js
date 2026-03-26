import { env } from '../../config/env.config.js';
import { parseMediaRef } from './file-ref.service.js';

const ensureConfigured = () => {
  if (!env.storage.serviceUrl) {
    throw new Error('Storage service is not configured. Set STORAGE_SERVICE_URL.');
  }
  if (!env.storage.internalApiKey) {
    throw new Error('Storage service internal API key is not configured. Set STORAGE_INTERNAL_API_KEY.');
  }
};

const buildInternalHeaders = () => {
  return {
    'x-storage-internal-key': env.storage.internalApiKey,
  };
};

const parseJsonResponse = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Storage request failed with status ${response.status}`);
  }

  return payload;
};

class StorageClient {
  get baseUrl() {
    return String(env.storage.serviceUrl || '').replace(/\/$/, '');
  }

  async upload({ file, policy, actorId, actorRole, sourceService, entityHint = '' }) {
    ensureConfigured();

    if (!file?.buffer) {
      throw new Error('Missing file buffer for storage upload');
    }

    const formData = new FormData();
    formData.append('policy', policy);
    formData.append('actorId', String(actorId || ''));
    formData.append('actorRole', String(actorRole || ''));
    formData.append('sourceService', String(sourceService || 'backend'));
    if (entityHint) {
      formData.append('entityHint', String(entityHint));
    }

    const blob = new Blob([file.buffer], {
      type: file.mimetype || 'application/octet-stream',
    });
    formData.append('file', blob, file.originalname || 'upload.bin');

    const response = await fetch(`${this.baseUrl}/internal/v1/files`, {
      method: 'POST',
      headers: buildInternalHeaders(),
      body: formData,
    });

    return parseJsonResponse(response);
  }

  async sign({ fileRef, expiresInSeconds, disposition = 'inline' }) {
    ensureConfigured();

    const response = await fetch(`${this.baseUrl}/internal/v1/files/sign`, {
      method: 'POST',
      headers: {
        ...buildInternalHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_ref: fileRef,
        expires_in_seconds: expiresInSeconds,
        disposition,
      }),
    });

    const payload = await parseJsonResponse(response);
    const relativeUrl = typeof payload?.url === 'string' ? payload.url : '';
    return {
      ...payload,
      url: relativeUrl.startsWith('http') ? relativeUrl : `${this.baseUrl}${relativeUrl}`,
    };
  }

  async fetchBytes(fileRef) {
    ensureConfigured();
    const fileId = parseMediaRef(fileRef);
    if (!fileId) {
      throw new Error('Invalid storage file ref');
    }

    const response = await fetch(`${this.baseUrl}/internal/v1/files/${encodeURIComponent(fileId)}/content`, {
      method: 'GET',
      headers: buildInternalHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Storage fetch failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }
}

export const storageClient = new StorageClient();
export default storageClient;
