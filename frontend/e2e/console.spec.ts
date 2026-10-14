import { expect, test, type Page } from '@playwright/test'

// Prueba de humo de consola (#201): ninguna vista debe escribir errores ni
// avisos en la consola del navegador, ni lanzar excepciones no capturadas.

function watchConsole(page: Page): string[] {
  const problems: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`[${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', err => problems.push(`[pageerror] ${err.message}`))
  return problems
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  await page.waitForTimeout(1_000)
}

const VIEWS = [
  '/', '/portfolio', '/fiscal', '/import', '/history',
  '/settings?tab=wallets', '/settings?tab=assets', '/settings?tab=fiscal', '/settings?tab=datos', '/settings?tab=general',
]

for (const path of VIEWS) {
  test(`sin errores ni avisos en la consola: ${path}`, async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto(path)
    await settle(page)
    expect(problems).toEqual([])
  })
}

test('interacciones principales sin errores ni avisos', async ({ page }) => {
  const problems = watchConsole(page)

  await page.goto('/')
  await settle(page)
  await page.getByRole('radio', { name: /USD/ }).first().click()
  await page.getByRole('button', { name: '7D' }).click()
  await page.getByRole('tab', { name: 'Valor' }).click()
  await settle(page)
  await page.getByRole('radio', { name: /EUR/ }).first().click()

  await page.goto('/fiscal')
  await settle(page)
  for (const year of await page.getByRole('button', { name: /^20\d\d/ }).all()) {
    await year.click()
    await settle(page)
  }

  await page.goto('/history')
  await settle(page)
  await page.getByText('Analítica de actividad').click()
  await settle(page)

  expect(problems).toEqual([])
})
