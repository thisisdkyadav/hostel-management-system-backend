const MEDIA_REF_PREFIX = 'media://';

export const createMediaRef = (fileId) => {
  return `${MEDIA_REF_PREFIX}${String(fileId || '').trim()}`;
};

export const isMediaRef = (value) => {
  return typeof value === 'string' && value.trim().startsWith(MEDIA_REF_PREFIX);
};

export const parseMediaRef = (value) => {
  if (!isMediaRef(value)) return null;
  const fileId = value.trim().slice(MEDIA_REF_PREFIX.length);
  return fileId || null;
};

export const isHttpUrl = (value) => {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
};

export const isLegacyUploadPath = (value) => {
  return typeof value === 'string' && value.trim().startsWith('/uploads/');
};

export default {
  createMediaRef,
  isMediaRef,
  parseMediaRef,
  isHttpUrl,
  isLegacyUploadPath,
};

