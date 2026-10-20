import type { RetiradaBinance } from './historialRetiradas';

// Emparejamiento retiro del historial de transacciones ↔ retirada del historial
// de retiradas de Binance (#320). Módulo puro.
//
// Regla (verificada con un export real: 100 % de emparejamientos únicos):
//  - mismo activo;
//  - |Change| del historial = Amount + Fee de la retirada (tolerancia 1e-8);
//  - el historial apunta el retiro entre 0 y 60 min DESPUÉS de la solicitud.
// La hora más cercana por sí sola empareja mal retiros del mismo activo
// cercanos en el tiempo; por eso el importe manda y la hora solo acota.

export interface RetiroAEmparejar {
  key: string;
  asset: string;
  amount: number;
  timestamp: Date;
}

const TOLERANCIA = 1e-8;
const VENTANA_MS = 60 * 60 * 1000;

/** Asignación uno a uno: cada retirada se usa como mucho una vez, primero los pares más próximos en el tiempo. */
export function emparejarRetiradas(retiros: RetiroAEmparejar[], retiradas: RetiradaBinance[]): Map<string, RetiradaBinance> {
  const candidatos: { key: string; idx: number; delta: number }[] = [];
  for (const r of retiros) {
    retiradas.forEach((w, idx) => {
      if (w.coin !== r.asset) return;
      if (Math.abs(w.bruto - r.amount) > TOLERANCIA) return;
      const delta = r.timestamp.getTime() - w.timestamp.getTime();
      if (delta < 0 || delta > VENTANA_MS) return;
      candidatos.push({ key: r.key, idx, delta });
    });
  }
  candidatos.sort((a, b) => a.delta - b.delta);
  const out = new Map<string, RetiradaBinance>();
  const usadas = new Set<number>();
  for (const c of candidatos) {
    if (out.has(c.key) || usadas.has(c.idx)) continue;
    out.set(c.key, retiradas[c.idx]);
    usadas.add(c.idx);
  }
  return out;
}
