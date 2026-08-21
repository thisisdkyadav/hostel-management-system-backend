import { ROLES } from '../../../../core/constants/roles.constants.js';
import { success, badRequest, forbidden, notFound, error } from '../../../../services/base/index.js';
import { fileAccessService } from '../../../../services/storage/file-access.service.js';
import { isMediaRef } from '../../../../services/storage/file-ref.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { certificateQueries } from '../../../../services/certificate/certificateQueries.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { env } from '../../../../config/env.config.js';
import { logger } from '../../../../services/base/Logger.js';

const DEFAULT_TTL_SECONDS = Number(env.storage.signedUrlTtlSeconds) || 300;
const MAX_RESOLVE_TTL_SECONDS = DEFAULT_TTL_SECONDS;
const MAX_BATCH_REFS = 50;

const ADMIN_ROLES = new Set([ROLES.ADMIN, ROLES.SUPER_ADMIN]);
const HOSTEL_SCOPED_ROLES = new Set([
  ROLES.WARDEN,
  ROLES.ASSOCIATE_WARDEN,
  ROLES.HOSTEL_SUPERVISOR,
  ROLES.SECURITY,
  ROLES.HOSTEL_GATE,
]);

const OPEN_TO_AUTHENTICATED = new Set(['profile-images', 'lost-and-found']);
const EVENT_POLICIES = new Set([
  'event-proposal-docs',
  'event-chief-guest-docs',
  'event-bill-docs',
  'event-report-docs',
]);
const GYMKHANA_POLICIES = new Set([
  ...EVENT_POLICIES,
  'election-nomination-docs',
  'por-documents',
]);
const HOSTEL_STAFF_STUDENT_DOCS = new Set([
  'student-id-cards',
  'h2-forms',
  'certificates',
  'payment-screenshots',
]);

const toId = (value) => {
  if (!value) return '';
  return String(value).trim();
};

const idsEqual = (left, right) => {
  const a = toId(left);
  const b = toId(right);
  return Boolean(a) && a === b;
};

const clampResolveTtl = (expiresInSeconds) => {
  const parsed = Number(expiresInSeconds);
  const ttl = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(ttl, 1), MAX_RESOLVE_TTL_SECONDS);
};

const subjectUserIdFromMeta = (meta) => {
  const hint = toId(meta?.entityHint);
  if (hint) return hint.split(':')[0];
  return toId(meta?.actorId);
};

const staffHostelId = (user) => toId(user?.hostel?._id || user?.hostel);

const staffSharesHostelWithStudent = async (user, subjectUserId) => {
  if (!HOSTEL_SCOPED_ROLES.has(user?.role)) return false;

  const ownHostelId = staffHostelId(user);
  if (!ownHostelId || !subjectUserId) return false;

  const profile = await studentProfileQueries.findByUserIdWithAllocationHostel(subjectUserId);
  const studentHostelId = toId(profile?.currentRoomAllocation?.hostelId);
  return idsEqual(ownHostelId, studentHostelId);
};

const canViewMedia = async (user, meta, fileRef) => {
  if (!user?._id) return false;
  if (ADMIN_ROLES.has(user.role)) return true;

  const policy = String(meta?.policy || '');
  const actorId = toId(meta?.actorId);
  const actorRole = String(meta?.actorRole || '');
  const subjectUserId = subjectUserIdFromMeta(meta);

  if (idsEqual(user._id, actorId) || idsEqual(user._id, subjectUserId)) {
    return true;
  }

  if (OPEN_TO_AUTHENTICATED.has(policy)) {
    return true;
  }

  if (policy === 'payment-screenshots') {
    if (ADMIN_ROLES.has(actorRole)) return true;
    if (actorId) {
      try {
        const actor = await userQueries.findUserById(actorId, { select: 'role', lean: true });
        if (ADMIN_ROLES.has(actor?.role)) return true;
      } catch {
        // Invalid actor id must not fail the whole resolve.
      }
    }
  }

  if (user.role === ROLES.GYMKHANA && GYMKHANA_POLICIES.has(policy)) {
    return true;
  }

  if (user.role === ROLES.ACADEMICS && policy === 'overall-best-performer-proofs') {
    return true;
  }

  if (policy === 'certificates') {
    const certificate = await certificateQueries.findOneByCertificateUrl(fileRef, {
      select: 'userId',
      lean: true,
    });
    if (certificate && idsEqual(certificate.userId, user._id)) {
      return true;
    }
    if (certificate && (await staffSharesHostelWithStudent(user, certificate.userId))) {
      return true;
    }
  }

  if (HOSTEL_STAFF_STUDENT_DOCS.has(policy)) {
    return staffSharesHostelWithStudent(user, subjectUserId);
  }

  return false;
};

const isMissingFileError = (err) => {
  const message = String(err?.message || '').toLowerCase();
  return err?.status === 404 || message.includes('file not found');
};

const signAuthorizedRef = async (user, ref, { disposition, expiresInSeconds }) => {
  const normalized = String(ref || '').trim();
  if (!isMediaRef(normalized)) {
    return { error: badRequest('Invalid file reference') };
  }

  let signed;
  try {
    signed = await fileAccessService.signForAccess(normalized, {
      disposition,
      expiresInSeconds,
    });
  } catch (err) {
    logger.error('Failed to sign media', { ref: normalized, status: err?.status, message: err?.message });
    if (isMissingFileError(err)) {
      return { error: notFound('File') };
    }
    return { error: error('Failed to resolve media', 502, err.message) };
  }

  if (!signed?.url) {
    return { error: error('Failed to resolve media', 502) };
  }

  if (signed.meta?.policy) {
    const allowed = await canViewMedia(user, signed.meta, normalized);
    if (!allowed) {
      return { error: forbidden('You do not have access to this file') };
    }
  } else {
    logger.warn('Storage sign response had no file policy; allowing authenticated resolve', {
      ref: normalized,
    });
  }

  return { ref: normalized, url: signed.url };
};

class MediaService {
  async resolveOne(user, { ref, disposition = 'inline', expiresInSeconds } = {}) {
    const normalizedRef = String(ref || '').trim();
    if (!normalizedRef) {
      return badRequest('Media ref is required');
    }

    const result = await signAuthorizedRef(user, normalizedRef, {
      disposition: String(disposition || 'inline').trim() || 'inline',
      expiresInSeconds: clampResolveTtl(expiresInSeconds),
    });
    if (result.error) return result.error;

    return success({ ref: result.ref, url: result.url });
  }

  async resolveBatch(user, { refs = [], disposition = 'inline', expiresInSeconds } = {}) {
    if (!Array.isArray(refs) || refs.length === 0) {
      return success({ items: [] });
    }
    if (refs.length > MAX_BATCH_REFS) {
      return badRequest(`At most ${MAX_BATCH_REFS} refs can be resolved at once`);
    }

    const ttl = clampResolveTtl(expiresInSeconds);
    const normalizedDisposition = String(disposition || 'inline').trim() || 'inline';
    const uniqueRefs = [...new Set(refs.filter((value) => typeof value === 'string' && value.trim()))];

    const items = await Promise.all(
      uniqueRefs.map(async (ref) => {
        const result = await signAuthorizedRef(user, ref, {
          disposition: normalizedDisposition,
          expiresInSeconds: ttl,
        });
        if (result.error) {
          return {
            ref,
            url: '',
            error: result.error.message || 'Unable to resolve media',
          };
        }
        return { ref: result.ref, url: result.url };
      })
    );

    return success({ items });
  }
}

export const mediaService = new MediaService();
export default mediaService;
