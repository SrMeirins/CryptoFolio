import { Router } from 'express';
import { sendInternalError } from '../middleware/errorHandler';
import { getAssetIcon, listAssetIcons, syncAssetIcons } from '../modules/assets/assetIcons';
import { validateSymbol } from './settings/settingsShared';

// Logos de los activos desde el propio origen (#201).
const router = Router();

// GET /api/assets/icons — { SÍMBOLO: versión } de los activos con logo. De
// paso lanza en segundo plano la descarga de los que falten (con enfriamiento).
router.get('/icons', async (_req, res) => {
  try {
    void syncAssetIcons();
    res.json(await listAssetIcons());
  } catch (e) {
    sendInternalError(res, e, 'GET /api/assets/icons');
  }
});

// GET /api/assets/:symbol/icon — imagen del logo, o 404 si no hay.
router.get('/:symbol/icon', async (req, res) => {
  const symbol = validateSymbol(String(req.params.symbol));
  if (!symbol) { res.status(400).json({ error: 'Símbolo inválido' }); return; }
  try {
    const icon = await getAssetIcon(symbol);
    if (!icon) { res.status(404).json({ error: 'Sin logo para este activo' }); return; }
    res.set({
      'Content-Type': icon.contentType,
      // El frontend pide la URL con ?v=<versión>: la imagen nunca cambia en esa URL.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.send(icon.data);
  } catch (e) {
    sendInternalError(res, e, 'GET /api/assets/:symbol/icon');
  }
});

export default router;
