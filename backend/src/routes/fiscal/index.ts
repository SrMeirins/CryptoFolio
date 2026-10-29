import { Router } from 'express';
import fiscalOverviewRouter from './fiscalOverview';
import fiscalYearDetailRouter from './fiscalYearDetail';
import fiscalExportRouter from './fiscalExport';
import fiscalSimulateRouter from './fiscalSimulate';
import fiscalPeriodRouter from './fiscalPeriod';
import fiscalPlannerRouter from './fiscalPlanner';
import fiscalCalendarRouter from './fiscalCalendar';
import fiscalDeclaracionesRouter from './fiscalDeclaraciones';
import fiscalEscalasRouter from './fiscalEscalas';

// Orquestador puro: monta los 4 sub-routers en /api/fiscal sin cambiar
// ninguna ruta externa. Fragmentado desde el fichero más grande de todo el
// backend (1133 líneas), cuyo endpoint /:year/export (~425 líneas) mezclaba
// 4 formatos de exportación completamente distintos en un único handler —
// esa lógica vive ahora en modules/fiscal/export/*Export.ts, y
// getEventosAnio()/getLotesAFecha() en modules/fiscal/eventosAnio.ts y
// modules/fiscal/lotesValoracion.ts respectivamente.
const router = Router();

router.use('/', fiscalOverviewRouter);
router.use('/', fiscalYearDetailRouter);
router.use('/', fiscalExportRouter);
router.use('/', fiscalSimulateRouter);
router.use('/', fiscalPeriodRouter);
router.use('/', fiscalPlannerRouter);
router.use('/', fiscalCalendarRouter);
router.use('/', fiscalDeclaracionesRouter);
router.use('/', fiscalEscalasRouter);

export default router;
