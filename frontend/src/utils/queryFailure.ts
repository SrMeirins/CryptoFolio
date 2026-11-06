// Fallo de un grupo de consultas de un mismo panel (#498): el primer error y
// un «Reintentar» que repite solo las que fallaron.

export interface QueryLike {
  isError: boolean
  error: unknown
  refetch: () => unknown
}

export function failure(...qs: readonly QueryLike[]): { error: unknown; retry: () => void } | null {
  const failed = qs.filter(q => q.isError)
  if (failed.length === 0) return null
  return { error: failed[0].error, retry: () => { for (const q of failed) void q.refetch() } }
}
