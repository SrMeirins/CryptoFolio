import { Router } from 'express';
import { db } from '../db/client';

const router = Router();

// GET /health — sin datos internos sensibles, usado por el healthcheck de Docker
router.get('/', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

export default router;
