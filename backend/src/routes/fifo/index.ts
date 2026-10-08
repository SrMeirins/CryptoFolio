import { Router } from 'express';
import fifoRunRouter from './fifoRun';
import fifoAggregationsRouter from './fifoAggregations';
import portfolioHistoryRouter from './portfolioHistory';

// Orquestador puro: monta los sub-routers en /api/fifo sin cambiar ninguna
// ruta externa: el motor (/run), los endpoints de agregación de solo lectura y
// portfolio-history. El antiguo /yesterday-prices (REST a Binance) se retiró:
// el precio de hace 24h llega en tiempo real por el WebSocket de precios (#147).
const router = Router();

router.use('/', fifoRunRouter);
router.use('/', fifoAggregationsRouter);
router.use('/', portfolioHistoryRouter);

export default router;
