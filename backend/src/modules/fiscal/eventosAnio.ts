import { db } from '../../db/client';
import { localDate } from '../time/localTime';
import { getAppTimezone } from '../time/appTimezone';
import { activoRecibido as recibidoDe, getContraprestacion } from './contrapartida';
import { hayRecompra, type Adquisicion } from './antiRecompra';
import { getPrecioMomentoEur } from '../prices/momento';
import { OPS_RENTA_ESPECIE, baseDeRenta, type BaseIrpf } from './clasificacionRentas';
import type { CriterioValor } from '../fifo/valoracion';
import { estadoDeRendimientos, type EstadoUnidades } from './estadoUnidades';

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

export type CanalOperacion = 'orden' | 'convert' | 'saldos' | 'liquidacion';

/**
 * Canal de una operación (#543): el de su línea original del CSV o, si la
 * importación es anterior a guardar esas líneas (#374), el de sus notas.
 */
export function canalDe(desdeCsv: string | null, notas: string | null): CanalOperacion | null {
  if (desdeCsv === 'orden' || desdeCsv === 'convert' || desdeCsv === 'saldos' || desdeCsv === 'liquidacion') return desdeCsv;
  const n = notas ?? '';
  if (n.startsWith('Binance Convert')) return 'convert';
  if (n.startsWith('Small Assets')) return 'saldos';
  return null;
}

export interface EventoFiscal {
  /** Día de la operación en la zona de la aplicación (AAAA-MM-DD, #295, #388). */
  fecha: string;
  /** Instante exacto (ISO UTC), para mostrar la hora local. */
  fechaHora: string;
  tipo: string;
  activoTransmitido: string;
  activoRecibido: string | null;
  cantidadTransmitida: number;
  contrapartidaClave: string;
  contrapartidaDescripcion: string;
  /** Sin clave segura (donación, pérdida): revisar antes de declarar (#531). */
  contrapartidaRevisar: boolean;
  valorTransmisionEur: number;
  gastosTransmisionEur: number;
  valorAdquisicionEur: number;
  gastosAdquisicionEur: number;
  gananciaPerdidaEur: number;
  wallet: string;
  txId: string;
  /** Día de compra del lote consumido (zona de la app, #543). */
  fechaAdquisicion: string;
  // Identificador único del evento (el consumo de lote que lo origina): una
  // operación que consume varios lotes genera varios eventos con el mismo
  // txId (#201).
  eventId: string;
  /**
   * Comisión de una compra que fue al coste de lo recibido (#543), parte de
   * este lote. Informativa: no es gasto de esta fila, se deduce como gasto de
   * adquisición cuando se vende lo recibido.
   */
  comisionCompraEur: number;
  /** Binance Convert: comisión incluida en el tipo de cambio, sin desglose. */
  esConvert: boolean;
  /**
   * Cómo se valoró la transmisión (#599): precio del momento, «el mayor» de
   * los dos lados de una permuta o precio del día como respaldo. null en
   * consumos anteriores al recálculo con este criterio.
   */
  valoracion: CriterioValor | null;
  /** Valores de los dos lados de la permuta en el momento, solo con «el mayor». */
  valorEntregadoEur: number | null;
  valorRecibidoEur: number | null;
  /** Canal de la operación (#543): orden de mercado, Convert, saldos pequeños a BNB o liquidación. */
  canal: CanalOperacion | null;
  permutaWrapStaking: boolean;
  lostSinMotivo: boolean;
  posiblePerdidaDiferida: boolean;
}

export interface Rendimiento {
  /** Día en la zona de la aplicación (AAAA-MM-DD, #295, #388). */
  fecha: string;
  fechaHora: string;
  tipo: string;
  activo: string;
  cantidad: number;
  valorEur: number;
  wallet: string;
  /** Base del IRPF en la que se integra (#537): el ahorro entra en la cuota; la general solo se informa. */
  base: BaseIrpf;
  /** Transacción del rendimiento (#544), para enlazarla en Historial. */
  txId: string;
  /** Tipo de operación (STAKING_REWARD, AIRDROP…), para agrupar y marcar los que se revisan (#544). */
  operacion: string;
  /** Precio por unidad al recibir: el valor y el coste FIFO de esas unidades salen de él (#544). */
  precioEur: number;
  /** Cuánto de lo recibido se ha transmitido ya y con qué resultado (#544); null sin lote FIFO. */
  estado: EstadoUnidades | null;
}

