const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/jobController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/executions', ctrl.getExecutions);
router.get('/:id/logs', ctrl.getLogs);
router.get('/:id/dependencies', ctrl.getDependencies);
router.post('/:id/retry', requireRole('member'), ctrl.retry);
router.post('/:id/cancel', requireRole('member'), ctrl.cancel);

module.exports = router;
