import { describe, expect, it } from 'vitest';
import { diagnosticar } from './diagnostico';

// Diagnóstico de la verificación on-chain (#336). Datos sintéticos.
const base = { asset: 'XRP', onchain: null, expected: 10, network: 'XRP Ledger' } as const;

describe('diagnosticar', () => {
  it('coincide, discrepancia con cifras y qué revisar', () => {
    expect(diagnosticar({ ...base, status: 'ok', error: null, onchain: 10 }).nivel).toBe('ok');
    const d = diagnosticar({ ...base, status: 'discrepancy', error: null, onchain: 10.2 });
    expect(d).toMatchObject({ tipo: 'discrepancia', nivel: 'aviso', enlace: '/import' });
    expect(d.mensaje).toBe('XRP: en la cadena hay 10,2 y la app espera 10.');
  });

  it('clasifica los errores con el paso a seguir', () => {
    expect(diagnosticar({ ...base, network: 'Ethereum', status: 'error', error: 'falta API key para Ethereum' }))
      .toMatchObject({ tipo: 'api_key', nivel: 'error', enlace: '/settings?tab=wallets', accion: 'Añádela en Ajustes › Wallets, en la red Ethereum.' });
    expect(diagnosticar({ ...base, status: 'error', error: 'sin contract_address configurado para este token — no se puede verificar' }).tipo).toBe('contrato');
    expect(diagnosticar({ ...base, status: 'error', error: 'sin proveedor registrado para esta red' })).toMatchObject({ tipo: 'sin_proveedor', nivel: 'info' });
    expect(diagnosticar({ ...base, status: 'error', error: 'HTTP 503' })).toMatchObject({ tipo: 'red', nivel: 'error' });
    expect(diagnosticar({ ...base, status: 'error', error: null }).tipo).toBe('red');
  });
});
