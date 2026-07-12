const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/webhookController');

// Separate, slightly tighter limiter since this endpoint is reachable
// without a user JWT (only a project api_key).
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests, please slow down.' }
});

router.post('/:apiKey/trigger', webhookLimiter, ctrl.trigger);

module.exports = router;
