import { z, ZodError } from 'zod';
import { Response } from 'express';
import { getHistoricalPriceEur } from '../../modules/prices/binance';
import { runFifoEngine } from '../../modules/fifo/engine';
import { MAX_LENGTH_LONG, MAX_LENGTH_SHORT } from '../../modules/validation/textLength';

// Construye un mensaje 400 legible en castellano a partir de los issues de
// Zod, sin filtrar detalles internos sensibles (solo nombres de campo y
// mensajes de validación).
export function zodErrorMessage(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

export function sendZodError(res: Response, error: ZodError): void {
  res.status(400).json({ error: `Datos inválidos: ${zodErrorMessage(error)}` });
}

// Campos de entrada de una transacción manual (POST /manual y PUT /:id).
// Los campos numéricos se coaccionan con z.coerce.number() para aceptar tanto
// number como string numérico, pero RECHAZAN cualquier valor no numérico en
// vez de convertirlo silenciosamente a 0 (bug detectado en auditoría).
export const transactionFieldsSchema = z.object({
  operationType:        z.string().min(1, 'operationType es requerido'),
  asset:                z.string().max(MAX_LENGTH_SHORT, `asset no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  amount:               z.coerce.number().nullish(),
  amountNet:            z.coerce.number().nullish(),
  costAsset:            z.string().max(MAX_LENGTH_SHORT, `costAsset no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  costAmount:           z.coerce.number().nullish(),
  pricePerUnit:         z.coerce.number().nullish(),
  feeAsset:             z.string().max(MAX_LENGTH_SHORT, `feeAsset no puede superar ${MAX_LENGTH_SHORT} caracteres`).nullish(),
  feeAmount:            z.coerce.number().nullish(),
  wallet_id:            z.string().nullish(),
  destinationWalletId:  z.string().nullish(),
  timestamp:            z.string().min(1, 'timestamp es requerido'),
  notes:                z.string().max(MAX_LENGTH_LONG, `notes no puede superar ${MAX_LENGTH_LONG} caracteres`).nullish(),
});

// PUT /:id exige wallet_id igual que antes.
export const transactionUpdateSchema = transactionFieldsSchema.extend({
  wallet_id: z.string().min(1, 'wallet_id es requerido'),
});

export type TransactionFields = z.infer<typeof transactionFieldsSchema>;

// Ops que no generan precio histórico (coste 0 por ley)
export const ZERO_COST_OPS = new Set(['FORK']);
// Ops que consumen lotes (para preview)
export const CONSUME_OPS = new Set(['SELL', 'SELL_FIAT', 'SELL_CRYPTO', 'GIFT_SENT', 'LOST', 'FEE_NETWORK', 'FEE_EXCHANGE']);
// Ops que crean lotes
export const OPEN_LOT_OPS = new Set(['BUY', 'BUY_FIAT', 'BUY_CRYPTO', 'AIRDROP', 'DEPOSIT_CRYPTO', 'FORK', 'STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK']);

export function isFeeOperation(operationType: string): boolean {
  return operationType === 'FEE_NETWORK' || operationType === 'FEE_EXCHANGE';
}

// FEE ops usan fee_asset/fee_amount como campo principal en vez de asset/amount.
export function resolveFinalAssetAmount(
  operationType: string,
  asset: string | null | undefined,
  amount: number | null | undefined,
  feeAsset: string | null | undefined,
  feeAmount: number | null | undefined,
): { finalAsset: string | null | undefined; finalAmount: number | null | undefined } {
  const feeOp = isFeeOperation(operationType);
  return {
    finalAsset:  feeOp ? (feeAsset  ?? asset)  : asset,
    finalAmount: feeOp ? (feeAmount ?? amount) : amount,
  };
}

// Precio histórico por unidad: FORK = 0 por ley AEAT; si no viene explícito,
// se resuelve contra el histórico de Binance/CoinGecko (sin bloquear si falla).
export async function resolveFinalPricePerUnit(
  operationType: string,
  pricePerUnit: number | null | undefined,
  finalAsset: string | null | undefined,
  timestamp: string,
): Promise<number | null> {
  if (operationType === 'FORK') return 0;
  if (pricePerUnit) return pricePerUnit;
  if (!finalAsset) return null;
  try {
    return await getHistoricalPriceEur(finalAsset, new Date(timestamp));
  } catch {
    return null;
  }
}

// costAsset: solo EUR por defecto en operaciones fiat. Crypto ops tienen su propio asset.
export function resolveCostAsset(operationType: string, costAsset: string | null | undefined): string | null {
  return costAsset ?? (
    ['BUY_FIAT', 'SELL_FIAT', 'DEPOSIT_FIAT', 'WITHDRAW_FIAT'].includes(operationType) ? 'EUR' : null
  );
}

// costAmount: FORK = 0 por ley; si no viene explícito, se infiere de
// amount × pricePerUnit cuando ambos están disponibles.
export function resolveFinalCostAmount(
  operationType: string,
  costAmount: number | null | undefined,
  finalPricePerUnit: number | null,
  finalAmount: number | null | undefined,
): number | null {
  if (operationType === 'FORK') return 0;
  if (costAmount) return costAmount;
  if (finalPricePerUnit && finalAmount) return finalAmount * finalPricePerUnit;
  return null;
}

// Tras escribir una transacción manual (create/update/delete), el motor FIFO
// se recalcula de forma síncrona para devolver el resultado al cliente. La
// escritura en BD ya tuvo éxito en este punto — si el recálculo FIFO falla,
// el cliente necesita saber que algo quedó desincronizado, pero sin recibir
// el (err as Error).message crudo del motor (puede incluir detalles
// internos). Mismo criterio de seguridad que sendInternalError, adaptado:
// la respuesta sigue siendo success:true/fifo:null (no 500), porque la
// escritura en sí no falló.
export async function respondWithFifoRecalc(res: Response, context: string): Promise<void> {
  try {
    const fifoResult = await runFifoEngine();
    res.json({ success: true, fifo: fifoResult });
  } catch (err) {
    const detail = err instanceof Error ? err.stack ?? err.message : err;
    console.error(`[ERROR] ${context}:`, detail);
    res.json({
      success: true,
      fifo: null,
      fifoError: 'El motor FIFO falló al recalcular tras esta operación. Revisa el historial o vuelve a ejecutarlo manualmente desde Ajustes.',
    });
  }
}
