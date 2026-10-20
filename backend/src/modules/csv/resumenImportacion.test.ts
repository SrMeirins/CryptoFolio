import { describe, expect, it } from 'vitest';
import { agruparAvisosFifo, impactoPorEjercicio } from './resumenImportacion';

// Resumen de la importación (#324). Datos sintéticos.
const W = '11111111-2222-3333-4444-555555555555';
const T = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('agruparAvisosFifo', () => {
  it('agrupa por tipo y activo, explica en lenguaje claro y no expone identificadores', () => {
    const avisos = agruparAvisosFifo(
      [
        `Lotes insuficientes para LUNC en wallet ${W} (tx ${T}): faltan 1.000000 de 2.000000 solicitados`,
        `Sin lotes abiertos para LUNC en wallet ${W} (tx ${T})`,
        `TRANSFER sin lotes suficientes para XRP tx=${T} (faltan 0.500000)`,
        `Tipo de operación no manejado: RARO (tx ${T})`,
      ],
      [`Aviso: lote sintético creado para USDT en wallet ${W} (tx ${T}, 2024-01-01T00:00:00.000Z) — sin lotes previos`],
    );
    expect(avisos[0]).toMatchObject({ tipo: 'sin_compras', activo: 'LUNC', veces: 2 });
    expect(avisos.map(a => a.tipo).sort()).toEqual(['lote_sintetico', 'otro', 'sin_compras', 'transferencia']);
    expect(JSON.stringify(avisos)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(avisos.find(a => a.tipo === 'otro')?.mensaje).toBe('Tipo de operación no manejado: RARO');
  });

  it('sin errores ni avisos, lista vacía', () => {
    expect(agruparAvisosFifo([], [])).toEqual([]);
  });
});

describe('impactoPorEjercicio', () => {
  it('solo los ejercicios que cambian, del más reciente al más antiguo', () => {
    const antes = [{ year: 2024, netoGP: 100, rendimientos: 0 }, { year: 2025, netoGP: -50, rendimientos: 0 }, { year: 2026, netoGP: 10, rendimientos: 0 }];
    const despues = [{ year: 2024, netoGP: 100.001, rendimientos: 0 }, { year: 2025, netoGP: 20, rendimientos: 0 }, { year: 2026, netoGP: 10, rendimientos: 0 }, { year: 2023, netoGP: 5, rendimientos: 0 }];
    expect(impactoPorEjercicio(antes, despues)).toEqual([{ year: 2025, antes: -50, despues: 20 }, { year: 2023, antes: 0, despues: 5 }]);
  });
});
