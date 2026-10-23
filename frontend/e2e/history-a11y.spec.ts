import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Teclado en Historial (#351): foco visible, panel de detalle (#373) y borrado
// cancelable.
// La auditoría con axe de todas las vistas está en a11y.spec.ts (#356). No
// modifica datos: el borrado solo se abre y se cancela.

async function openHistory(page: Page, theme: 'dark' | 'light') {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto('/history')
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
  await expect(page.getByRole('table')).toBeVisible()
}

test('teclado: foco visible, acciones de la fila y borrado cancelable con Esc', async ({ page }) => {
  await openHistory(page, 'dark')

  // Las acciones de la fila son visibles al recibir el foco.
  const editar = page.getByRole('button', { name: 'Editar transacción' }).first()
  await editar.focus()
  await expect(editar.locator('..')).toHaveCSS('opacity', '1')

  // Borrado: el foco va a «Cancelar», Esc cancela y el foco vuelve al botón.
  const borrar = page.getByRole('button', { name: 'Eliminar transacción' }).first()
  if (await borrar.count() === 0) return // sin transacciones manuales en estos datos
  await borrar.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: /Confirmar el borrado/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Eliminar transacción' }).first()).toBeFocused()
})

test('panel de detalle (#373): se abre con teclado, navega y Esc devuelve el foco', async ({ page }) => {
  await openHistory(page, 'dark')
  const abrir = page.getByRole('button', { name: 'Ver detalle' }).first()
  await expect(abrir).toHaveAttribute('aria-haspopup', 'dialog')
  await abrir.focus()
  await page.keyboard.press('Enter')

  // Diálogo con nombre, foco inicial en «Cerrar» y URL compartible (?tx=).
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cerrar el detalle' })).toBeFocused()
  await expect(page).toHaveURL(/[?&]tx=/)
  await expect(dialog.getByRole('heading', { name: 'Trazabilidad FIFO (EUR, como Fiscal)' })).toBeVisible()
  const titulo = await dialog.getByRole('heading', { level: 2 }).textContent()

  // Siguiente cambia de transacción sin cerrar el panel; Anterior vuelve.
  const siguiente = dialog.getByRole('button', { name: 'Transacción siguiente' })
  if (await siguiente.isEnabled()) {
    const antes = page.url()
    await siguiente.click()
    await expect(page).not.toHaveURL(antes)
    await dialog.getByRole('button', { name: 'Transacción anterior' }).click()
    await expect(page).toHaveURL(antes)
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(titulo ?? '')
  }

  // Esc cierra, quita ?tx= y devuelve el foco al botón que lo abrió.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]tx=/)
  await expect(abrir).toBeFocused()
})

test('panel de detalle (#373): una operación relacionada se abre en el mismo panel', async ({ page }) => {
  await openHistory(page, 'dark')
  // Una venta consume lotes: su trazabilidad enlaza con la compra de origen.
  await page.goto('/history?tipo=SELL')
  await expect(page.getByRole('table')).toBeVisible()
  const ver = page.getByRole('button', { name: 'Ver detalle' }).first()
  if (await ver.count() === 0) return // sin ventas en estos datos
  await ver.click()
  const dialog = page.getByRole('dialog')
  const fifo = dialog.locator('section', { has: page.getByRole('heading', { name: /Trazabilidad FIFO/ }) })
  const origen = fifo.getByRole('button').first()
  if (await origen.count() === 0) return
  const antes = page.url()
  await origen.click()
  await expect(page).not.toHaveURL(antes)
  await expect(dialog).toBeVisible()
})

test('estadísticas (#376): siguen a los filtros y el gráfico alterna número y valor sin pedir nada', async ({ page }) => {
  await openHistory(page, 'dark')
  const resumen = page.getByRole('region', { name: /Resumen/ })
  await expect(resumen).toBeVisible()
  await expect(resumen).not.toContainText('según los filtros')
  const opsCard = resumen.getByText('Operaciones', { exact: true }).locator('..')
  const total = await opsCard.locator('.mono').textContent()

  // Con un filtro, las tarjetas se rotulan y cambian.
  await page.goto('/history?tipo=SELL')
  await expect(resumen).toContainText('según los filtros')
  await expect(opsCard.locator('.mono')).not.toHaveText(total ?? '')

  // Abrir la analítica y cambiar de modo no lanza peticiones de estadísticas.
  const analitica = page.getByRole('button', { name: /Analítica de actividad/ })
  if (await analitica.getAttribute('aria-expanded') === 'false') await analitica.click()
  const peticiones: string[] = []
  page.on('request', r => { if (r.url().includes('/historial/estadisticas')) peticiones.push(r.url()) })
  const grupo = page.getByRole('group', { name: 'Medida del gráfico' })
  const valor = grupo.getByRole('button', { name: 'Valor' })
  await valor.focus()
  await page.keyboard.press('Enter')
  await expect(valor).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('table', { name: /Valor en (EUR|USD) por/ })).toBeAttached()
  await grupo.getByRole('button', { name: 'Número' }).click()
  await expect(page.getByRole('table', { name: /Operaciones por/ })).toBeAttached()
  expect(peticiones).toEqual([])
})

