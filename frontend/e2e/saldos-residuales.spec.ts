import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Saldos residuales (#530): un solo nombre, fichas compactas sin «0,00 €»,
// «Ocultar restos» que se recuerda, umbral editable en el bloque (mismo
// ajuste que Ajustes) y «Registrar conversión de restos» con su diálogo.
// Precios, configuración y conversión se interceptan: la base de datos no se
// toca y el umbral alto hace que todas las posiciones sean restos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function preparar(page: Page) {
  const config: Record<string, string> = { dust_threshold_eur: '1000' }
  const conversiones: unknown[] = []
  const previas: unknown[] = []
  const posiciones = await (await page.request.get('/api/fifo/lots')).json() as Array<{ asset: string }>
  test.skip(posiciones.length === 0, 'Sin posiciones abiertas')
  // Precio sintético pequeño para todo y sin WebSocket: valores conocidos y deterministas.
  await page.route('**/api/prices/live', route => route.fulfill({ json: Object.fromEntries(posiciones.map(p => [p.asset, 1e-10])) }))
  await page.routeWebSocket(/.*/, () => { /* sin conexión */ })
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() === 'PUT') {
      const { key, value } = route.request().postDataJSON() as { key: string; value: string }
      config[key] = value
      await route.fulfill({ json: { success: true } })
      return
    }
    try {
      const real = await route.fetch()
      await route.fulfill({ response: real, json: { ...(await real.json()), ...config } })
    } catch { /* navegación en curso */ }
  })
  await page.route('**/api/v1/transactions/conversion-restos/preview', async route => {
    const b = route.request().postDataJSON() as { recibido: string; items: Array<{ asset: string; cantidad: number; recibido: number }> }
    previas.push(b)
    await route.fulfill({ json: { recibido: b.recibido, precioRecibidoEur: 500, totalGainLossEur: -0.01,
      items: b.items.map(i => ({ ...i, proceedsEur: i.recibido * 500, costEur: 0.02, gainLossEur: -0.01 })) } })
  })
  await page.route('**/api/v1/transactions/conversion-restos', async route => {
    conversiones.push(route.request().postDataJSON())
    await route.fulfill({ json: { success: true, fifo: null } })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/portfolio')
  const restos = page.getByRole('region', { name: 'Saldos residuales' })
  await restos.waitFor({ timeout: 15_000 })
  const mostrar = restos.getByRole('button', { name: 'Mostrar restos' })
  if (await mostrar.count()) await mostrar.click()
  await expect(restos.getByTestId('ficha-resto').first()).toBeVisible()
  return { restos, config, conversiones, previas }
}

test('un solo nombre y fichas compactas sin «0,00 €»', async ({ page }) => {
  const { restos } = await preparar(page)
  await expect(page.getByText(/\bPolvo\b/)).toHaveCount(0)
  const texto = await restos.innerText()
  expect(texto).not.toMatch(/-?0,00\s€/)
  // Valor por debajo del céntimo: «< 0,01 €».
  await expect(restos.getByTestId('ficha-resto').first()).toContainText('< 0,01')
})

test('«Ocultar restos» pliega el bloque y se recuerda al volver', async ({ page }) => {
  const { restos } = await preparar(page)
  await restos.getByRole('button', { name: 'Ocultar restos' }).click()
  await expect(restos.getByTestId('ficha-resto')).toHaveCount(0)
  await expect(restos.getByRole('button', { name: 'Mostrar restos' })).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  const tras = page.getByRole('region', { name: 'Saldos residuales' })
  await expect(tras.getByRole('button', { name: 'Mostrar restos' })).toBeVisible({ timeout: 15_000 })
  await expect(tras.getByTestId('ficha-resto')).toHaveCount(0)
  await tras.getByRole('button', { name: 'Mostrar restos' }).click()
})

test('el umbral se cambia desde el bloque (el mismo ajuste de Ajustes) con Deshacer', async ({ page }) => {
  const { restos, config } = await preparar(page)
  await expect(restos.getByRole('link', { name: 'Más en Ajustes' })).toHaveAttribute('href', '/settings?tab=general')
  const umbral = restos.getByLabel('Restos de menos de')
  await umbral.fill('abc')
  await umbral.press('Enter')
  await expect(restos.getByRole('alert')).toBeVisible()
  await umbral.fill('2,5')
  await umbral.press('Enter')
  await expect.poll(() => config.dust_threshold_eur).toBe('2.5')
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect.poll(() => config.dust_threshold_eur).toBe('1000')
})

test('registrar la conversión: restos de una wallet, reparto, vista previa y alta', async ({ page }) => {
  const { restos, conversiones, previas } = await preparar(page)
  await restos.getByRole('button', { name: 'Registrar conversión de restos' }).click()
  const fichas = restos.getByTestId('ficha-resto')
  await fichas.first().click()
  await expect(fichas.first()).toHaveAttribute('aria-pressed', 'true')
  // Las de otra wallet quedan deshabilitadas.
  const nombre = (await fichas.first().getAttribute('aria-label'))!
  const wallet = nombre.match(/ de (.+)$/)![1]
  for (const f of await fichas.all()) {
    const n = (await f.getAttribute('aria-label'))!
    if (!n.includes(` de ${wallet}`)) await expect(f).toBeDisabled()
  }
  await restos.getByRole('button', { name: /^Continuar con 1 resto$/ }).click()
  const dialogo = page.getByRole('dialog', { name: 'Registrar conversión de restos' })
  await dialogo.getByLabel('Activo recibido').fill('SINTZ')
  await dialogo.getByLabel(/^Total recibido/).fill('0,0012')
  // Con un solo resto, recibe todo el total.
  await expect(dialogo.getByLabel(/^Recibido por /)).toHaveValue('0,0012')
  await dialogo.getByRole('button', { name: 'Ver el resultado' }).click()
  await expect(dialogo.getByText(/Resultado fiscal estimado/)).toBeVisible()
  expect(previas).toHaveLength(1)
  await dialogo.getByRole('button', { name: 'Registrar 1 permuta' }).click()
  await expect(page.getByText(/Conversión de 1 resto a SINTZ registrada/)).toBeVisible()
  expect(conversiones).toHaveLength(1)
  const b = conversiones[0] as { walletId: string; recibido: string; items: Array<{ recibido: number }> }
  expect(b.recibido).toBe('SINTZ')
  expect(b.items).toHaveLength(1)
  expect(b.items[0].recibido).toBeCloseTo(0.0012, 12)
})

for (const theme of ['dark', 'light'] as const) {
  test(`saldos residuales y diálogo sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    const { restos } = await preparar(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    let r = await (await axeEstable(page)).include('section[aria-label="Saldos residuales"]').withTags(WCAG).analyze()
    expect(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    await restos.getByRole('button', { name: 'Registrar conversión de restos' }).click()
    await restos.getByTestId('ficha-resto').first().click()
    await restos.getByRole('button', { name: /^Continuar con/ }).click()
    await page.getByRole('dialog').getByLabel(/^Total recibido/).fill('0,001')
    r = await (await axeEstable(page)).include('[role="dialog"]').withTags(WCAG).analyze()
    expect(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
