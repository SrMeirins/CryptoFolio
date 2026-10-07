import { Router } from 'express';
import walletsCoreRouter from './walletsCore';
import walletNetworksRouter from './walletNetworks';
import walletAddressesRouter from './walletAddresses';

// Orquestador puro: monta los 3 sub-routers en /api/wallets sin cambiar
// ninguna ruta externa. Fragmentado desde un único fichero de 358 líneas que
// mezclaba 4 recursos (wallets, networks, addresses, api-keys) — cada
// sub-router cubre exactamente uno.
const router = Router();

router.use('/', walletsCoreRouter);
router.use('/', walletNetworksRouter);
router.use('/', walletAddressesRouter);

export default router;
