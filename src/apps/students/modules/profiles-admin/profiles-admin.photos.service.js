import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { userOwner } from '../../../../services/user/userOwner.service.js';
import { uploadService } from '../../../administration/modules/upload/upload.service.js';
import { badRequest, error, forbidden, notFound, success } from '../../../../services/base/ServiceResponse.js';
import { invalidateStudentDashboardCache } from '../../../../utils/redisCache.js';
import { getHostelScope, isHostelAllowed } from '../../../../utils/hostelScope.js';

export const profilePhotosService = {
  async attach({ file, override = 'false', actor }) {
    if (!file) return badRequest('No profile picture uploaded');
    if (!['true', 'false'].includes(override)) return badRequest('Override must be true or false');

    const filename = String(file.originalname || '').match(/^([a-z0-9_-]+)\.jpe?g$/i);
    if (!filename) return badRequest('Name each JPEG/JPG file with the student roll number, for example 230001024.jpg');
    if (!['image/jpeg', 'image/jpg', 'application/octet-stream'].includes(file.mimetype) ||
        file.buffer?.[0] !== 0xff || file.buffer?.[1] !== 0xd8 || file.buffer?.[2] !== 0xff) {
      return badRequest('Only JPEG/JPG images are accepted');
    }
    if (file.size > 500 * 1024) return badRequest('Profile pictures must be 500KB or smaller');

    const scope = getHostelScope(actor);
    const populate = [{ path: 'userId', select: 'profileImage' }];
    if (scope.hostelBound) populate.push({ path: 'currentRoomAllocation', select: 'hostelId' });
    const student = await studentProfileQueries.findByRollNumberCaseInsensitive(filename[1], {
      select: 'rollNumber userId currentRoomAllocation', populate, lean: true,
    });
    if (!student?.userId?._id) return notFound(`Student with roll number ${filename[1]}`);
    if (!isHostelAllowed(student.currentRoomAllocation?.hostelId, scope)) {
      return forbidden('You are not allowed to update this student profile');
    }
    const user = student.userId;
    const allowOverride = override === 'true';
    const skipped = () => success({
      rollNumber: student.rollNumber,
      status: 'skipped',
      message: 'Student already has a profile picture',
    });
    if (!allowOverride && user.profileImage) return skipped();

    const uploaded = await uploadService.uploadProfileImage({
      userId: String(user._id),
      userRole: actor.role,
      currentUserId: String(actor._id),
      file: { ...file, mimetype: 'image/jpeg' },
    });
    if (!uploaded.success) return uploaded;
    const profileImage = uploaded.data?.fileRef;
    if (!profileImage) return error('Storage did not return a profile picture reference', 502);

    // Checking again in the write prevents concurrent uploads from overwriting
    // an existing picture when override is off.
    const filter = { _id: user._id };
    if (!allowOverride) filter.$or = [{ profileImage: null }, { profileImage: '' }];
    const updated = await userOwner.findOneAndUpdateUser(
      filter,
      { $set: { profileImage, updatedAt: new Date() } },
      { new: true, select: '_id', lean: true }
    );
    if (!updated) return allowOverride ? notFound('Student user') : skipped();

    await invalidateStudentDashboardCache(user._id);
    return success({ rollNumber: student.rollNumber, status: 'updated' });
  },
};
