import { expect, test, type Page } from '@playwright/test'

// Ahorro de IRPF en Planificar (#533). Solo lectura: el planificador, los
// precios y las cuotas se interceptan con datos sintéticos; la base de datos
// real no se toca.

const N = 60 // más de las 50 que antes se calculaban
const ACTIVOS = Array.from({ length: N }, (_, i) => `SINT${String(i).padStart(2, '0')}`)

async function fakePlanificador(page: Page, cuotas: { fallar: boolean; peticiones: number }) {
  await page.route('**/api/prices/live', route => route.fulfill({ json: Object.fromEntries(ACTIVOS.map(a => [a, 1])) }))
  await page.route('**/api/fiscal/planificador', route => route.fulfill({
    json: {
      year: 2026, netoAnio: 500, rendimientosAnio: 0, cuotaActual: 95, colchon: 0, pendienteVigente: 0, caducanEsteAnio: 0,
      comprasRecientes: {},
      // Cada activo con pérdida latente distinta: 10 unidades compradas a 2 + i/10, precio actual 1.
      lotes: ACTIVOS.map((asset, i) => ({
        asset, walletId: 'w1', walletName: 'Exchange X', walletColor: '#888888', walletKind: 'exchange',
        openedAt: '2025-01-01T00:00:00.000Z', quantity: 10, unitCost: 2 + i / 10,
      })),
    },
  }))
  await page.route('**/api/fiscal/planificador/cuotas', async route => {
    cuotas.peticiones++
    if (cuotas.fallar) return route.fulfill({ status: 500, json: { error: 'Error interno' } })
    const { ganancias } = route.request().postDataJSON() as { ganancias: number[] }
    // Cuota sintética: 19 % de la base, que parte de 500.
    await route.fulfill({ json: { cuotaBase: 95, cuotas: ganancias.map(g => Math.max(0, (500 + g) * 0.19)) } })
  })
}

const lista = (page: Page) => page.getByRole('heading', { name: 'Pérdidas latentes que puedes realizar' }).locator('xpath=following::ul[1]')

test('todas las pérdidas sugeridas muestran su ahorro, también a partir de la 51', async ({ page }) => {
  const cuotas = { fallar: false, peticiones: 0 }
  await fakePlanificador(page, cuotas)
  await page.goto('/fiscal?vista=planificar')
  const filas = lista(page).getByRole('listitem')
  await expect(filas).toHaveCount(N)
  await expect(lista(page).getByText(/ahorra .* de IRPF este año/)).toHaveCount(N)
  await expect(lista(page).getByRole('status', { name: 'Calculando el ahorro' })).toHaveCount(0)
  // Una sola petición con los 60 importes (caben en el límite de la API) y ninguna más con los mismos precios.
  await page.waitForTimeout(2_000)
  expect(cuotas.peticiones).toBe(1)
})

test('si la consulta falla se avisa y Reintentar lo recupera', async ({ page }) => {
  const cuotas = { fallar: true, peticiones: 0 }
  await fakePlanificador(page, cuotas)
  await page.goto('/fiscal?vista=planificar')
  // react-query reintenta por defecto: el aviso llega tras agotar los reintentos.
  await expect(lista(page).getByText('No se pudo calcular el ahorro.').first()).toBeVisible({ timeout: 20_000 })
  cuotas.fallar = false
  await lista(page).getByRole('button', { name: 'Reintentar' }).first().click()
  await expect(lista(page).getByText(/ahorra .* de IRPF este año/)).toHaveCount(N)
})
