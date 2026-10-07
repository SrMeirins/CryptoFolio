const BASE = '/api'

// Timeout explícito en toda petición de este cliente: sin esto, un backend
// colgado (o un proxy de red que no cierra la conexión) deja la UI en
// "cargando" para siempre sin ningún error visible. 30s es generoso para un
// backend local/Docker. El único flujo realmente largo de la app (import de
// CSV, que puede tardar varios minutos con backoff de CoinGecko) no usa este
// cliente — llama a fetch directamente (ver pages/Import.tsx) precisamente
// para no estar sujeto a este límite.
const REQUEST_TIMEOUT_MS = 30_000

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (${REQUEST_TIMEOUT_MS / 1000}s) al llamar a ${path}`, { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
}

