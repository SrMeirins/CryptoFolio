import { Router } from 'express';
import fifoRunRouter from './fifoRun';
import fifoAggregationsRouter from './fifoAggregations';
import portfolioHistoryRouter from './portfolioHistory';
import yesterdayPricesRouter from './yesterdayPrices';

// Orquestador puro: monta los 4 sub-routers en /api/fifo sin cambiar
// ninguna ruta externa. Fragmentado desde un único fichero de 469 líneas que
// mezclaba el motor (/run), 6 endpoints de agregación de solo lectura y 2
// endpoints con lógica propia pesada (portfolio-history con su helper de
// interpolación de series temporales, yesterday-prices con su caché TTL).
const router = Router();

router.use('/', fifoRunRouter);
router.use('/', fifoAggregationsRouter);
router.use('/', portfolioHistoryRouter);
router.use('/', yesterdayPricesRouter);

export default router;
