import { describe, expect, it } from 'vitest';
import { DB_OPERATION_TYPES } from './operationGroups';
import { OPERATION_LABELS, operationLabelRankSql } from './operationLabels';

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
