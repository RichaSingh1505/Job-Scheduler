const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/projectController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', requireRole('admin'), ctrl.create);
router.get('/:id', ctrl.getOne);
router.patch('/:id', requireRole('admin'), ctrl.update);
router.delete('/:id', requireRole('owner'), ctrl.remove);

module.exports = router;
