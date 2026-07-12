const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/error');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const queueRoutes = require('./routes/queues');
const jobRoutes = require('./routes/jobs');
const scheduledJobRoutes = require('./routes/scheduledJobs');
const workerRoutes = require('./routes/workers');
const dlqRoutes = require('./routes/deadLetter');
const metricsRoutes = require('./routes/metrics');
const webhookRoutes = require('./routes/webhooks');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/scheduled-jobs', scheduledJobRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/dead-letter', dlqRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/webhooks', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
