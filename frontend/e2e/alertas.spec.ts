import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Alertas (#519): validación de la API, crear una alerta desde el detalle del
// activo y verla disparada en la campana, la gestión en Ajustes y axe. Las
// alertas que crean las pruebas se borran al terminar. El disparo se provoca
// con un umbral simulado: «por debajo de» un precio muy alto, que el precio en
// vivo actual ya cumple, y la alerta se evalúa al crearla.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function borrarAlertas(page: Page, filtro: (a: { id: string; tipo: string; activo: string | null; precio: number | null }) => boolean) {
  const { alertas } = await (await page.request.get('/api/v1/alertas')).json() as { alertas: Array<{ id: string; tipo: string; activo: string | null; precio: number | null }> }
  for (const a of alertas.filter(filtro)) await page.request.delete(`/api/v1/alertas/${a.id}`)
}

/** Un activo en cartera con precio en vivo (los lotes vienen de la API). */
async function activoEnCartera(page: Page): Promise<string | null> {
  const lots = await (await page.request.get('/api/fifo/lots')).json() as Array<{ asset: string }>
  const precios = await (await page.request.get('/api/prices/live')).json() as Record<string, number>
  return lots.map(l => l.asset).find(a => (precios[a] ?? 0) > 0) ?? null
}

test('la API valida con esquema: precio positivo y activo existente', async ({ page }) => {
  const mal = await page.request.post('/api/v1/alertas', { data: { tipo: 'precio', activo: 'BTC', sentido: 'por_encima', precio: -1 } })
  expect(mal.status()).toBe(400)
  const noExiste = await page.request.post('/api/v1/alertas', { data: { tipo: 'precio', activo: 'NOEXISTE9', sentido: 'por_encima', precio: 1 } })
  expect(noExiste.status()).toBe(400)
})

test('crear una alerta desde el detalle del activo y verla disparada en la campana', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const activo = await activoEnCartera(page)
  test.skip(!activo, 'Sin activos en cartera con precio en vivo')
  const UMBRAL = 987654321
  // Por si una ejecución anterior se cortó antes de limpiar.
  await borrarAlertas(page, a => a.tipo === 'precio' && a.precio === UMBRAL)
  try {
    await page.goto(`/portfolio?activo=${activo}`)
    const seccion = page.getByTestId('alertas-activo')
    await seccion.waitFor({ timeout: 20_000 })
    await seccion.getByRole('button', { name: 'Crear alerta de precio' }).click()
    const form = seccion.getByRole('form', { name: `Alerta de precio de ${activo}` })
    await form.getByRole('radio', { name: 'Por debajo de' }).click()
    await form.getByLabel(/^Precio/).fill('987.654.321')
    await form.getByRole('button', { name: 'Guardar alerta' }).click()
    // Se evalúa al crearla con el precio actual: ya está disparada.
    await expect(seccion.getByTestId('fila-alerta').filter({ hasText: /987\.654\.321/ })).toContainText('Disparada')
    // El detalle es un diálogo modal que tapa la campana: se cierra antes.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('alertas-activo')).toHaveCount(0)
    await page.getByRole('button', { name: /^Avisos del sistema: / }).click()
    const panel = page.getByRole('dialog', { name: 'Avisos del sistema' })
    await expect(panel).toContainText(new RegExp(`${activo} ha bajado por debajo de`))
    await expect(panel.getByRole('link', { name: /Ir a Alertas/ }).or(panel.getByRole('button', { name: /Ir a Alertas/ })).first()).toBeVisible()
  } finally {
    await borrarAlertas(page, a => a.tipo === 'precio' && a.activo === activo && a.precio === UMBRAL)
  }
})

test('Ajustes › Alertas: alerta de cartera, pausar y borrar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const previa = (await (await page.request.get('/api/v1/alertas')).json() as { alertas: Array<{ tipo: string }> }).alertas.some(a => a.tipo === 'cartera')
  test.skip(previa, 'Ya hay una alerta de cartera configurada: no se toca')
  try {
    await page.goto('/settings?tab=alertas')
    const seccion = page.getByTestId('ajustes-alertas')
    await seccion.getByLabel('Avisar con un cambio mayor que (%)').fill('12,5')
    await seccion.getByRole('button', { name: 'Activar alerta de cartera' }).click()
    const fila = seccion.getByTestId('fila-alerta').filter({ hasText: 'mayor que 12,5 %' })
    await expect(fila).toBeVisible()
    await fila.getByRole('button', { name: 'Pausar la alerta de Cartera' }).click()
    await expect(fila).toContainText('Pausada')
    await fila.getByRole('button', { name: 'Borrar la alerta de Cartera' }).click()
    await fila.getByRole('button', { name: 'Confirmar borrado' }).click()
    await expect(seccion.getByTestId('fila-alerta').filter({ hasText: 'mayor que 12,5 %' })).toHaveCount(0)
  } finally {
    await borrarAlertas(page, a => a.tipo === 'cartera')
  }
})

test('la categoría «Alertas» se puede silenciar en Notificaciones', async ({ page }) => {
  await page.goto('/settings?tab=general')
  await expect(page.getByText('Alertas de precio y de cartera disparadas').first()).toBeVisible()
})

for (const theme of ['dark', 'light'] as const) {
  test(`Ajustes › Alertas sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/settings?tab=alertas')
    await page.getByTestId('ajustes-alertas').waitFor({ timeout: 15_000 })
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const { violations } = await (await axeEstable(page)).include('[data-testid="ajustes-alertas"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
