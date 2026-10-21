import { Router, Request, Response } from 'express';
import { Exchange } from '../../modules/csv/exchanges';
import {
  checkPreImportDepositGate, checkPendingDepositGate, splitDepositCosts,
  applyExistingDepositCostUpdates, importTransactionsPhase,
  fetchMissingHistoricalPrices, runFifoPhase, ProgressEmitter,
} from '../../modules/csv/confirmImport';
import { archivosDe, exchangesForzados, uploadCsv, parseWithdrawalDestinations, parseDepositCosts, retiradasDe } from './importsValidation';
import { cargarAniosFiscales } from '../../modules/fiscal/carryforward';
import { madridYearMonth } from '../../modules/fiscal/madridTime';
import { estadoPreparacion } from '../../modules/pnl/pnlService';
import { verificarEnSegundoPlano } from '../../modules/walletSync/walletSync';
import { agruparAvisosFifo, impactoPorEjercicio, type ArchivoImportado } from '../../modules/csv/resumenImportacion';

const router = Router();

// POST /api/imports/confirm — Import + FIFO con SSE.
//
// Router delgado: transporte (SSE/multer/heartbeat) + orden de las fases.
// La lógica de negocio de cada fase (gates de depósitos, import, precios
// históricos, FIFO) vive en modules/csv/confirmImport.ts, fragmentada desde
// este mismo fichero (antes ~335 líneas mezclando ambas cosas).
//
// Lote (#326): varios archivos se importan uno tras otro, cada uno como su propia
// importación, y los precios históricos y el FIFO se ejecutan una sola vez al final.
router.post('/confirm', uploadCsv, async (req: Request, res: Response) => {
  const archivos = archivosDe(req);
  if (archivos.length === 0) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  let forzados: (Exchange | null)[];
  try { forzados = exchangesForzados(req.body, archivos.length); } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
  // En la confirmación el exchange llega siempre fijado desde la vista previa; sin él, Binance como antes.
  const exchangeDe = (i: number): Exchange => forzados[i] ?? 'binance';
  const lote = archivos.length > 1;

  // Configurar SSE. La cabecera CORS la pone el middleware global de app.ts
  // (buildCorsMiddleware, corre antes de llegar aquí) — no hace falta
  // replicarla a mano en este handler.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // compresion/express pueden exponer flush() en la respuesta; se tipa una sola vez.
  const flushable = res as Response & { flush?: () => void };

  const send: ProgressEmitter = (phase, message, progress, total, extra) => {
    const data = JSON.stringify({ phase, message, progress, total, ...extra });
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
    const withdrawalDestinations = parseWithdrawalDestinations(req.body.withdrawalDestinations);
    const depositCostsRaw = parseDepositCosts(req.body.depositCosts);

    // Todos los archivos pasan el gate de depósitos antes de importar ninguno.
    let totalParsed = 0;
    for (const [i, f] of archivos.entries()) {
      const gate0 = await checkPreImportDepositGate(exchangeDe(i), f.buffer, depositCostsRaw);
      if (gate0.blocked) {
        send('error',
          `⛔ Revisión requerida${lote ? ` en «${f.originalname}»` : ''}: hay ${gate0.missingCount} depósito${gate0.missingCount > 1 ? 's' : ''} ` +
          `externo${gate0.missingCount > 1 ? 's' : ''} sin coste de adquisición. ` +
          `Vuelve al preview y asigna el coste en el panel de "Revisión obligatoria".`
        );
        res.end();
        return;
      }
      totalParsed += gate0.preparse.transactions.length;
    }

    // FASE 1: Importar transacciones
    send('importing', `Importando ${totalParsed} transacciones${lote ? ` de ${archivos.length} archivos` : ''}...`, 0, totalParsed);

    const { existingDepositUpdates, newDepositCosts } = splitDepositCosts(depositCostsRaw);
    await applyExistingDepositCostUpdates(existingDepositUpdates);

    const retiradas = retiradasDe(req);
    const importados: ArchivoImportado[] = [];
    for (const [i, f] of archivos.entries()) {
      if (lote) send('importing', `Archivo ${i + 1} de ${archivos.length}: ${f.originalname}`);
      try {
        const r = await importTransactionsPhase(f.buffer, f.originalname, withdrawalDestinations, newDepositCosts, exchangeDe(i), send, retiradas);
        importados.push({ importId: r.importId, archivo: f.originalname, exchange: exchangeDe(i), nuevas: r.newTransactions, duplicadas: r.duplicateRows });
      } catch (e) {
        // En un lote, un archivo idéntico a uno ya importado se salta sin abortar el resto.
        if (lote && (e as Error).message.startsWith('Este CSV exacto ya fue importado')) {
          send('importing', `⚠ «${f.originalname}» ya estaba importado: se salta`);
          continue;
        }
        throw e;
      }
    }

    // FASE 2: Precios históricos
    const precios = await fetchMissingHistoricalPrices(send);

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

    // FASE 3: Motor FIFO, con el G/P de cada ejercicio antes y después para el resumen (#324)
    const anio = madridYearMonth().year;
    const antes = await cargarAniosFiscales(anio);
    const fifo = await runFifoPhase(send);
    const despues = await cargarAniosFiscales(anio);

    // Arranca ya la descarga de cierres para el dashboard (#334); no se espera.
    void estadoPreparacion().catch(e => console.error('[IMPORT] Preparación de históricos fallida:', (e as Error).message));
    // Con los saldos ya recalculados, se verifican las direcciones on-chain (#336).
    verificarEnSegundoPlano();

    send('done', 'Proceso completado correctamente', undefined, undefined, {
      resumen: {
        importId: importados[0]?.importId ?? '',
        archivo: archivos.map(f => f.originalname).join(', '),
        archivos: importados,
        nuevas: importados.reduce((s, a) => s + a.nuevas, 0),
        duplicadas: importados.reduce((s, a) => s + a.duplicadas, 0),
        precios,
        avisos: agruparAvisosFifo(fifo.errors, fifo.warnings),
        impacto: impactoPorEjercicio(antes, despues),
      },
    });
  } catch (err) {
    send('error', `Error: ${(err as Error).message}`);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

export default router;
