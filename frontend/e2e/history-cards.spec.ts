import { expect, test } from '@playwright/test'

// Tarjetas del resumen (#407): pulsar una filtra la lista con el mismo
// recuento que suma, con su chip; otra vez, quita el filtro. Solo lectura.

const CARDS = { Invertido: 'fiat_buys', Retirado: 'withdrawn_ops', Ventas: 'sells', Ingresos: 'income_ops', Comisiones: 'fee_ops' } as const

test('cada tarjeta filtra la lista exactamente por lo que suma', async ({ page }) => {
  await page.goto('/history?margen=excluido')
  const totals = (await (await page.request.get('/api/v1/historial/estadisticas')).json()).totals
  for (const [title, key] of Object.entries(CARDS)) {
    const card = page.getByRole('button', { name: new RegExp(`^${title}: .*Ver sus operaciones$`) })
    await card.click()
    await expect(page.getByRole('button', { name: new RegExp(`^${title}: .*Quitar el filtro`) })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(new RegExp(`[?&]tarjeta=${title.toLowerCase()}`))
    await expect(page.getByRole('button', { name: new RegExp(`Quitar filtro Tarjeta: ${title}`) })).toBeVisible()
    const n = totals[key] as number
    // El subtítulo de la cabecera empieza por el recuento (después van los flujos).
    if (n > 0) await expect(page.locator('main p').getByText(new RegExp(`^${n} transacciones filtradas( ·|$)`))).toBeVisible()
    // Otra vez la misma tarjeta: quita el filtro.
    await page.getByRole('button', { name: new RegExp(`^${title}: .*Quitar el filtro`) }).click()
    await expect(page).not.toHaveURL(/tarjeta=/)
  }
})
