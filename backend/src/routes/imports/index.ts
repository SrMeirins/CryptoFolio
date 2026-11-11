import { Router } from 'express';
import importsPreviewRouter from './importsPreview';
import importsConfirmRouter from './importsConfirm';
import importsCrudRouter from './importsCrud';
import importsCoberturaRouter from './importsCobertura';
import importsRetirosExistentesRouter from './importsRetirosExistentes';
import importsZonaHorariaRouter from './importsZonaHoraria';

// Orquestador puro: monta los 3 sub-routers en /api/imports sin cambiar
// ninguna ruta externa. Fragmentado desde un único fichero de 470 líneas
// cuyo endpoint /confirm (~335 líneas) mezclaba transporte SSE/CORS con
// lógica de negocio (gates de depósitos, import, precios, FIFO) — esa
// lógica vive ahora en modules/csv/confirmImport.ts.
const router = Router();

router.use('/', importsPreviewRouter);
router.use('/', importsConfirmRouter);
// Antes que el CRUD: /cobertura/revisiones/:id no debe caer en DELETE /:id (#328).
router.use('/', importsCoberturaRouter);
router.use('/', importsRetirosExistentesRouter);
// Zona horaria de los CSV de Binance (#599).
router.use('/', importsZonaHorariaRouter);
router.use('/', importsCrudRouter);

export default router;
