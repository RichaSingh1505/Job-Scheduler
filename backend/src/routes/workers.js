const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/workerController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);

module.exports = router;
