const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/metricsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/throughput', ctrl.throughput);
router.get('/health', ctrl.health);

module.exports = router;
