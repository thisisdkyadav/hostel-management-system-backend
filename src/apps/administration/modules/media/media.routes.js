import express from 'express';
import { resolveMedia, resolveMediaBatch } from './media.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.media',
  [ROLES.SUPER_ADMIN]: 'route.superAdmin.media',
  [ROLES.WARDEN]: 'route.warden.media',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.media',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.media',
  [ROLES.SECURITY]: 'route.security.media',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.media',
  [ROLES.MAINTENANCE_STAFF]: 'route.maintenance.media',
  [ROLES.STUDENT]: 'route.student.media',
  [ROLES.GYMKHANA]: 'route.gymkhana.media',
  [ROLES.ACADEMICS]: 'route.academics.media',
  [ROLES.DINING]: 'route.dining.media',
});

router.use(authenticate);
router.use(guard(Object.values(ROLES)));

router.get('/resolve', resolveMedia);
router.post('/resolve-batch', resolveMediaBatch);

export default router;
