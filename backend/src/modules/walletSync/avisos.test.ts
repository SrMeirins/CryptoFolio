import { describe, expect, it } from 'vitest';
import { avisosVerificacion, type FilaVerificacion } from './avisos';

// Avisos de la verificación on-chain (#336). Datos sintéticos.
const fila = (over: Partial<FilaVerificacion>): FilaVerificacion =>
  ({ asset: 'XRP', status: 'ok', error: null, onchain_balance: 10, expected_balance: 10, wallet: 'Ledger', red: 'XRP Ledger', ...over });

describe('avisosVerificacion', () => {
  it('todo verificado o sin verificación disponible: sin avisos', () => {
    expect(avisosVerificacion([fila({}), fila({ status: 'error', error: 'sin proveedor registrado para esta red' })])).toEqual([]);
  });

  it('separa discrepancias (aviso) de fallos (con el paso a seguir)', () => {
    const avisos = avisosVerificacion([
      fila({ status: 'discrepancy', onchain_balance: 10.2 }),
      fila({ asset: 'LINK', status: 'error', error: 'falta API key para Ethereum', red: 'Ethereum' }),
    ]);
    expect(avisos.map(a => [a.id, a.type, a.count])).toEqual([['wallet-discrepancia', 'warning', 1], ['wallet-verificacion', 'info', 1]]);
    expect(avisos[0].message).toContain('Ledger · XRP: en la cadena hay 10,2 y la app espera 10.');
    expect(avisos[1].message).toContain('Añádela en Ajustes › Wallets, en la red Ethereum.');
  });
});
