import { Router } from 'express';
import settingsAssetsRouter from './settingsAssets';
import settingsCoingeckoRouter from './settingsCoingecko';
import settingsConfigRouter from './settingsConfig';
import settingsMaintenanceRouter from './settingsMaintenance';
import settingsBackupRouter from './settingsBackup';
import settingsAutoBackupRouter from './settingsAutoBackup';

// Orquestador puro: monta los sub-routers en /api/settings sin cambiar
// ninguna ruta externa. Fragmentado desde un único fichero de 580 líneas que
// mezclaba 4 bloques: CRUD/detección de assets, helpers de CoinGecko,
// config+stats, y mantenimiento destructivo (price-cache, notifications,
// pending-deposits, bulk-set-costs, borrado masivo, fix-stale). Las copias
// de seguridad van aparte (#453), y las automáticas también (#454).
const router = Router();

router.use('/', settingsAssetsRouter);
router.use('/', settingsCoingeckoRouter);
router.use('/', settingsConfigRouter);
router.use('/', settingsMaintenanceRouter);
router.use('/', settingsBackupRouter);
router.use('/', settingsAutoBackupRouter);

export default router;
