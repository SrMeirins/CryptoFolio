import { describe, expect, it } from 'vitest';
import { HISTORY_CSV_HEADER, HistoryCsvRow, historyCsvFilename, historyCsvLine, isoLocal, money, plainNumber } from './csvFormat';

const TZ = 'Europe/Madrid';

describe('csvFormat (#349)', () => {
  it('isoLocal: hora local con su desfase en invierno, verano y UTC', () => {
    expect(isoLocal(new Date('2024-03-10T23:30:00Z'), TZ)).toBe('2024-03-11T00:30:00+01:00');
    expect(isoLocal(new Date('2026-09-03T15:11:05Z'), TZ)).toBe('2026-09-03T17:11:05+02:00');
    expect(isoLocal(new Date('2026-09-03T15:11:05Z'), 'UTC')).toBe('2026-09-03T15:11:05+00:00');
  });

  it('plainNumber quita los ceros sobrantes de NUMERIC; money usa dos decimales con punto', () => {
    expect(plainNumber('601.779800000000000000')).toBe('601.7798');
    expect(plainNumber('100.000000000000000000')).toBe('100');
    expect(plainNumber('10')).toBe('10');
    expect(plainNumber(null)).toBe('');
    expect(money(56)).toBe('56.00');
    expect(money(null)).toBe('');
  });

  const row: HistoryCsvRow = {
    id: '00000000-0000-0000-0000-000000000001', timestamp: new Date('2026-01-15T10:30:00Z'),
    operation_type: 'BUY', asset: 'ETH', amount_net: '2.000000000000000000',
    cost_amount: '0.5', cost_asset: 'BTC', price_per_unit: '0.25', fee_amount: '0.01', fee_asset: 'BNB',
    value_eur: 56, fee_value_eur: 4, value_source: 'fifo', usd_per_eur: '1.1',
    wallet_name: 'Exchange', destination_wallet_name: null, account: 'Spot', manually_added: false,
    notes: null, import_filename: 'export.csv', tx_hash: null, fee_parent_id: null,
  };

  it('una línea por fila con tantas columnas como la cabecera', () => {
    const line = historyCsvLine(row, TZ);
    expect(line.split(';')).toHaveLength(HISTORY_CSV_HEADER.split(';').length);
    expect(line).toBe('2026-01-15T11:30:00+01:00;BUY;ETH;2;0.5;BTC;0.25;0.01;BNB;56.00;4.00;61.60;4.40;fifo;Exchange;;Spot;No;;00000000-0000-0000-0000-000000000001;export.csv;;');
  });

  it('sin tipo de cambio, las columnas USD quedan vacías (nunca euros como dólares)', () => {
    const cols = historyCsvLine({ ...row, usd_per_eur: null }, TZ).split(';');
    expect(cols[11]).toBe('');
    expect(cols[12]).toBe('');
  });

  it('neutraliza fórmulas y cita los campos con separador, comillas o saltos de línea', () => {
    const line = historyCsvLine({
      ...row, notes: '=HYPERLINK("http://x")', wallet_name: '+cmd', account: 'a;b', import_filename: '@SUM(1)\nx', tx_hash: '-1',
    }, TZ);
    expect(line).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(line).toContain(";'+cmd;");
    expect(line).toContain(';"a;b";');
    expect(line).toContain(`"'@SUM(1)\nx"`);
    expect(line.split(';').at(-2)).toBe("'-1");
  });

  it('el nombre del archivo lleva solo la fecha local y el sufijo de filtrado', () => {
    // 23:30Z del 31/12 ya es 1 de enero en Madrid.
    expect(historyCsvFilename(new Date('2025-12-31T23:30:00Z'), TZ, false)).toBe('historial_2026-01-01.csv');
    expect(historyCsvFilename(new Date('2026-05-01T10:00:00Z'), TZ, true)).toBe('historial_2026-05-01_filtrado.csv');
  });
});

describe('columna «Operación asociada» (#371)', () => {
  it('lleva el ID de la operación de una comisión agrupable; vacía en el resto', () => {
    const fee: HistoryCsvRow = {
      id: '00000000-0000-0000-0000-000000000002', timestamp: new Date('2026-01-15T10:30:00Z'),
      operation_type: 'FEE_EXCHANGE', asset: 'BNB', amount_net: '0.01', cost_amount: null, cost_asset: null,
      price_per_unit: null, fee_amount: '0.01', fee_asset: 'BNB', value_eur: 5, fee_value_eur: null,
      value_source: 'fifo', usd_per_eur: null, wallet_name: 'Exchange', destination_wallet_name: null,
      account: 'Spot', manually_added: false, notes: null, import_filename: null, tx_hash: null,
      fee_parent_id: '00000000-0000-0000-0000-0000000000aa',
    };
    expect(historyCsvLine(fee, TZ).split(';').at(-1)).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(historyCsvLine({ ...fee, fee_parent_id: null }, TZ).split(';').at(-1)).toBe('');
  });
});
