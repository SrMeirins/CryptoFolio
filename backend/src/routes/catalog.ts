import { Router } from 'express';
import { OPERATION_CATALOG, CATEGORY_META } from '../modules/operations/catalog';

const router = Router();

// GET /api/catalog — Catálogo completo
router.get('/', (_req, res) => {
  res.json({ categories: CATEGORY_META, operations: OPERATION_CATALOG });
});

// GET /api/catalog/:id — Tipo específico
router.get('/:id', (req, res) => {
  const op = OPERATION_CATALOG.find((o) => o.id === req.params.id);
  if (!op) {
    res.status(404).json({ error: 'Tipo de operación no encontrado' });
    return;
  }
  res.json(op);
});

export default router;
