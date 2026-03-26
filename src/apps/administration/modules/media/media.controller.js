import { asyncHandler } from '../../../../utils/index.js';
import { fileAccessService } from '../../../../services/storage/file-access.service.js';

const DEFAULT_TTL_SECONDS = 300;

export const resolveMedia = asyncHandler(async (req, res) => {
  const ref = String(req.query.ref || '').trim();
  const disposition = String(req.query.disposition || 'inline').trim() || 'inline';
  const redirect = String(req.query.redirect || '0') === '1';
  const expiresInSeconds = Number(req.query.expiresInSeconds || DEFAULT_TTL_SECONDS);

  if (!ref) {
    return res.status(400).json({ success: false, message: 'Media ref is required' });
  }

  const signedUrl = await fileAccessService.createSignedUrl(ref, {
    disposition,
    expiresInSeconds,
  });

  if (redirect) {
    return res.redirect(signedUrl);
  }

  return res.json({
    success: true,
    ref,
    url: signedUrl,
  });
});

export const resolveMediaBatch = asyncHandler(async (req, res) => {
  const refs = Array.isArray(req.body?.refs) ? req.body.refs : [];
  const disposition = String(req.body?.disposition || 'inline').trim() || 'inline';
  const expiresInSeconds = Number(req.body?.expiresInSeconds || DEFAULT_TTL_SECONDS);

  const items = await Promise.all(
    refs
      .filter((ref) => typeof ref === 'string' && ref.trim())
      .map(async (ref) => ({
        ref,
        url: await fileAccessService.createSignedUrl(ref, {
          disposition,
          expiresInSeconds,
        }),
      }))
  );

  return res.json({
    success: true,
    items,
  });
});

