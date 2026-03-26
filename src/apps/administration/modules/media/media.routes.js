import express from 'express';
import { resolveMedia, resolveMediaBatch } from './media.controller.js';

const router = express.Router();

router.get('/resolve', resolveMedia);
router.post('/resolve-batch', resolveMediaBatch);

export default router;
