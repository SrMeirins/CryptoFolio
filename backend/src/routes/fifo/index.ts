import { Router } from 'express';
import fifoRunRouter from './fifoRun';
import fifoAggregationsRouter from './fifoAggregations';

// Orquestador puro: monta los sub-routers en /api/fifo sin cambiar ninguna
// ruta externa: el motor (/run) y los endpoints de agregación de solo lectura.
// El antiguo /yesterday-prices (REST a Binance) se retiró: el precio de hace
// 24h llega en tiempo real por el WebSocket de precios (#147). /portfolio-history
// se retiró en #215: la pestaña Valor usa la serie de /api/v1/pnl.
const router = Router();

router.use('/', fifoRunRouter);
router.use('/', fifoAggregationsRouter);

export default router;
