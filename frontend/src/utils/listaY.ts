// Enumeración en castellano (#527): «A», «A y B», «A, B y C».
export function listaY(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}
