// Diagnóstico de la verificación on-chain (#336): qué significa cada resultado,
// qué hacer y dónde. Módulo puro: lo usan la sección de Wallets y la campana.

export type TipoDiagnostico = 'ok' | 'discrepancia' | 'api_key' | 'contrato' | 'sin_proveedor' | 'red';

export interface Diagnostico {
  tipo: TipoDiagnostico;
  /** «aviso» y «error» se notifican; «info» (red sin verificación) no. */
  nivel: 'ok' | 'aviso' | 'error' | 'info';
  mensaje: string;
  accion: string | null;
  enlace: string | null;
}

export interface ResultadoVerificacion {
  asset: string;
  status: 'ok' | 'discrepancy' | 'error';
  error: string | null;
  onchain: number | null;
  expected: number;
  network: string | null;
}

const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 8 });
const AJUSTES_WALLETS = '/settings?tab=wallets';

export function diagnosticar(r: ResultadoVerificacion): Diagnostico {
  const red = r.network ?? 'esta red';
  if (r.status === 'ok') {
    return { tipo: 'ok', nivel: 'ok', mensaje: `${r.asset}: el saldo en la cadena coincide con el de la app.`, accion: null, enlace: null };
  }
  if (r.status === 'discrepancy') {
    return {
      tipo: 'discrepancia', nivel: 'aviso',
      mensaje: r.onchain === null
        ? `${r.asset}: hay saldo en la cadena que la app no espera.`
        : `${r.asset}: en la cadena hay ${num(r.onchain)} y la app espera ${num(r.expected)}.`,
      accion: 'Puede faltar un retiro, un depósito o una comisión por importar. Revisa la cobertura en Importar.',
      enlace: '/import',
    };
  }
  const e = (r.error ?? '').toLowerCase();
  if (e.includes('api key')) {
    return {
      tipo: 'api_key', nivel: 'error', mensaje: `Falta la API key de ${red} para consultar el saldo.`,
      accion: `Añádela en Ajustes › Wallets, en la red ${red}.`, enlace: AJUSTES_WALLETS,
    };
  }
  if (e.includes('contract_address')) {
    return {
      tipo: 'contrato', nivel: 'error', mensaje: `Falta el contrato del token ${r.asset} en ${red}.`,
      accion: `Configúralo en Ajustes › Wallets, en los tokens de ${red}.`, enlace: AJUSTES_WALLETS,
    };
  }
  if (e.includes('sin proveedor')) {
    return { tipo: 'sin_proveedor', nivel: 'info', mensaje: `La verificación on-chain no está disponible para ${red}.`, accion: null, enlace: null };
  }
  return {
    tipo: 'red', nivel: 'error', mensaje: `No se pudo consultar el explorador de ${red}.`,
    accion: 'Se reintentará automáticamente; también puedes pulsar «Verificar ahora».', enlace: null,
  };
}
