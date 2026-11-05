// Lógica pura de la tira de métricas (#490), aparte del componente.

/** Nombre accesible de una celda pulsable: «Ver <label> en <destination>». */
export function cellActionLabel(cell: { label: string; destination?: string }): string {
  return cell.destination ? `Ver ${cell.label} en ${cell.destination}` : `Ver ${cell.label}`
}
