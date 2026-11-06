import { describe, expect, it, vi } from 'vitest'
import { failure } from './queryFailure'

// Fallo de un grupo de consultas (#498).
describe('failure (#498)', () => {
  const ok = () => ({ isError: false, error: null, refetch: vi.fn() })
  const ko = (e: unknown) => ({ isError: true, error: e, refetch: vi.fn() })

  it('sin errores devuelve null', () => {
    expect(failure(ok(), ok())).toBeNull()
  })

  it('devuelve el primer error y reintenta solo las que fallaron', () => {
    const a = ok(); const b = ko('b'); const c = ko('c')
    const f = failure(a, b, c)!
    expect(f.error).toBe('b')
    f.retry()
    expect(a.refetch).not.toHaveBeenCalled()
    expect(b.refetch).toHaveBeenCalledOnce()
    expect(c.refetch).toHaveBeenCalledOnce()
  })
})
