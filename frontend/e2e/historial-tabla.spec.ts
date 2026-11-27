import { expect, test, type Page } from './base'
import { abrirOpcionesVista } from './historyHelpers'
import { makeTx } from '../src/test/fixtures/transaction'

// Tabla legible del Historial (#554): anchos fijos al paginar, total por día
// que coincide con las filas, y densidad y columnas que se guardan y sobreviven
// a la recarga. El listado se simula con datos sintéticos propios (más filas
// que una página), para no depender del volumen del backend. Las preferencias son globales: se restauran al terminar.

test.describe.configure({ mode: 'serial' })

const CLAVES = ['historial_densidad', 'historial_columnas']
let previas: Record<string, string | undefined> = {}

test.beforeAll(async ({ request }) => {
  const config = (await (await request.get('/api/settings/config')).json()) as Record<string, string>
  previas = Object.fromEntries(CLAVES.map(k => [k, config[k]]))
})

test.afterAll(async ({ request }) => {
  const defecto: Record<string, string> = { historial_densidad: 'comoda', historial_columnas: '["cantidad","valor","fee","wallet"]' }
  for (const k of CLAVES) await request.put('/api/settings/config', { data: { key: k, value: previas[k] ?? defecto[k] } })
})

const PAGE_SIZE = 50
const DIA_MS = 24 * 3600_000
// 160 operaciones sintéticas, 4 por día, de más reciente a más antigua; BTC y ETH alternados.
const OPERACIONES = Array.from({ length: 160 }, (_, i) => makeTx({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  operation_type: 'BUY', asset: i % 2 ? 'ETH' : 'BTC', cost_asset: 'EUR', amount: '1', amount_net: '1',
  timestamp: new Date(Date.UTC(2026, 5, 30, 12 - (i % 4) * 2) - Math.floor(i / 4) * DIA_MS).toISOString(),
  value_eur: 10 + (i % 7) * 3.25, value_source: 'fifo', usd_per_eur: 1.1,
}))

/** Sirve el listado paginado y filtrado por texto desde OPERACIONES; el resto de rutas va al backend. */
async function simularListado(page: Page) {
  await page.route(url => url.pathname === '/api/transactions', async route => {
    const q = new URL(route.request().url()).searchParams
    const buscar = (q.get('search') ?? '').toLowerCase()
    const filtradas = OPERACIONES.filter(t => !buscar || t.asset.toLowerCase().includes(buscar))
    const offset = Number(q.get('offset') ?? 0)
    const limit = Number(q.get('limit') ?? PAGE_SIZE)
    await route.fulfill({ json: {
      transactions: filtradas.slice(offset, offset + limit), total: filtradas.length,
      flows: { EUR: { entradas: 0, salidas: 0 }, USD: { entradas: 0, salidas: 0 } },
      currency: q.get('currency') ?? 'EUR', grouped_fees: true, limit, offset,
    } })
  })
}

async function abrir(page: Page) {
  await simularListado(page)
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
}

async function anchos(page: Page): Promise<number[]> {
  return page.locator('table thead th').evaluateAll(ths => ths.map(th => Math.round(th.getBoundingClientRect().width)))
}

test('las columnas no cambian de ancho al paginar ni al filtrar', async ({ page }) => {
  await abrir(page)
  const antes = await anchos(page)
  await page.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(page.getByLabel('Página 2', { exact: false })).toBeVisible()
  expect(await anchos(page)).toEqual(antes)
  await page.getByRole('button', { name: 'Página anterior' }).click()
  await page.getByPlaceholder(/Buscar activo/).fill('BTC')
  await expect(page.getByRole('table')).toBeVisible()
  await expect.poll(() => anchos(page)).toEqual(antes)
})

test('el total de cada día es la suma de los valores de sus filas', async ({ page }) => {
  await abrir(page)
  const num = (t: string) => { const m = t.replace(/\u00a0/g, ' ').match(/(-?[\d.]+,\d{2})/); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : 0 }
  // Posición de la columna «Valor» y filas por grupo, sin depender de las columnas elegidas.
  const grupos = await page.locator('table').evaluate(tabla => {
    const col = [...tabla.querySelectorAll('thead th')].findIndex(th => /^Valor/.test(th.textContent ?? ''))
    const res: { total: string; filas: string[] }[] = []
    for (const tr of tabla.querySelectorAll('tbody tr')) {
      const total = tr.querySelector('[data-testid="total-dia"]')
      if (total) res.push({ total: total.textContent ?? '', filas: [] })
      else res[res.length - 1]?.filas.push(tr.querySelectorAll('td')[col]?.textContent ?? '')
    }
    return res
  })
  // Cabecera limpia: rótulo corto «Total»; la aclaración va como texto para lectores de pantalla.
  const primero = page.getByTestId('total-dia').first()
  await expect(primero).toContainText(/Total/)
  await expect(primero).toContainText('solo las operaciones de esta página')
  await expect(primero.getByRole('button', { name: /Total del día/ })).toBeVisible()
  // El primer y el último día pueden estar partidos entre páginas: se comprueban los del medio.
  const completos = grupos.slice(1, -1)
  expect(completos.length).toBeGreaterThan(2)
  for (const g of completos) {
    const suma = g.filas.reduce((a, t) => a + num(t), 0)
    expect(Math.abs(num(g.total) - suma)).toBeLessThanOrEqual(0.005 * g.filas.length + 0.01)
  }
})

test('densidad y columnas se guardan y sobreviven a la recarga', async ({ page }) => {
  await abrir(page)
  await abrirOpcionesVista(page)
  const opciones = page.getByRole('dialog', { name: 'Opciones de vista' })
  await opciones.getByRole('radio', { name: 'Compacta' }).click()
  await expect(page.locator('table[data-densidad="compacta"]')).toBeVisible()
  await opciones.getByRole('group', { name: 'Columnas de la tabla' }).getByRole('checkbox', { name: 'Fee' }).click()
  await expect(page.getByRole('columnheader', { name: 'Fee' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('table[data-densidad="compacta"]')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Fee' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Wallet' })).toBeVisible()
})
