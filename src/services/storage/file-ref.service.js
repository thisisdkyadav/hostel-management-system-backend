import path from 'path';

const MEDIA_REF_PREFIX = 'media://';
const MEDIA_REF_PATTERN = /^media:\/\/[A-Za-z0-9_-]+$/;
const LEGACY_UPLOAD_PREFIX = '/uploads/';

export const createMediaRef = (fileId) => {
  return `${MEDIA_REF_PREFIX}${String(fileId || '').trim()}`;
};

export const isMediaRef = (value) => {
  return typeof value === 'string' && MEDIA_REF_PATTERN.test(value.trim());
};

export const parseMediaRef = (value) => {
  if (!isMediaRef(value)) return null;
  return value.trim().slice(MEDIA_REF_PREFIX.length);
};

export const isHttpUrl = (value) => {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
};

export const isLegacyUploadPath = (value) => {
  return typeof value === 'string' && value.trim().startsWith(LEGACY_UPLOAD_PREFIX);
};

/**
 * Resolve a legacy `/uploads/...` path inside `uploadsRoot`.
 * Returns null when the value is not a legacy upload path, or when it would
 * escape the uploads root (traversal, absolute leftovers, NUL bytes).
 */
export const resolveLegacyUploadPath = (fileValue, uploadsRoot) => {
  if (!isLegacyUploadPath(fileValue)) return null;

  const relativePart = fileValue.trim().slice(LEGACY_UPLOAD_PREFIX.length);
  if (!relativePart || relativePart.includes('\0') || path.isAbsolute(relativePart)) {
    return null;
  }

  const segments = relativePart.split(/[/\\]/);
  if (segments.some((segment) => segment === '..')) {
    return null;
  }

  const root = path.resolve(uploadsRoot);
  const resolved = path.resolve(root, relativePart);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) {
    return null;
  }

  return resolved;
};

export default {
  createMediaRef,
  isMediaRef,
  parseMediaRef,
  isHttpUrl,
  isLegacyUploadPath,
  resolveLegacyUploadPath,
};

