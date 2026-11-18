// Reducir una serie para dibujarla (#510): con miles de puntos, Recharts
// repinta despacio y el zoom va a trompicones. Se agrupan los puntos en
// tramos y de cada uno se conservan el mínimo y el máximo (la forma de la
// curva no cambia a la vista), además del primero, el último y los marcados
// (p. ej. días con depósitos o sin posiciones). Solo para dibujar: las
// métricas se calculan con todos los puntos.

export function reducirPuntos<T>(puntos: readonly T[], max: number, valor: (p: T) => number | null, conservar: (p: T) => boolean = () => false): T[] {
  if (puntos.length <= max) return [...puntos]
  const tramos = Math.max(1, Math.floor(max / 2))
  const paso = puntos.length / tramos
  const elegidos = new Set<number>([0, puntos.length - 1])
  for (let t = 0; t < tramos; t++) {
    const a = Math.floor(t * paso)
    const b = Math.min(puntos.length, Math.floor((t + 1) * paso))
    let iMin = -1, iMax = -1
    for (let i = a; i < b; i++) {
      const v = valor(puntos[i])
      if (v === null) continue
      if (iMin === -1 || v < (valor(puntos[iMin]) as number)) iMin = i
      if (iMax === -1 || v > (valor(puntos[iMax]) as number)) iMax = i
    }
    if (iMin !== -1) elegidos.add(iMin)
    if (iMax !== -1) elegidos.add(iMax)
    if (iMin === -1) elegidos.add(a)
  }
  puntos.forEach((p, i) => { if (conservar(p)) elegidos.add(i) })
  return [...elegidos].sort((x, y) => x - y).map(i => puntos[i])
}
