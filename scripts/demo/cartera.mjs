// Cartera de demostración (versión 1.0): un CSV de Binance SINTÉTICO para las
// capturas del README y para probar la app sin datos reales. Determinista: la
// misma semilla (y la misma tabla de precios) da siempre el mismo fichero. El
// usuario y las cantidades son inventados. Los precios de compra y venta son
// los cierres públicos de mercado de cada día si se pasan en `precios` (los
// descarga scripts/demo/cargar.mjs), para que la rentabilidad sea creíble; sin
// tabla, unos aproximados inventados.

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function aleatorio(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Precio orientativo en EUR al inicio y amplitud de su oscilación. */
export const ACTIVOS = {
  BTC: { precio: 88000, oscila: 0.18, decimales: 6, peso: 0.4 },
  ETH: { precio: 3200, oscila: 0.25, decimales: 5, peso: 0.25 },
  SOL: { precio: 190, oscila: 0.3, decimales: 4, peso: 0.12 },
  ADA: { precio: 0.85, oscila: 0.3, decimales: 2, peso: 0.07 },
  XRP: { precio: 2.1, oscila: 0.3, decimales: 2, peso: 0.07 },
  LINK: { precio: 20, oscila: 0.3, decimales: 3, peso: 0.05 },
  DOT: { precio: 6.5, oscila: 0.3, decimales: 3, peso: 0.04 },
}

const CABECERA = 'User ID,Time,Account,Operation,Coin,Change,Remark'
const USUARIO = '10000001'

const dos = n => String(n).padStart(2, '0')
/** Fecha en el formato del historial de Binance: AA-MM-DD hh:mm:ss (UTC). */
export function fechaBinance(d) {
  return `${String(d.getUTCFullYear()).slice(2)}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`
}

/** Precio orientativo de un activo en el mes i (0 = primer mes): oscilación suave más ruido. */
export function precioMes(activo, i, rnd, precios, dia) {
  // Con tabla de cierres reales (de fecha AAAA-MM-DD a EUR), el del día o el último anterior.
  const tabla = precios?.[activo]
  if (tabla && dia) {
    const clave = new Date(dia).toISOString().slice(0, 10)
    const fechas = Object.keys(tabla).filter(f => f <= clave).sort()
    const f = fechas.at(-1)
    if (f) { rnd(); return tabla[f] }
  }
  const a = ACTIVOS[activo]
  const ciclo = Math.sin((i / 24) * Math.PI * 2 + activo.length)
  return a.precio * (1 + a.oscila * ciclo) * (0.95 + rnd() * 0.1)
}

/**
 * Filas del CSV, en orden cronológico: 46 meses desde enero de 2023, hasta
 * octubre de 2026 (sin operaciones en el futuro). Un periodo largo da ventas con
 * ganancia y con pérdida, como una cartera real.
 */
export function generarCartera({ semilla = 2026, meses = 46, inicio = Date.UTC(2023, 0, 1), precios = null } = {}) {
  const rnd = aleatorio(semilla)
  const filas = []
  const saldo = Object.fromEntries(Object.keys(ACTIVOS).map(k => [k, 0]))
  const fila = (t, cuenta, op, moneda, cambio) =>
    filas.push([USUARIO, fechaBinance(new Date(t)), cuenta, op, moneda, cambio, ''].join(','))

  for (let i = 0; i < meses; i++) {
    const mes = new Date(inicio)
    mes.setUTCMonth(mes.getUTCMonth() + i)
    const dia = (d, h, m = 0) => Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), d, h, m, 0)

    // Depósito mensual de euros desde el banco.
    const deposito = Math.round(400 + rnd() * 500)
    fila(dia(2, 9), 'Spot', 'Deposit', 'EUR', deposito.toFixed(2))

    // Compras periódicas repartidas por peso (DCA), con su comisión del 0,1 %.
    let hora = 10
    for (const [activo, a] of Object.entries(ACTIVOS)) {
      if (rnd() > 0.85) continue // algún mes no se compra ese activo
      const euros = Math.round(deposito * a.peso * (0.8 + rnd() * 0.3) * 100) / 100
      const t = dia(3 + (hora - 10), hora, 15)
      const precio = precioMes(activo, i, rnd, precios, t)
      const cantidad = Number((euros / precio).toFixed(a.decimales))
      if (cantidad <= 0) continue
      const comision = Number((cantidad * 0.001).toFixed(a.decimales + 2))
      fila(t, 'Spot', 'Transaction Spend', 'EUR', (-euros).toFixed(2))
      fila(t, 'Spot', 'Transaction Buy', activo, cantidad.toFixed(a.decimales))
      fila(t, 'Spot', 'Transaction Fee', activo, (-comision).toFixed(a.decimales + 2))
      saldo[activo] += cantidad - comision
      hora++
    }

    // Recompensas de staking mensuales (ETH, SOL y ADA).
    for (const activo of ['ETH', 'SOL', 'ADA']) {
      if (saldo[activo] <= 0) continue
      const recompensa = Number((saldo[activo] * (0.0025 + rnd() * 0.001)).toFixed(ACTIVOS[activo].decimales + 2))
      if (recompensa <= 0) continue
      fila(dia(28, 6), 'Spot', 'Staking Rewards', activo, recompensa.toFixed(ACTIVOS[activo].decimales + 2))
      saldo[activo] += recompensa
    }

    // Ventas parciales cada cuatro meses: una con ganancia probable y otra con pérdida probable.
    if (i > 3 && i % 4 === 0) {
      for (const [n, activo] of ['SOL', 'XRP'].entries()) {
        const a = ACTIVOS[activo]
        const cantidad = Number((saldo[activo] * 0.2).toFixed(a.decimales))
        if (cantidad <= 0) continue
        // Cada venta a su hora: Binance agrupa por segundo y el importador rechaza
        // dos activos vendidos en el mismo segundo.
        const t = dia(18, 17 + n, 30)
        const precio = precioMes(activo, i, rnd, precios, t)
        const euros = Math.round(cantidad * precio * 100) / 100
        const comision = Math.round(euros * 0.001 * 100) / 100
        fila(t, 'Spot', 'Transaction Sold', activo, (-cantidad).toFixed(a.decimales))
        fila(t, 'Spot', 'Transaction Revenue', 'EUR', euros.toFixed(2))
        fila(t, 'Spot', 'Transaction Fee', 'EUR', (-comision).toFixed(2))
        saldo[activo] -= cantidad
      }
    }

    // Una retirada al banco a mitad del periodo.
    if (i === 24) fila(dia(20, 12), 'Spot', 'Fiat Withdraw', 'EUR', '-750.00')
  }

  // En orden cronológico, como el historial de Binance. El orden es estable: las
  // filas de una misma operación (misma hora) siguen juntas y en su orden.
  const ordenadas = filas.map((f, i) => ({ f, i, t: f.split(',')[1] }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i))
    .map(x => x.f)
  return [CABECERA, ...ordenadas].join('\n') + '\n'
}
