import { expect, test, type Page } from './base'
import { axeEstable } from './axe'

// Ajustes › Conexiones (versión 1.0): claves de API de Etherscan, Blockfrost,
// Subscan y CoinGecko. Las rutas se simulan: nada se guarda en la base ni sale
// a los servicios reales. Claves sintéticas.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const CLAVE = 'claveSinteticaDePrueba123'

function servicios() {
  return {
    claveMaestra: true,
    servicios: [
      { id: 'etherscan', nombre: 'Etherscan', red: 'Ethereum', enlace: 'https://etherscan.io/myapikey', estado: 'sin_configurar', actualizada: null, plan: null, direcciones: 1 },
      { id: 'blockfrost', nombre: 'Blockfrost', red: 'Cardano', enlace: 'https://blockfrost.io', estado: 'configurada', actualizada: '2026-11-20T10:00:00Z', plan: null, direcciones: 2 },
      { id: 'subscan', nombre: 'Subscan (PubFi)', red: 'Polkadot Asset Hub', enlace: 'https://pubfi.ai/products/subscan-api', estado: 'entorno', actualizada: null, plan: null, direcciones: 0 },
      { id: 'coingecko', nombre: 'CoinGecko', red: null, enlace: 'https://www.coingecko.com/en/api/pricing', estado: 'sin_configurar', actualizada: null, plan: 'demo', direcciones: 0 },
    ],
  }
}

/** Simula la API; `respuesta` decide qué contesta el PUT. Devuelve los cuerpos enviados. */
async function simular(page: Page, respuesta: { status: number; json: unknown } = { status: 200, json: { guardada: true, comprobacion: 'aceptada' } }) {
  const enviados: Array<{ url: string; method: string; body: unknown }> = []
  await page.route('**/api/settings/conexiones', r => r.fulfill({ json: servicios() }))
  await page.route(/\/api\/settings\/conexiones\/[a-z]+(\/probar)?$/, async r => {
    const req = r.request()
    enviados.push({ url: req.url(), method: req.method(), body: req.postDataJSON?.() ?? null })
    if (req.method() === 'PUT') return r.fulfill(respuesta)
    if (req.url().endsWith('/probar')) return r.fulfill({ json: { comprobacion: 'aceptada' } })
    return r.fulfill({ json: { quitada: true } })
  })
  return enviados
}

const tarjeta = (page: Page, nombre: string) => page.getByRole('region', { name: nombre, exact: true })

test('muestra los cuatro servicios con su estado y nunca una clave', async ({ page }) => {
  await simular(page)
  await page.goto('/settings?tab=conexiones')
  await expect(page.getByRole('heading', { name: 'Conexiones', level: 2 })).toBeVisible()
  await expect(tarjeta(page, 'Etherscan')).toContainText('Sin clave')
  await expect(tarjeta(page, 'Etherscan')).toContainText('La usa 1 dirección')
  await expect(tarjeta(page, 'Blockfrost')).toContainText('Configurada el 20 nov 2026')
  await expect(tarjeta(page, 'Subscan (PubFi)')).toContainText('Desde el archivo .env')
  await expect(tarjeta(page, 'CoinGecko')).toContainText('Sin clave')
  await expect(tarjeta(page, 'Blockfrost').getByRole('button', { name: 'Quitar' })).toBeVisible()
  await expect(tarjeta(page, 'Etherscan').getByRole('button', { name: 'Probar', exact: true })).toHaveCount(0)
})

test('comprueba y guarda una clave aceptada, y vacía el campo', async ({ page }) => {
  const enviados = await simular(page)
  await page.goto('/settings?tab=conexiones')
  const t = tarjeta(page, 'Etherscan')
  await t.getByLabel('Clave de API').fill(CLAVE)
  await t.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(t.getByText('El servicio acepta la clave.')).toBeVisible()
  await expect(t.getByLabel('Clave de API')).toHaveValue('')
  expect(enviados[0]).toMatchObject({ method: 'PUT', body: { api_key: CLAVE } })
  expect(enviados[0].url).toMatch(/\/conexiones\/etherscan$/)
})

test('una clave rechazada muestra el motivo y no se borra del campo', async ({ page }) => {
  await simular(page, { status: 422, json: { error: 'El servicio rechaza esta clave: revisa que esté completa y activa.' } })
  await page.goto('/settings?tab=conexiones')
  const t = tarjeta(page, 'Etherscan')
  await t.getByLabel('Clave de API').fill(CLAVE)
  await t.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(t.getByRole('alert')).toContainText('El servicio rechaza esta clave')
  await expect(t.getByLabel('Clave de API')).toHaveValue(CLAVE)
})

test('CoinGecko envía el plan elegido', async ({ page }) => {
  const enviados = await simular(page)
  await page.goto('/settings?tab=conexiones')
  const t = tarjeta(page, 'CoinGecko')
  await t.getByRole('radio', { name: 'Pro' }).click()
  await t.getByLabel('Clave de API').fill(CLAVE)
  await t.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(t.getByText('El servicio acepta la clave.')).toBeVisible()
  expect(enviados[0].body).toEqual({ api_key: CLAVE, plan: 'pro' })
})

test('quitar una clave pide confirmación', async ({ page }) => {
  const enviados = await simular(page)
  await page.goto('/settings?tab=conexiones')
  await tarjeta(page, 'Blockfrost').getByRole('button', { name: 'Quitar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Quitar la clave de Blockfrost' })
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  expect(enviados).toHaveLength(0)
  await tarjeta(page, 'Blockfrost').getByRole('button', { name: 'Quitar' }).click()
  await page.getByRole('button', { name: 'Quitar la clave' }).click()
  await expect.poll(() => enviados.map(e => `${e.method} ${e.url.split('/').pop()}`)).toEqual(['DELETE blockfrost'])
})

test('el atajo desde una wallet lleva a la tarjeta y enfoca su campo', async ({ page }) => {
  await simular(page)
  await page.goto('/settings?tab=conexiones#conexion-etherscan')
  await expect(tarjeta(page, 'Etherscan').getByLabel('Clave de API')).toBeFocused()
})

for (const theme of ['dark', 'light'] as const) {
  test(`Conexiones sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await simular(page)
    await page.goto('/settings?tab=conexiones')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(tarjeta(page, 'CoinGecko')).toBeVisible()
    const { violations } = await (await axeEstable(page)).include('main').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('a 390 px la sección no desborda', async ({ page }) => {
  await simular(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings?tab=conexiones')
  await expect(tarjeta(page, 'CoinGecko')).toBeVisible()
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(desborda).toBe(false)
})
