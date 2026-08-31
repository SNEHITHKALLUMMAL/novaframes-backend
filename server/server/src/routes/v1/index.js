import { Router } from 'express';
import healthRoutes from '../health.routes.js';
import authRoutes from '../auth.routes.js';
import usersRoutes from '../users.routes.js';
import generationsRoutes from '../generations.routes.js';
import dashboardRoutes from '../dashboard.routes.js';
import modelsRoutes from '../models.routes.js';
import uploadsRoutes from '../uploads.routes.js';
import videosRoutes from '../videos.routes.js';
import projectsRoutes from '../projects.routes.js';
import subscriptionsRoutes from '../subscriptions.routes.js';
import paymentsRoutes from '../payments.routes.js';
import usageRoutes from '../usage.routes.js';
import adminRoutes from '../admin.routes.js';
import { sendSuccess } from '../../utils/ApiResponse.js';

const router = Router();

// GET /api/v1 — lightweight namespace listing, useful for smoke-testing the
// versioned API surface without hitting a specific resource.
router.get('/', (req, res) => {
  sendSuccess(res, {
    message: 'AI Video Generation Platform API v1',
    data: {
      version: 'v1',
      namespaces: [
        'health', 'auth', 'users', 'generations', 'dashboard', 'models', 'uploads',
        'videos', 'projects', 'subscriptions', 'payments', 'usage', 'admin',
      ],
    },
  });
});

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/generations', generationsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/models', modelsRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/videos', videosRoutes);
router.use('/projects', projectsRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/usage', usageRoutes);
router.use('/admin', adminRoutes);

// Deferred — real-time status is delivered via Socket.IO (Phase 16) rather
// than persisted Notification documents; revisit if a durable notification
// inbox (distinct from live job tracking) becomes a real requirement.
// router.use('/notifications', notificationRoutes);

export default router;
