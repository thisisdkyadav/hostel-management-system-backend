import { User } from '../../../../models/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';
import { badRequest, notFound, success } from '../../../../services/base/index.js';

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password').exec();
  if (!user) {
    return sendStandardResponse(res, notFound('User'));
  }

  return sendStandardResponse(res, success(user));
});

export const updatePinnedTabs = asyncHandler(async (req, res) => {
  const { pinnedTabs } = req.body;

  if (!Array.isArray(pinnedTabs)) {
    return sendStandardResponse(res, badRequest('pinnedTabs must be an array'));
  }

  const normalizedPinnedTabs = [
    ...new Set(
      pinnedTabs
        .filter((tab) => typeof tab === 'string')
        .map((tab) => tab.trim())
        .filter((tab) => tab.length > 0)
    ),
  ];

  if (normalizedPinnedTabs.length > 30) {
    return sendStandardResponse(res, badRequest('Too many pinned tabs'));
  }

  const hasInvalidPath = normalizedPinnedTabs.some((tabPath) => !tabPath.startsWith('/admin'));
  if (hasInvalidPath) {
    return sendStandardResponse(res, badRequest('Invalid pinned tab path'));
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { pinnedTabs: normalizedPinnedTabs },
    { new: true, runValidators: true }
  )
    .select('pinnedTabs')
    .exec();

  if (!user) {
    return sendStandardResponse(res, notFound('User'));
  }

  const nextPinnedTabs = Array.isArray(user.pinnedTabs) ? user.pinnedTabs : [];

  if (req.session?.userData) {
    req.session.userData.pinnedTabs = nextPinnedTabs;
  }

  return sendStandardResponse(
    res,
    success({ pinnedTabs: nextPinnedTabs }, 200, 'Pinned tabs updated successfully')
  );
});

export default {
  getUser,
  updatePinnedTabs,
};
