const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/scheduledJobController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.patch('/:id/toggle', requireRole('member'), ctrl.toggle);
router.delete('/:id', requireRole('member'), ctrl.remove);

module.exports = router;
