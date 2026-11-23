import { cambioCartera, decidirCartera, decidirPrecio, enMoneda } from './evaluacion';
import type { Alerta } from './alertasRepo';

// Evaluador de alertas (#519): escucha los precios en vivo que ya recibe el
// backend (sin peticiones extra) y, con cada cambio, revisa las alertas de
// precio de los activos que han cambiado (o todas las de USD si cambia el
// USDT). La de cartera se revisa cada minuto con las cantidades abiertas y
// los precios de hace 24 h. Las dependencias se inyectan para probarlo con
// precios sintéticos.

export interface FuentePrecios {
  /** Precio en vivo en EUR; null si no hay. */
  precio(symbol: string): number | null
  todos(): ReadonlyMap<string, number>
  hace24(): ReadonlyMap<string, number>
}

export interface AlmacenAlertas {
  listar(): Promise<Alerta[]>
  registrarDisparo(id: string, valor: number): Promise<boolean>
  rearmar(id: string): Promise<void>
  cantidades(): Promise<Map<string, number>>
}

export interface Evaluador {
  /** Vuelve a leer las alertas (tras crear, editar o borrar). */
  recargar(): Promise<void>
  /** Evalúa con los activos que han cambiado de precio. */
  alCambiarPrecios(cambiados: Iterable<string>): Promise<void>
  /** Evalúa la alerta de cartera. */
  revisarCartera(ahora?: Date): Promise<void>
}

const CANTIDADES_TTL_MS = 5 * 60_000;

export function crearEvaluador(precios: FuentePrecios, almacen: AlmacenAlertas, log: (m: string) => void = () => {}): Evaluador {
  let alertas: Alerta[] = [];
  let cantidades: { valor: Map<string, number>; at: number } | null = null;
  // Las evaluaciones van en cola: dos cambios seguidos no disparan la misma alerta dos veces.
  let cola: Promise<void> = Promise.resolve();
  const enCola = (f: () => Promise<void>) => { cola = cola.then(f).catch(e => log(`error evaluando alertas: ${String(e)}`)); return cola; };

  async function recargar() { alertas = await almacen.listar(); }

  async function evaluarPrecio(a: Alerta) {
    if (a.tipo !== 'precio' || !a.activa || !a.activo || a.precio === null || !a.sentido) return;
    const precio = enMoneda(precios.precio(a.activo), a.moneda, precios.precio('USDT'));
    if (precio === null) return;
    const d = decidirPrecio({ sentido: a.sentido, precio: a.precio, repeticion: a.repeticion, armada: a.armada }, precio);
    if (d.accion === 'disparar') {
      if (await almacen.registrarDisparo(a.id, precio)) {
        a.armada = false
        a.ultimo_disparo_at = new Date()
        a.ultimo_valor = precio
        if (a.repeticion === 'una_vez') a.activa = false
      }
    } else if (d.accion === 'rearmar') {
      await almacen.rearmar(a.id)
      a.armada = true
    }
  }

  return {
    recargar: () => enCola(recargar),
    alCambiarPrecios: (cambiados) => enCola(async () => {
      const set = new Set(cambiados);
      for (const a of alertas) {
        if (a.tipo === 'precio' && a.activo && (set.has(a.activo) || (a.moneda === 'USD' && set.has('USDT')))) await evaluarPrecio(a);
      }
    }),
    revisarCartera: (ahora = new Date()) => enCola(async () => {
      const a = alertas.find(x => x.tipo === 'cartera' && x.activa);
      if (!a || a.umbral_pct === null) return;
      if (!cantidades || ahora.getTime() - cantidades.at > CANTIDADES_TTL_MS) cantidades = { valor: await almacen.cantidades(), at: ahora.getTime() };
      const cambio = cambioCartera(cantidades.valor, precios.todos(), precios.hace24());
      if (!decidirCartera(a.umbral_pct, cambio, a.ultimo_disparo_at, ahora) || cambio === null) return;
      if (await almacen.registrarDisparo(a.id, cambio)) {
        a.ultimo_disparo_at = ahora
        a.ultimo_valor = cambio
      }
    }),
  };
}
