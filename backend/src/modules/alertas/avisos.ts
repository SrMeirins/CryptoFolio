import type { SystemNotification } from '../notifications/collect';
import type { Alerta } from './alertasRepo';

// Avisos de la campana para las alertas disparadas (#519): uno por alerta con
// su último disparo, en la categoría «Alertas» (silenciable). El mensaje
// incluye la hora del disparo, así que un disparo nuevo vuelve a aparecer
// aunque se hubiera descartado el anterior (la huella del aviso cambia).

const SIMBOLO = { EUR: '€', USD: '$' } as const;

function precioTexto(n: number, moneda: 'EUR' | 'USD'): string {
  const digitos = n >= 1 ? 2 : 6;
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: digitos, minimumFractionDigits: n >= 1 ? 2 : 0 }).format(n)} ${SIMBOLO[moneda]}`;
}

function cuando(d: Date, tz: string): string {
  const dia = new Intl.DateTimeFormat('es-ES', { timeZone: tz, day: 'numeric', month: 'short' }).format(d).replace('.', '');
  const hora = new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return `el ${dia} a las ${hora}`;
}

export function avisosAlertas(alertas: readonly Alerta[], tz: string): SystemNotification[] {
  const out: SystemNotification[] = [];
  for (const a of alertas) {
    if (!a.ultimo_disparo_at || a.ultimo_valor === null) continue;
    if (a.tipo === 'precio' && a.activo && a.precio !== null) {
      const verbo = a.sentido === 'por_encima' ? 'ha subido por encima de' : 'ha bajado por debajo de';
      out.push({
        id: `alerta-${a.id}`, type: 'info', category: 'Alertas',
        message: `${a.activo} ${verbo} ${precioTexto(a.precio, a.moneda)} (${precioTexto(a.ultimo_valor, a.moneda)}) ${cuando(a.ultimo_disparo_at, tz)}.`,
      });
    } else if (a.tipo === 'cartera') {
      const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(a.ultimo_valor));
      out.push({
        id: `alerta-${a.id}`, type: a.ultimo_valor < 0 ? 'warning' : 'info', category: 'Alertas',
        message: `Tu cartera ha ${a.ultimo_valor < 0 ? 'bajado' : 'subido'} un ${pct} % en 24 h (${cuando(a.ultimo_disparo_at, tz)}).`,
      });
    }
  }
  return out;
}
