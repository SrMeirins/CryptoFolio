import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

// Cliente HTTP (#369): errores con su código y respuestas 204 sin cuerpo.
describe('api client', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('un error conserva el mensaje y expone el código y el cuerpo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Ya existe', id: 'x' }), { status: 409 })))
    const err = await api.post('/v1/historial/vistas', {}).catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({ message: 'Ya existe', status: 409, body: { id: 'x' } })
  })

  it('un 204 sin cuerpo no falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(api.delete('/v1/historial/vistas/1')).resolves.toBeUndefined()
  })
})
