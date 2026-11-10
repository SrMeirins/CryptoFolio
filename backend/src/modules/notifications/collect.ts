import { db } from '../../db/client';
import { avisoCalendario } from '../fiscal/calendarioFiscal';
import { obligaciones721 } from '../fiscal/obligacion721';
import { cifrasRenta, listarDeclaraciones, presentadas } from '../fiscal/declaracionesRepo';
import { compararCifras, type CifrasRenta } from '../fiscal/declaraciones';
import { getAppTimezone } from '../time/appTimezone';
import { coberturaActual } from '../csv/coberturaDb';
import { avisosCobertura } from '../csv/coberturaAvisos';
import { avisosVerificacion } from '../walletSync/avisos';
import { getLivePrice } from '../prices/liveFeed';
import { avisosCopias } from '../backup/autoBackupNotices';

// Avisos del sistema (#447): se reúnen aquí y la ruta solo los filtra según las
// preferencias (categorías silenciadas y avisos descartados) y los devuelve.

export interface SystemNotification {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  count?: number;
}

export async function collectNotifications(): Promise<SystemNotification[]> {
  const notifications: SystemNotification[] = [];

  // 1. Activos sin precio: sin fuente configurada, o en cartera sin precio en vivo
  //    de ninguna fuente aunque la tengan (p. ej. par retirado) (#337).
  const candidatosRes = await db.query(
    `SELECT am.symbol, am.price_source,
            EXISTS (SELECT 1 FROM fifo_lots fl WHERE fl.asset = am.symbol AND NOT fl.is_closed) AS en_cartera
     FROM asset_metadata am
     WHERE am.is_stablecoin = FALSE AND am.price_source <> 'fiat'
     ORDER BY am.symbol`
  );
  const sinPrecio = (candidatosRes.rows as { symbol: string; price_source: string; en_cartera: boolean }[])
    .filter(r => r.price_source === 'unknown' || (r.en_cartera && getLivePrice(r.symbol) === null))
    .map(r => r.symbol);
  if (sinPrecio.length > 0) {
    notifications.push({
      id: 'no-price',
      type: 'warning',
      category: 'Precios',
      message: `${sinPrecio.length} activo${sinPrecio.length > 1 ? 's' : ''} sin precio: ${sinPrecio.join(', ')}. Revísalos en Ajustes › Activos con el filtro «Sin precio».`,
      count: sinPrecio.length,
    });
  }

  // 2. Retiros sin wallet destino asignada (solo WITHDRAWs reales; otros types con el flag son datos corruptos)
  const pendingRes = await db.query(
    `SELECT asset, COUNT(*) as cnt FROM transactions
     WHERE destination_pending = TRUE AND operation_type = 'WITHDRAW'
     GROUP BY asset ORDER BY asset`
  );
  if (pendingRes.rows.length > 0) {
    const total = pendingRes.rows.reduce((s: number, r: {cnt: string}) => s + parseInt(r.cnt), 0);
    const assets = pendingRes.rows.map((r: {asset: string}) => r.asset).join(', ');
    notifications.push({
      id: 'pending-withdrawals',
      type: 'warning',
      category: 'Retiros',
      message: `${total} retiro${total > 1 ? 's' : ''} sin wallet destino asignada (${assets}). Ve a Historial para asignarlos.`,
      count: total,
    });
  }

  // 3. Depósitos de cripto externo sin coste de adquisición — bloquean el FIFO
  const cryptoDepositRes = await db.query(
    `SELECT COUNT(*) AS cnt FROM transactions
     WHERE notes LIKE '%Depósito de cripto externo%'
       AND price_per_unit IS NULL`
  );
  const cryptoDepositCount = parseInt(cryptoDepositRes.rows[0].cnt);
  if (cryptoDepositCount > 0) {
    notifications.push({
      id: 'crypto-deposits',
      type: 'warning',
      category: 'Depósitos',
      message: `${cryptoDepositCount} depósito${cryptoDepositCount > 1 ? 's' : ''} de cripto externo sin coste de adquisición. Revísalos en Importación antes de importar nuevos datos.`,
      count: cryptoDepositCount,
    });
  }

  // 4. Lotes FIFO con activo sin precio (no se puede valorar el portfolio)
  const noLotPriceRes = await db.query(
    `SELECT DISTINCT fl.asset
     FROM fifo_lots fl
     LEFT JOIN asset_metadata am ON am.symbol = fl.asset
     WHERE fl.is_closed = FALSE
       AND fl.quantity_remaining > 0
       AND (am.price_source = 'unknown' OR am.symbol IS NULL)
       AND (am.is_stablecoin = FALSE OR am.symbol IS NULL)
     ORDER BY fl.asset`
  );
  if (noLotPriceRes.rows.length > 0) {
    const assets = noLotPriceRes.rows.map((r: {asset: string}) => r.asset).join(', ');
    notifications.push({
      id: 'lots-no-price',
      type: 'error',
      category: 'Portfolio',
      message: `Activos en cartera sin precio de mercado: ${assets}. El valor del portfolio puede estar incompleto.`,
      count: noLotPriceRes.rows.length,
    });
  }

  // Recordatorio del calendario fiscal (#309): a 30 días del próximo hito, información; a 7, aviso.
  // Sin la obligación del 721 (p. ej. si falla la valoración) el aviso no se pierde: se asume desconocida.
  const obligado = await obligaciones721().catch(() => () => null);
  // Lo ya presentado no se recuerda (#542).
  const yaPresentada = await presentadas().catch(() => () => false);
  const avisoFiscal = avisoCalendario(new Date(), obligado, await getAppTimezone(db), yaPresentada);
  if (avisoFiscal) {
    notifications.push({ id: 'fiscal-calendar', type: avisoFiscal.type, category: 'Fiscal', message: avisoFiscal.message });
  }

  // Renta presentada cuyas cifras han cambiado después (#542): puede hacer falta una complementaria.
  const rentas = (await listarDeclaraciones().catch(() => [])).filter(d => d.tipo === 'renta');
  for (const d of rentas) {
    const cambios = compararCifras(d.cifras as Partial<CifrasRenta>, await cifrasRenta(d.ejercicio));
    if (cambios.length > 0) {
      notifications.push({
        id: `renta-cambios-${d.ejercicio}`, type: 'warning', category: 'Fiscal',
        message: `Las cifras de la Renta de ${d.ejercicio} han cambiado desde que la presentaste (${cambios.length} ${cambios.length === 1 ? 'concepto' : 'conceptos'}). Revisa si hace falta una complementaria.`,
      });
    }
  }

  // Verificación on-chain de las direcciones (#336): última comprobación de cada activo.
  const verif = await db.query(
    `SELECT DISTINCT ON (bsl.wallet_address_id, bsl.asset)
            bsl.asset, bsl.status, bsl.error, bsl.onchain_balance, bsl.expected_balance,
            w.name AS wallet, COALESCE(n.name, wa.custom_network) AS red
     FROM balance_sync_log bsl
     JOIN wallet_addresses wa ON wa.id = bsl.wallet_address_id
     JOIN wallets w ON w.id = wa.wallet_id
     LEFT JOIN networks n ON n.id = wa.network_id
     ORDER BY bsl.wallet_address_id, bsl.asset, bsl.checked_at DESC`,
  );
  notifications.push(...avisosVerificacion(verif.rows));

  // Cobertura de importaciones (#328): exchanges sin importar hace más de 60 días y huecos sin revisar.
  const { despues: coberturas } = await coberturaActual();
  notifications.push(...avisosCobertura(coberturas));

  // Copias automáticas (#454): la última falló, o no se pueden hacer.
  notifications.push(...await avisosCopias());

  return notifications;
}
