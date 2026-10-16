// Pares quitados a mano en Ajustes (#277): el relleno automático de pares no
// los vuelve a añadir. Función pura: compara los pares antes y después de
// guardar un activo.

export type EditableKind = 'eur' | 'usdt' | 'btc';
type Pairs = Partial<Record<EditableKind, string | null>>;

/**
 * Nueva lista de pares desactivados: un par que tenía valor y se deja vacío
 * se desactiva; un par que se rellena se reactiva. Los no editables (ETH) se
 * conservan.
 */
export function nextDisabledPairs(previousDisabled: readonly string[], before: Pairs, after: Pairs): string[] {
  const out = new Set(previousDisabled);
  for (const kind of ['eur', 'usdt', 'btc'] as const) {
    if (after[kind]) out.delete(kind);
    else if (before[kind]) out.add(kind);
  }
  return [...out].sort();
}
