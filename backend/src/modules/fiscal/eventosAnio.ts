import { db } from '../../db/client';
import { getContrapartidaClave } from './contrapartida';
import { hayRecompra, type Adquisicion } from './antiRecompra';
import { getHistoricalPriceEur } from '../prices/binance';

function getTipoRendimiento(operationType: string): string {
  const map: Record<string, string> = {
    'STAKING_REWARD':   'Staking',
    'MINING_REWARD':    'Minería',
    'LENDING_INTEREST':        'Lending / Interés flexible',
    'LENDING_INTEREST_LOCKED': 'Lending / Interés bloqueado',
    'CASHBACK':         'Cashback / Bonus',
    'AIRDROP':          'Airdrop',
  };
  return map[operationType] ?? operationType;
}

export interface EventoFiscal {
  fecha: string;
  tipo: string;
  activoTransmitido: string;
  activoRecibido: string | null;
  cantidadTransmitida: number;
  contrapartidaClave: string;
  contrapartidaDescripcion: string;
  valorTransmisionEur: number;
  gastosTransmisionEur: number;
  valorAdquisicionEur: number;
  gastosAdquisicionEur: number;
  gananciaPerdidaEur: number;
  wallet: string;
  txId: string;
  permutaWrapStaking: boolean;
  lostSinMotivo: boolean;
  posiblePerdidaDiferida: boolean;
}

export interface Rendimiento {
  fecha: string;
  tipo: string;
  activo: string;
  cantidad: number;
  valorEur: number;
  wallet: string;
}