// Carga y formatea los eventos fiscales y rendimientos de un año dado.
// Función compartida entre /events y /export para no duplicar lógica.
export async function getEventosAnio(year: number): Promise<{ fiscalEvents: EventoFiscal[]; rendimientos: Rendimiento[] }> {
  const tz = await getAppTimezone(db);
  const gpRows = await db.query(`
    SELECT
      flc.consumed_at             AS fecha,
      flc.id                      AS consumption_id,
      flc.lot_id,
      t.operation_type,
      fl.asset                    AS activo_transmitido,
      t.asset                     AS tx_asset,
      flc.quantity_consumed       AS cantidad,
      t.cost_asset,
      flc.proceeds_eur            AS valor_transmision,
      fl.fee_eur                  AS comision_lote,
      fl.quantity_original        AS cantidad_lote,
      flc.cost_basis_consumed_eur AS valor_adquisicion,
      flc.gain_loss_eur,
      flc.valoracion,
      flc.valor_entregado_eur,
      flc.valor_recibido_eur,
      fl.opened_at                AS adquirido_en,
      -- Cantidad total que consumió la operación en todos sus lotes: la comisión
      -- se reparte entre ellos en proporción (#543); antes cada lote la llevaba entera.
      -- Solo del mismo activo: una comisión en BNB de la misma orden se consume
      -- en la misma transacción y no debe entrar en el reparto.
      (SELECT SUM(x.quantity_consumed) FROM fifo_lot_consumptions x
        JOIN fifo_lots xl ON xl.id = x.lot_id
        WHERE x.consuming_transaction_id = flc.consuming_transaction_id
          AND xl.asset = fl.asset) AS cantidad_operacion,
      w.name                      AS wallet,
      t.id                        AS tx_id,
      t.fee_asset,
      t.fee_amount,
      -- Comisiones de la orden en otra moneda (#543), enlazadas con linked_tx_id.
      (SELECT json_agg(json_build_object('asset', COALESCE(l.fee_asset, l.asset), 'amount', COALESCE(l.fee_amount, l.amount)))
        FROM transactions l
        WHERE l.linked_tx_id = t.id AND l.operation_type = 'FEE_EXCHANGE') AS comisiones_enlazadas,
      -- Comisión de la compra que fue al coste de lo recibido (#543): solo informativa
      -- en esta fila; se deduce como gasto de adquisición al vender lo recibido.
      (SELECT SUM(ol.fee_eur) FROM fifo_lots ol
        WHERE ol.open_transaction_id = t.id AND ol.asset = t.asset) AS comision_compra,
      -- Canal de la operación según la línea original del CSV (#543): una orden
      -- trae su comisión explícita; Convert y saldos pequeños la llevan en el cambio.
      (SELECT CASE
          WHEN bool_or(r.original_row->>'Operation' = 'Binance Convert') THEN 'convert'
          WHEN bool_or(r.original_row->>'Operation' = 'Small Assets Exchange BNB') THEN 'saldos'
          WHEN bool_or(r.original_row->>'Operation' LIKE '%Liquidation%') THEN 'liquidacion'
          WHEN bool_or(r.original_row->>'Operation' IN ('Transaction Buy', 'Transaction Spend', 'Transaction Sold', 'Transaction Revenue', 'Transaction Sell')
                    OR lower(r.original_row->>'Type') IN ('buy', 'sell')) THEN 'orden'
        END
        FROM raw_transactions r WHERE r.transaction_id = t.id) AS canal,
      t.notes                     AS tx_notes
    FROM fifo_lot_consumptions flc
    JOIN fifo_lots    fl ON fl.id = flc.lot_id
    JOIN transactions t  ON t.id  = flc.consuming_transaction_id
    JOIN wallets      w  ON w.id  = t.wallet_id
    WHERE EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE $2) = $1
      AND flc.fiscal_event_type != 'NONE'
    ORDER BY flc.consumed_at ASC
  `, [year, tz]);

  // Adquisiciones reales de la ventana (año ± 2 meses) para el aviso anti-recompra.
  // Se excluyen lotes abiertos por movimientos propios (no son compras).
  const adqRes = await db.query(`
    SELECT fl.asset, fl.opened_at AS fecha, fl.id AS lot_id
    FROM fifo_lots fl
    JOIN transactions t ON t.id = fl.open_transaction_id
    WHERE t.operation_type NOT IN ('TRANSFER_INTERNAL', 'WITHDRAW', 'DEPOSIT_CRYPTO', 'MARGIN_BORROW')
      AND fl.opened_at >= (make_date($1, 1, 1) - INTERVAL '2 months')::timestamp AT TIME ZONE $2
      AND fl.opened_at <  (make_date($1 + 1, 1, 1) + INTERVAL '2 months')::timestamp AT TIME ZONE $2
  `, [year, tz]);
  const adquisiciones: Adquisicion[] = adqRes.rows.map((r: Record<string, unknown>) => ({
    asset: r.asset as string, fecha: new Date(r.fecha as string), lotId: r.lot_id as string,
  }));

  const fiscalEvents: EventoFiscal[] = await Promise.all(
    gpRows.rows.map(async (row: Record<string, unknown>) => {
      const opType    = row.operation_type as string;
      const asset     = row.activo_transmitido as string;
      const txAsset   = row.tx_asset as string | null;
      const costAsset = row.cost_asset as string | null;

      // Qué se recibió a cambio y clave de la casilla 1800 (#531).
      const consumo = { operationType: opType, activoTransmitido: asset, txAsset, costAsset, feeAsset: row.fee_asset as string | null };
      const activoRecibido = recibidoDe(consumo);
      const contrapartida = getContraprestacion(consumo);

      // Valores y gastos por separado, como los pide la Renta (#543). El resultado
      // es siempre el del FIFO: (transmisión - gastos) - (adquisición + gastos).
      // Gastos de transmisión: los que el FIFO resta de lo obtenido. En una venta,
      // su comisión en cualquier activo (del par o un tercero, como BNB) y las
      // comisiones enlazadas en otra moneda; en una compra que recibe EUR (venta
      // a fiat), lo mismo. En el resto de compras la comisión es coste de lo
      // recibido y aparece como gasto de adquisición cuando se vende.
      const VENTAS = ['SELL', 'SELL_FIAT', 'SELL_CRYPTO', 'GIFT_SENT'];
      const BUYS = ['BUY', 'BUY_FIAT', 'BUY_CRYPTO'];
      const esVenta = VENTAS.includes(opType) || (BUYS.includes(opType) && txAsset === 'EUR');
      // Solo el activo que se transmite en la orden; no la comisión en BNB, que es su propia fila.
      const consumoPrincipal = BUYS.includes(opType) ? asset === costAsset : asset === txAsset;
      let gastosTransmision = 0;
      if (esVenta && consumoPrincipal) {
        try {
          const fecha = new Date(row.fecha as string);
          // El mismo precio del momento que usó el FIFO al restarlas (#599).
          const precio = async (a: string) => (await getPrecioMomentoEur(a, fecha)).precio;
          let comisiones = 0;
          if (row.fee_asset && row.fee_amount) {
            comisiones += parseFloat(row.fee_amount as string) * await precio(row.fee_asset as string);
          }
          for (const c of (row.comisiones_enlazadas as { asset: string; amount: string | number }[] | null) ?? []) {
            comisiones += Number(c.amount) * await precio(c.asset);
          }
          // Parte de las comisiones que corresponde a este lote (#543): la suma de
          // los lotes de una operación es exactamente su comisión.
          const total = parseFloat(row.cantidad_operacion as string);
          const parte = total > 0 ? parseFloat(row.cantidad as string) / total : 1;
          gastosTransmision = comisiones * parte;
        } catch {
          // precio de la comisión no disponible: gastos de transmisión = 0
        }
      }

      // Parte de la comisión de compra del lote que corresponde a lo consumido (#543).
      const cantidadLote = parseFloat(row.cantidad_lote as string);
      const gastosAdquisicion = cantidadLote > 0
        ? (parseFloat(row.comision_lote as string) || 0) * parseFloat(row.cantidad as string) / cantidadLote
        : 0;

      // Comisión de compra de lo recibido (#543), repartida entre los lotes como
      // los gastos de transmisión: la suma de la operación es la comisión exacta.
      // Solo en el activo que se entrega en la orden (no en el BNB de la comisión).
      let comisionCompra = 0;
      if (BUYS.includes(opType) && txAsset !== 'EUR' && consumoPrincipal) {
        const total = parseFloat(row.cantidad_operacion as string);
        const parte = total > 0 ? parseFloat(row.cantidad as string) / total : 1;
        comisionCompra = (parseFloat(row.comision_compra as string) || 0) * parte;
      }

      return {
        fecha:                    localDate(tz, new Date(row.fecha as string)),
        fechaHora:                new Date(row.fecha as string).toISOString(),
        tipo:                     opType,
        activoTransmitido:        asset,
        activoRecibido:           activoRecibido,
        cantidadTransmitida:      parseFloat(row.cantidad as string),
        contrapartidaClave:       contrapartida.clave,
        contrapartidaDescripcion: contrapartida.descripcion,
        contrapartidaRevisar:     contrapartida.revisar,
        // Bruto: lo recibido más la comisión que el FIFO restó.
        valorTransmisionEur:      parseFloat(row.valor_transmision as string) + gastosTransmision,
        gastosTransmisionEur:     gastosTransmision,
        // Sin la comisión de compra, que va aparte en su parte proporcional.
        valorAdquisicionEur:      parseFloat(row.valor_adquisicion as string) - gastosAdquisicion,
        gastosAdquisicionEur:     gastosAdquisicion,
        gananciaPerdidaEur:       parseFloat(row.gain_loss_eur as string),
        wallet:                   row.wallet as string,
        txId:                     row.tx_id as string,
        // Fecha de compra del lote consumido (#543), para el detalle de la operación.
        fechaAdquisicion:         localDate(tz, new Date(row.adquirido_en as string)),
        eventId:                  row.consumption_id as string,
        comisionCompraEur:        comisionCompra,
        // Cómo se valoró la transmisión (#599); los dos lados, solo si fue por «el mayor».
        valoracion:               (row.valoracion as CriterioValor | null) ?? null,
        valorEntregadoEur:        row.valoracion === 'mayor' ? parseFloat(row.valor_entregado_eur as string) : null,
        valorRecibidoEur:         row.valoracion === 'mayor' ? parseFloat(row.valor_recibido_eur as string) : null,
        canal:                    canalDe(row.canal as string | null, row.tx_notes as string | null),
        // Binance Convert: la comisión va dentro del tipo de cambio y no se desglosa.
        esConvert:                canalDe(row.canal as string | null, row.tx_notes as string | null) === 'convert',
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
      t.id           AS tx_id,
      t.timestamp    AS fecha,
      t.operation_type,
      t.asset        AS activo,
      COALESCE(t.price_per_unit, 0) AS precio,
      t.amount_net   AS cantidad,
      t.amount_net * COALESCE(t.price_per_unit, 0) AS valor_eur,
      w.name         AS wallet
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    WHERE EXTRACT(YEAR FROM t.timestamp AT TIME ZONE $2) = $1
      AND t.operation_type = ANY($3)
    ORDER BY t.timestamp ASC
  `, [year, tz, OPS_RENTA_ESPECIE]);

  // Estado de las unidades recibidas (#544): una sola consulta para todo el año.
  const estados = await estadoDeRendimientos(rendRows.rows.map((r: Record<string, unknown>) => r.tx_id as string), tz);

  const rendimientos: Rendimiento[] = rendRows.rows.map((row: Record<string, unknown>) => ({
    fecha:    localDate(tz, new Date(row.fecha as string)),
    fechaHora: new Date(row.fecha as string).toISOString(),
    tipo:     getTipoRendimiento(row.operation_type as string),
    base:     baseDeRenta(row.operation_type as string),
    activo:   row.activo as string,
    cantidad: parseFloat(row.cantidad as string),
    valorEur: parseFloat(row.valor_eur as string),
    wallet:   row.wallet as string,
    txId:     row.tx_id as string,
    operacion: row.operation_type as string,
    precioEur: parseFloat(row.precio as string),
    estado:   estados.get(row.tx_id as string) ?? null,
  }));

  return { fiscalEvents, rendimientos };
}
