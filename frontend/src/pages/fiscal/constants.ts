export const PNL_THRESHOLD = 0.005

// Los datos fiscales de años cerrados no cambian salvo recálculo manual del FIFO.
export const FISCAL_STALE_TIME = 5 * 60_000

export function pnlBg(val: number) {
  if (val > 0) return 'bg-accent-green/5 border-accent-green/20'
  if (val < 0) return 'bg-accent-red/5 border-accent-red/20'
  return 'bg-background-tertiary border-border'
}
