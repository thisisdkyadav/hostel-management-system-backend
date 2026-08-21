import { handler } from '../../../../lib/api-kit/index.js';
import { mediaService } from './media.service.js';

export const resolveMedia = handler(async (req, res) => {
  const result = await mediaService.resolveOne(req.user, {
    ref: req.query.ref,
    disposition: req.query.disposition,
    expiresInSeconds: req.query.expiresInSeconds,
  });

  if (!result.success) return result;

  if (String(req.query.redirect || '0') === '1' && result.data?.url) {
    return res.redirect(result.data.url);
  }

  return result;
});

export const resolveMediaBatch = handler((req) =>
  mediaService.resolveBatch(req.user, {
    refs: req.body?.refs,
    disposition: req.body?.disposition,
    expiresInSeconds: req.body?.expiresInSeconds,
  })
);
