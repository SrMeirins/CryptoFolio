import { Router, Request, Response } from 'express';
import { Exchange, isExchange } from '../../modules/csv/exchanges';
import {
  checkPreImportDepositGate, checkPendingDepositGate, splitDepositCosts,
  applyExistingDepositCostUpdates, importTransactionsPhase,
  fetchMissingHistoricalPrices, runFifoPhase, ProgressEmitter,
} from '../../modules/csv/confirmImport';
import { hasBinaryMagic, upload, parseWithdrawalDestinations, parseDepositCosts } from './importsValidation';

const router = Router();

// POST /api/imports/confirm — Import + FIFO con SSE.
//
// Router delgado: transporte (SSE/multer/heartbeat) + orden de las fases.
// La lógica de negocio de cada fase (gates de depósitos, import, precios
// históricos, FIFO) vive en modules/csv/confirmImport.ts, fragmentada desde
// este mismo fichero (antes ~335 líneas mezclando ambas cosas).
router.post('/confirm', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  const exchange: Exchange = isExchange(req.body.exchange) ? req.body.exchange : 'binance';

  // Configurar SSE. La cabecera CORS la pone el middleware global de app.ts
  // (buildCorsMiddleware, corre antes de llegar aquí) — no hace falta
  // replicarla a mano en este handler.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // compresion/express pueden exponer flush() en la respuesta; se tipa una sola vez.
  const flushable = res as Response & { flush?: () => void };

  const send: ProgressEmitter = (phase, message, progress, total) => {
    const data = JSON.stringify({ phase, message, progress, total });
    res.write(`data: ${data}\n\n`);
    flushable.flush?.();
  };

  // Keep-alive: durante la fase de precios el backend puede pasar más de un minuto
  // bloqueado en el backoff 429 de CoinGecko sin emitir datos. Un stream SSE en silencio
  // lo corta el proxy del dev (o el navegador) y el cliente lo reporta como "Error de
  // conexión" aunque el servidor siga trabajando. Este comentario SSE periódico mantiene
  // el socket vivo; el cliente ignora las líneas que no empiezan por "data: ".
  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); flushable.flush?.(); } catch { /* conexión ya cerrada */ }
  }, 10000);

  try {
    if (hasBinaryMagic(req.file.buffer)) {
      send('error', '⛔ El archivo no es un CSV válido (cabecera binaria detectada)');
      res.end();
      return;
    }

    const withdrawalDestinations = parseWithdrawalDestinations(req.body.withdrawalDestinations);
    const depositCostsRaw = parseDepositCosts(req.body.depositCosts);

    const gate0 = await checkPreImportDepositGate(exchange, req.file.buffer, depositCostsRaw);
    if (gate0.blocked) {
      send('error',
        `⛔ Revisión requerida: hay ${gate0.missingCount} depósito${gate0.missingCount > 1 ? 's' : ''} ` +
        `externo${gate0.missingCount > 1 ? 's' : ''} sin coste de adquisición. ` +
        `Vuelve al preview y asigna el coste en el panel de "Revisión obligatoria".`
      );
      res.end();
      return;
    }

    // FASE 1: Importar transacciones
    const totalParsed = gate0.preparse.transactions.length;
    send('importing', `Importando ${totalParsed} transacciones...`, 0, totalParsed);

    const { existingDepositUpdates, newDepositCosts } = splitDepositCosts(depositCostsRaw);
    await applyExistingDepositCostUpdates(existingDepositUpdates);

    await importTransactionsPhase(
      req.file.buffer, req.file.originalname, withdrawalDestinations, newDepositCosts, exchange, send
    );

    // FASE 2: Precios históricos
    await fetchMissingHistoricalPrices(send);

    // GATE: verificar que no haya depósitos externos sin coste antes de correr FIFO
    const gate1 = await checkPendingDepositGate();
    if (gate1.blocked) {
      send('error',
        `⛔ FIFO bloqueado: hay ${gate1.missingCount} depósito${gate1.missingCount > 1 ? 's' : ''} ` +
        `externo${gate1.missingCount > 1 ? 's' : ''} sin coste de adquisición. ` +
        `Revísalos en la sección de Importación antes de continuar.`
      );
      res.end();
      return;
    }

    // FASE 3: Motor FIFO
    await runFifoPhase(send);

    send('done', 'Proceso completado correctamente');
  } catch (err) {
    send('error', `Error: ${(err as Error).message}`);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

export default router;
