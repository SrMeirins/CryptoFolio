import type { CoberturaExchange } from './cobertura';

// Avisos de cobertura para la campana (#328). Módulo puro.
export const DIAS_AVISO_PENDIENTE = 60;
const NOMBRE = { binance: 'Binance', bitvavo: 'Bitvavo' } as const;

export interface AvisoCobertura { id: string; type: 'warning' | 'info'; category: string; message: string; count?: number }

export function avisosCobertura(coberturas: readonly CoberturaExchange[]): AvisoCobertura[] {
  const out: AvisoCobertura[] = [];
  for (const c of coberturas) {
    const p = c.pendiente;
    if (p && !p.revisionId && p.dias > DIAS_AVISO_PENDIENTE) {
      const meses = Math.round(p.dias / 30);
      out.push({
        id: `import-stale-${c.exchange}`, type: 'info', category: 'Importar',
        message: `${NOMBRE[c.exchange]}: sin importar desde hace ${meses} ${meses === 1 ? 'mes' : 'meses'}. Exporta el periodo pendiente para tener la cartera y la fiscalidad al día.`,
      });
    }
  }
  const huecos = coberturas.flatMap(c => c.huecos.filter(h => !h.revisionId).map(() => c.exchange));
  if (huecos.length > 0) {
    out.push({
      id: 'import-huecos', type: 'warning', category: 'Importar', count: huecos.length,
      message: `${huecos.length} ${huecos.length === 1 ? 'periodo' : 'periodos'} sin transacciones importadas entre exportaciones (${[...new Set(huecos)].map(e => NOMBRE[e]).join(', ')}). Revísalos en Importar › Cobertura.`,
    });
  }
  return out;
}
