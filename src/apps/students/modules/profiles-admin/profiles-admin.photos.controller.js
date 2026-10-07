import { asyncHandler } from '../../../../utils/index.js';
import { profilePhotosService } from './profiles-admin.photos.service.js';

export const attachStudentProfilePhoto = asyncHandler(async (req, res) => {
  const result = await profilePhotosService.attach({
    file: req.file,
    override: req.body?.override,
    actor: req.user,
  });
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data });
});
