import { Router } from 'express';
import settingsAssetsRouter from './settingsAssets';
import settingsCoingeckoRouter from './settingsCoingecko';
import settingsConfigRouter from './settingsConfig';
import settingsMaintenanceRouter from './settingsMaintenance';

// Orquestador puro: monta los 4 sub-routers en /api/settings sin cambiar
// ninguna ruta externa. Fragmentado desde un único fichero de 580 líneas que
// mezclaba 4 bloques: CRUD/detección de assets, helpers de CoinGecko,
// config+stats, y mantenimiento destructivo (price-cache, notifications,
// pending-deposits, bulk-set-costs, backup, borrado masivo, fix-stale).
const router = Router();

router.use('/', settingsAssetsRouter);
router.use('/', settingsCoingeckoRouter);
router.use('/', settingsConfigRouter);
router.use('/', settingsMaintenanceRouter);

export default router;
