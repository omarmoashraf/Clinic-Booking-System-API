import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      message: 'ok',
    },
  });
});

// Temporary route for verifying the centralized Express error flow.
router.get('/test-error', (req, res, next) => {
  next(new Error('Temporary error route'));
});

export default router;
