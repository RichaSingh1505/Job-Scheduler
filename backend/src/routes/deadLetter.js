const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dlqController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/:jobId/requeue', requireRole('member'), ctrl.requeue);

module.exports = router;
