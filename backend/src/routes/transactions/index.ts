import { Router } from 'express';
import transactionsPreviewRouter from './transactionsPreview';
import transactionsWriteRouter from './transactionsWrite';
import transactionsListRouter from './transactionsList';

// Orquestador puro: monta los 3 sub-routers en /api/transactions sin cambiar
// ninguna ruta externa. Fragmentado desde un único fichero de 642 líneas que
// mezclaba el preview de simulación FIFO, el CRUD de transacciones manuales
// (con ~40 líneas de derivación de campos casi idénticas duplicadas entre
// create y update, ahora en transactionsShared.ts) y el listado/stats.
const router = Router();

router.use('/', transactionsPreviewRouter);
router.use('/', transactionsWriteRouter);
router.use('/', transactionsListRouter);

export default router;
