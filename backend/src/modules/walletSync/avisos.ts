import { diagnosticar, type Diagnostico } from './diagnostico';

// Avisos de la verificación on-chain para la campana (#336). Módulo puro.

export interface FilaVerificacion {
  asset: string; status: 'ok' | 'discrepancy' | 'error'; error: string | null;
  onchain_balance: string | number | null; expected_balance: string | number; wallet: string; red: string | null;
}

export interface AvisoVerificacion { id: string; type: 'warning' | 'info'; category: string; message: string; count: number }

const lista = (xs: { f: FilaVerificacion; d: Diagnostico }[]) =>
  xs.slice(0, 3).map(({ f, d }) => `${f.wallet} · ${d.mensaje}`).join(' ') + (xs.length > 3 ? ` (y ${xs.length - 3} más)` : '');

export function avisosVerificacion(filas: readonly FilaVerificacion[]): AvisoVerificacion[] {
  const diag = filas.map(f => ({
    f,
    d: diagnosticar({
      asset: f.asset, status: f.status, error: f.error, network: f.red,
      onchain: f.onchain_balance === null ? null : Number(f.onchain_balance), expected: Number(f.expected_balance),
    }),
  }));
  const out: AvisoVerificacion[] = [];
  const discrepancias = diag.filter(x => x.d.tipo === 'discrepancia');
  if (discrepancias.length > 0) {
    out.push({
      id: 'wallet-discrepancia', type: 'warning', category: 'Wallets', count: discrepancias.length,
      message: `${lista(discrepancias)} Puede faltar un retiro, un depósito o una comisión por importar.`,
    });
  }
  const fallos = diag.filter(x => x.d.nivel === 'error');
  if (fallos.length > 0) {
    const pasos = [...new Set(fallos.map(x => x.d.accion).filter(Boolean))].slice(0, 2).join(' ');
    out.push({
      id: 'wallet-verificacion', type: 'info', category: 'Wallets', count: fallos.length,
      message: `No se pudo verificar: ${lista(fallos)} ${pasos}`.trim(),
    });
  }
  return out;
}
