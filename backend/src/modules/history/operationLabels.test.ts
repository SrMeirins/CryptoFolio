import { describe, expect, it } from 'vitest';
import { DB_OPERATION_TYPES } from './operationGroups';
import { OPERATION_LABELS, displayOperationLabel, operationLabelRankSql } from './operationLabels';

describe('operationLabels (#349)', () => {
  it('hay una etiqueta para cada tipo de la BD', () => {
    expect(Object.keys(OPERATION_LABELS).sort()).toEqual([...DB_OPERATION_TYPES].sort());
  });

  it('el rango sigue el orden alfabético de las etiquetas en castellano', () => {
    const sql = operationLabelRankSql();
    const rank = (code: string) => Number(sql.match(new RegExp(`WHEN '${code}' THEN (\\d+)`))?.[1]);
    expect(rank('AIRDROP')).toBe(0);                                  // «Airdrop»
    expect(rank('FEE')).toBeLessThan(rank('BUY'));                    // «Comisión» < «Compra»
    expect(rank('DEPOSIT_FIAT')).toBeLessThan(rank('MARGIN_REPAY'));  // «Depósito EUR» < «Devolución margen»
    expect(rank('GIFT_SENT')).toBeLessThan(rank('WITHDRAW'));         // «Regalo» < «Retirada»
  });

  it('el SQL solo contiene códigos del enum y enteros, nunca las etiquetas', () => {
    const sql = operationLabelRankSql();
    for (const label of Object.values(OPERATION_LABELS)) expect(sql).not.toContain(label);
    expect(sql).toMatch(/^\(CASE t\.operation_type::text (WHEN '[A-Z_]+' THEN \d+ ?)+ END\)$/);
  });
});

// Mismos casos que opMetaOf en frontend/src/constants/operations.test.ts (#488).
describe('displayOperationLabel', () => {
  it('compra y venta con dinero mantienen su nombre', () => {
    expect(displayOperationLabel('BUY', 'AAA', 'EUR', null)).toBe('Compra');
    expect(displayOperationLabel('SELL', 'AAA', 'EUR', null)).toBe('Venta');
    expect(displayOperationLabel('SELL', 'AAA', 'USD', null)).toBe('Venta');
  });
  it('cripto por cripto o stablecoin es «Permuta», la registre el exchange como compra o como venta', () => {
    expect(displayOperationLabel('BUY', 'AAA', 'BBB', null)).toBe('Permuta');
    expect(displayOperationLabel('BUY', 'AAA', 'USDT', null)).toBe('Permuta');
    expect(displayOperationLabel('BUY_CRYPTO', 'AAA', 'BBB', null)).toBe('Permuta');
    expect(displayOperationLabel('SELL', 'AAA', 'USDC', null)).toBe('Permuta');
    expect(displayOperationLabel('SELL_CRYPTO', 'AAA', 'BBB', null)).toBe('Permuta');
  });
  it('comprar dinero entregando cripto es una «Venta»', () => {
    expect(displayOperationLabel('BUY', 'EUR', 'AAA', null)).toBe('Venta');
  });
  it('retiro a una wallet propia registrada: «Traspaso»; a Wallets externas o sin destino: «Retirada»', () => {
    expect(displayOperationLabel('WITHDRAW', 'AAA', null, 'Fría')).toBe('Traspaso');
    expect(displayOperationLabel('WITHDRAW', 'AAA', null, 'Wallets externas')).toBe('Retirada');
    expect(displayOperationLabel('WITHDRAW', 'AAA', null, null)).toBe('Retirada');
  });
  it('un tipo sin catálogo se muestra tal cual', () => {
    expect(displayOperationLabel('XYZ', 'AAA', null, null)).toBe('XYZ');
  });
});