// Carga y formatea los eventos fiscales y rendimientos de un año dado.
// Función compartida entre /events y /export para no duplicar lógica.
export async function getEventosAnio(year: number): Promise<{ fiscalEvents: EventoFiscal[]; rendimientos: Rendimiento[] }> {
  const gpRows = await db.query(`
    SELECT
      flc.consumed_at             AS fecha,
      flc.lot_id,
      t.operation_type,
      fl.asset                    AS activo_transmitido,
      t.asset                     AS tx_asset,
      flc.quantity_consumed       AS cantidad,
      t.cost_asset,
      flc.proceeds_eur            AS valor_transmision,
      fl.fee_eur                  AS gastos_adquisicion,
      flc.cost_basis_consumed_eur AS valor_adquisicion,
      flc.gain_loss_eur,
      w.name                      AS wallet,
      t.id                        AS tx_id,
      t.fee_asset,
      t.fee_amount,
      t.notes                     AS tx_notes
    FROM fifo_lot_consumptions flc
    JOIN fifo_lots    fl ON fl.id = flc.lot_id
    JOIN transactions t  ON t.id  = flc.consuming_transaction_id
    JOIN wallets      w  ON w.id  = t.wallet_id
    WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
      AND flc.fiscal_event_type != 'NONE'
    ORDER BY flc.consumed_at ASC
  `, [year]);

  // Adquisiciones reales de la ventana (año ± 2 meses) para el aviso anti-recompra.
  // Se excluyen lotes abiertos por movimientos propios (no son compras).
  const adqRes = await db.query(`
    SELECT fl.asset, fl.opened_at AS fecha, fl.id AS lot_id
    FROM fifo_lots fl
    JOIN transactions t ON t.id = fl.open_transaction_id
    WHERE t.operation_type NOT IN ('TRANSFER_INTERNAL', 'WITHDRAW', 'DEPOSIT_CRYPTO', 'MARGIN_BORROW')
      AND fl.opened_at >= make_date($1, 1, 1) - INTERVAL '2 months'
      AND fl.opened_at <  make_date($1 + 1, 1, 1) + INTERVAL '2 months'
  `, [year]);
  const adquisiciones: Adquisicion[] = adqRes.rows.map((r: Record<string, unknown>) => ({
    asset: r.asset as string, fecha: new Date(r.fecha as string), lotId: r.lot_id as string,
  }));

  const FEE_OR_LOSS_OPS = new Set(['FEE_EXCHANGE', 'FEE_NETWORK', 'FEE', 'LOST', 'GIFT_SENT']);

  const fiscalEvents: EventoFiscal[] = await Promise.all(
    gpRows.rows.map(async (row: Record<string, unknown>) => {
      const opType    = row.operation_type as string;
      const asset     = row.activo_transmitido as string;
      const txAsset   = row.tx_asset as string | null;
      const costAsset = row.cost_asset as string | null;

      // Determinar qué se recibió a cambio:
      // - BUY permuta (comprar B con A): tx_asset = B (distinto de fl.asset = A)
      // - SELL (vender A por B): cost_asset = B, tx_asset = fl.asset
      // - FEE/LOST: sin contrapartida directa
      let activoRecibido: string | null;
      if (FEE_OR_LOSS_OPS.has(opType)) {
        activoRecibido = null;
      } else if (txAsset && txAsset !== asset) {
        activoRecibido = txAsset;      // permuta: compraron txAsset vendiendo asset
      } else {
        activoRecibido = costAsset || null;  // SELL: recibieron costAsset
      }

      const contrapartida = getContrapartidaClave(activoRecibido);

      let gastosTransmision = 0;
      if (row.fee_asset && row.fee_amount) {
        try {
          const feePrice = await getHistoricalPriceEur(
            row.fee_asset as string,
            new Date(row.fecha as string)
          );
          gastosTransmision = parseFloat(row.fee_amount as string) * feePrice;
        } catch {
          // precio de fee no disponible — gastos de transmisión = 0
        }
      }

      return {
        fecha:                    new Date(row.fecha as string).toISOString().slice(0, 10),
        tipo:                     opType,
        activoTransmitido:        asset,
        activoRecibido:           activoRecibido,
        cantidadTransmitida:      parseFloat(row.cantidad as string),
        contrapartidaClave:       contrapartida.clave,
        contrapartidaDescripcion: contrapartida.descripcion,
        valorTransmisionEur:      parseFloat(row.valor_transmision as string),
        gastosTransmisionEur:     gastosTransmision,
        valorAdquisicionEur:      parseFloat(row.valor_adquisicion as string),
        gastosAdquisicionEur:     parseFloat(row.gastos_adquisicion as string) || 0,
        gananciaPerdidaEur:       parseFloat(row.gain_loss_eur as string),
        wallet:                   row.wallet as string,
        txId:                     row.tx_id as string,
        // Aviso, no bloqueo: el wrap ETH↔BETH de staking se trata como permuta
        // imponible (criterio conservador; sin doctrina DGT específica).
        permutaWrapStaking:       String(row.tx_notes ?? '').startsWith('ETH 2.0 Staking'),
        // Aviso, no bloqueo: un LOST sin motivo anotado se computa 100% deducible,
        // pero la deducibilidad real depende del motivo (estafa, insolvencia, clave perdida...).
        lostSinMotivo:            opType === 'LOST' && !String(row.tx_notes ?? '').trim(),
        // Aviso, no bloqueo: pérdida con recompra del mismo activo en ±2 meses.
        posiblePerdidaDiferida:   parseFloat(row.gain_loss_eur as string) < 0 &&
          hayRecompra(asset, new Date(row.fecha as string), row.lot_id as string, adquisiciones),
      };
    })
  );

  const rendRows = await db.query(`
    SELECT
      t.timestamp    AS fecha,
      t.operation_type,
      t.asset        AS activo,
      t.amount_net   AS cantidad,
      t.amount_net * COALESCE(t.price_per_unit, 0) AS valor_eur,
      w.name         AS wallet
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    WHERE EXTRACT(YEAR FROM t.timestamp) = $1
      AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    ORDER BY t.timestamp ASC
  `, [year]);

  const rendimientos: Rendimiento[] = rendRows.rows.map((row: Record<string, unknown>) => ({
    fecha:    new Date(row.fecha as string).toISOString().slice(0, 10),
    tipo:     getTipoRendimiento(row.operation_type as string),
    activo:   row.activo as string,
    cantidad: parseFloat(row.cantidad as string),
    valorEur: parseFloat(row.valor_eur as string),
    wallet:   row.wallet as string,
  }));

  return { fiscalEvents, rendimientos };
}
