import express from 'express';
import {
  answerDiningTag,
  cancelBioPhotoRequest,
  createBioPhotoRequest,
  getBioPhoto,
  createDiningRebate,
  getDiningBilling,
  getDiningMeals,
  getDiningMenu,
  getDiningPortalState,
  getDiningRebates,
  getDiningTags,
  previewDiningRebate,
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
router.get('/rebates', getDiningRebates);
router.post('/rebates/preview', previewDiningRebate);
router.post('/rebates', createDiningRebate);
router.get('/billing', getDiningBilling);
router.get('/meals', getDiningMeals);
router.get('/menu', getDiningMenu);
router.get('/tags', getDiningTags);
router.put('/tags/:tagId', answerDiningTag);
router.get('/bio-photo', getBioPhoto);
router.post('/bio-photo', createBioPhotoRequest);
router.delete('/bio-photo/:requestId', cancelBioPhotoRequest);

export default router;
