import { expect, test, type Page } from './base'
import { abrirOpcionesVista } from './historyHelpers'

// Tabla legible del Historial (#554): anchos fijos al paginar, total por día
// que coincide con las filas, y densidad y columnas que se guardan y sobreviven
// a la recarga. Las preferencias son globales: se restauran al terminar.

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

async function abrir(page: Page) {
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
}

async function anchos(page: Page): Promise<number[]> {
  return page.locator('table thead th').evaluateAll(ths => ths.map(th => Math.round(th.getBoundingClientRect().width)))
}

test('las columnas no cambian de ancho al paginar', async ({ page }) => {
  await abrir(page)
  const antes = await anchos(page)
  await page.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(page.getByLabel('Página 2', { exact: false })).toBeVisible()
  expect(await anchos(page)).toEqual(antes)
})

test('el total de cada día es la suma de los valores de sus filas', async ({ page }) => {
  await abrir(page)
  const grupo = page.locator('tbody tr').filter({ has: page.getByTestId('total-dia') }).first()
  const total = await grupo.getByTestId('total-dia').innerText()
  // Filas del día: las que van tras la cabecera hasta la siguiente.
  const importes = await page.locator('tbody').evaluate(tbody => {
    const filas = [...tbody.querySelectorAll('tr')]
    const fin = filas.findIndex((f, i) => i > 0 && f.querySelector('[data-testid="total-dia"]'))
    return filas.slice(1, fin === -1 ? undefined : fin).map(f => f.querySelectorAll('td')[4]?.textContent ?? '')
  })
  const num = (t: string) => { const m = t.replace(/ /g, ' ').match(/(-?[\d.]+,\d{2})/); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : 0 }
  const suma = importes.reduce((a, t) => a + num(t), 0)
  expect(Math.abs(num(total) - suma)).toBeLessThan(0.05 * Math.max(1, importes.length))
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
