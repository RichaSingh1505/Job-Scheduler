const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/queueController');
const jobCtrl = require('../controllers/jobController');
const scheduledCtrl = require('../controllers/scheduledJobController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Nested under a project
router.get('/project/:projectId', ctrl.list);
router.post('/project/:projectId', requireRole('member'), ctrl.create);

router.get('/:id', ctrl.getOne);
router.patch('/:id', requireRole('member'), ctrl.update);
router.delete('/:id', requireRole('admin'), ctrl.remove);
router.post('/:id/pause', requireRole('member'), ctrl.pause);
router.post('/:id/resume', requireRole('member'), ctrl.resume);
router.get('/:id/stats', ctrl.getStats);

// Jobs within a queue
router.post('/:queueId/jobs', requireRole('member'), jobCtrl.create);
router.post('/:queueId/jobs/batch', requireRole('member'), jobCtrl.createBatch);

// Recurring/cron job definitions within a queue
router.get('/:queueId/scheduled-jobs', scheduledCtrl.list);
router.post('/:queueId/scheduled-jobs', requireRole('member'), scheduledCtrl.create);

module.exports = router;