// Edición de importadas (#378). Solo lectura: nada se guarda ni se restaura;
// la sección de cambios se prueba con una respuesta simulada del detalle.
test('importada (#378): el modal avisa del archivo, tiene nombre y cancelar no guarda nada', async ({ page }) => {
  await openHistory(page, 'dark')
  const escrituras: string[] = []
  page.on('request', r => { if (['PUT', 'POST', 'DELETE'].includes(r.method()) && r.url().includes('/transactions')) escrituras.push(r.url()) })
  const fila = page.locator('tbody tr').filter({ hasNot: page.getByText('Añadida manualmente') }).filter({ has: page.getByRole('button', { name: 'Editar transacción' }) }).first()
  await fila.getByRole('button', { name: 'Editar transacción' }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Editar transacción' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Transacción importada')
  await expect(dialog).toContainText('Podrás restaurarlos desde su detalle')
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).include('[role="dialog"]').analyze()
  expect(violations.map(v => v.id)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(escrituras).toEqual([])
})

test('filtro «Editadas» (#378): conmutador accesible, en la URL y con su chip', async ({ page }) => {
  await openHistory(page, 'dark')
  const boton = page.getByRole('button', { name: 'Editadas', exact: true })
  await expect(boton).toHaveAttribute('aria-pressed', 'false')
  await boton.click()
  await expect(boton).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/[?&]editadas=1/)
  await expect(page.getByText('Solo editadas')).toBeVisible()
})

test('panel de una importada editada (#378): cambios, restaurar con confirmación cancelable y axe', async ({ page }) => {
  await page.route('**/api/v1/transactions/*/detalle', async route => {
    const res = await route.fetch()
    const body = await res.json()
    const t = body.transaction
    t.manually_added = false
    t.original_import = {
      operation_type: t.operation_type, timestamp: t.timestamp, asset: t.asset,
      amount: Number(t.amount) + 1, amount_net: Number(t.amount_net) + 1,
      cost_asset: t.cost_asset, cost_amount: t.cost_amount, price_per_unit: t.price_per_unit,
      fee_asset: t.fee_asset, fee_amount: t.fee_amount, wallet_id: t.wallet_id,
      destination_wallet_id: t.destination_wallet_id, destination_pending: t.destination_pending ?? false,
    }
    await route.fulfill({ response: res, json: body })
  })
  const escrituras: string[] = []
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/transactions')) escrituras.push(r.url()) })
  await openHistory(page, 'dark')
  await page.getByRole('button', { name: 'Ver detalle' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Editada a mano' })).toBeVisible()
  await expect(dialog.getByRole('table', { name: 'Cambios respecto a los valores importados' })).toContainText('Cantidad')

  const restaurar = dialog.getByRole('button', { name: 'Restaurar original' })
  await restaurar.click()
  const confirmar = dialog.getByRole('group', { name: /Confirmar la restauración/ })
  await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  // Esc cancela la confirmación sin cerrar el panel y devuelve el foco.
  await page.keyboard.press('Escape')
  await expect(confirmar).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(restaurar).toBeFocused()

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).include('[role="dialog"]').analyze()
  expect(violations.map(v => v.id)).toEqual([])
  expect(escrituras).toEqual([])
})

test.describe('hora del asistente en la zona de la app (#378)', () => {
  // Navegador en otra zona: el campo debe mostrar la hora de la app, la misma de la fila.
  test.use({ timezoneId: 'America/New_York' })

  test('al editar, la fecha muestra la hora de la fila (no UTC ni la del navegador) y cancelar no guarda', async ({ page }) => {
    await openHistory(page, 'dark')
    // Un tipo del catálogo del asistente (BUY/SELL genéricos no lo están y
    // abren en «Tipo»): así abre directamente en los detalles, con la fecha.
    const tipos = ['STAKING_REWARD', 'DEPOSIT_FIAT', 'WITHDRAW', 'DEPOSIT_CRYPTO', 'TRANSFER_INTERNAL']
    const respuesta = page.waitForResponse(r => r.url().includes('/api/transactions?') && r.url().includes('STAKING_REWARD'))
    await page.goto(`/history?tipo=${tipos.join(',')}`)
    await respuesta
    await page.waitForLoadState('networkidle').catch(() => { /* WebSocket abierto */ })
    const fila = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Editar transacción' }) }).first()
    const escrituras: string[] = []
    page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/transactions')) escrituras.push(r.url()) })
    const hora = (await fila.locator('td').first().locator('.mono').textContent())?.trim() ?? ''
    expect(hora).toMatch(/^\d{2}:\d{2}$/)
    await fila.getByRole('button', { name: 'Editar transacción' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Editar transacción' })
    await expect(dialog.locator('input[type="datetime-local"]')).toHaveValue(new RegExp(`T${hora}:\\d{2}$`))
    await page.keyboard.press('Escape')
    expect(escrituras).toEqual([])
  })
})
