import express from 'express';
import {
  getDiningPortalState,
  selectDiningCaterer,
} from './dining.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Student']));
router.use(requireRouteAccess('route.student.dining'));

router.get('/portal', getDiningPortalState);
router.post('/select', selectDiningCaterer);

export default router;
