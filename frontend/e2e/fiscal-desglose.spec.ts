import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Desglose por activo (#540): ranking ordenable y filtrable con «Otros»
// desplegable y enlaces; contribución que termina en el neto. Axe en ambos
// temas. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const eur = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'))

async function abrir(page: import('@playwright/test').Page) {
  await page.goto('/fiscal')
  const vista = page.getByRole('radiogroup', { name: 'Vista del desglose' })
  await vista.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await vista.count() === 0, 'Ejercicio sin operaciones por activo')
  return vista
}

test('ranking: ordenar por columna y filtrar por signo y texto', async ({ page }) => {
  await abrir(page)
  const tabla = page.getByRole('table', { name: 'Resultado por activo del ejercicio' })
  const cabecera = tabla.getByRole('columnheader', { name: /Operaciones/ })
  await cabecera.getByRole('button').click()
  await expect(cabecera).toHaveAttribute('aria-sort', 'descending')
  await cabecera.getByRole('button').click()
  await expect(cabecera).toHaveAttribute('aria-sort', 'ascending')
  await page.getByRole('radiogroup', { name: 'Filtrar por resultado' }).getByRole('radio', { name: 'Con pérdida' }).click()
  for (const celda of await tabla.locator('tbody tr td:nth-child(2)').all()) expect(eur(await celda.innerText())).toBeLessThan(0)
  await page.getByRole('searchbox', { name: 'Buscar activo en el desglose' }).fill('zzzz')
  await expect(tabla.getByText('Ningún activo coincide con el filtro.')).toBeVisible()
})

test('ranking: la fila abre Operaciones y el icono, Portfolio', async ({ page }) => {
  await abrir(page)
  const tabla = page.getByRole('table', { name: 'Resultado por activo del ejercicio' })
  const portfolio = tabla.getByRole('link', { name: /^Ver .+ en Portfolio$/ }).first()
  const activo = (await portfolio.getAttribute('aria-label'))!.replace(/^Ver (.+) en Portfolio$/, '$1')
  await expect(portfolio).toHaveAttribute('href', `/portfolio?activo=${encodeURIComponent(activo)}`)
  await tabla.getByRole('button', { name: new RegExp(`^${activo}: resultado .*Ver sus operaciones$`) }).click()
  await expect(page).toHaveURL(new RegExp(`vista=operaciones&anio=\\d{4}&activo=${activo}$`))
})

test('contribución: la cascada termina exactamente en el neto del ejercicio', async ({ page }) => {
  const vista = await abrir(page)
  await vista.getByRole('radio', { name: 'Contribución' }).click()
  const tabla = page.getByRole('table', { name: 'Contribución de cada activo al neto del ejercicio' })
  const filas = tabla.getByRole('row')
  const importes = await Promise.all((await filas.all()).map(async f => eur(await f.locator('td').last().innerText())))
  const neto = importes.at(-1)!
  expect(importes.slice(0, -1).reduce((t, v) => t + v, 0)).toBeCloseTo(neto, 1)
  await expect(filas.last()).toContainText('Neto del ejercicio')
})

for (const theme of ['dark', 'light'] as const) {
  test(`desglose sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    const vista = await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(300)
    for (const v of ['Ranking', 'Contribución']) {
      await vista.getByRole('radio', { name: v }).click()
      await page.waitForTimeout(300)
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
      expect(violations.map(x => `${v} ${x.id}: ${x.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    }
  })
}
