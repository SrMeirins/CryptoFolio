export const PNL_THRESHOLD = 0.005

// Los datos fiscales de años cerrados no cambian salvo recálculo manual del FIFO.
export const FISCAL_STALE_TIME = 5 * 60_000

export function pnlBg(val: number) {
  if (val > 0) return 'bg-positive/5 border-positive/20'
  if (val < 0) return 'bg-negative/5 border-negative/20'
  return 'bg-background-tertiary border-border'
}
