import { test as base } from '@playwright/test'

// Base de los e2e que abren el Historial sin parámetros (#552). Las pruebas
// corren contra la base de desarrollo, donde el usuario puede tener una vista
// predeterminada (con fechas, por ejemplo) que se aplicaría al abrir y
// cambiaría lo que ven. Este fixture automático la neutraliza solo en el
// navegador de la prueba: la lista de vistas llega sin la marca de
// predeterminada. No escribe nada. Los e2e de vistas guardadas usan
// @playwright/test directamente, porque prueban justo eso.

export * from '@playwright/test'

export const test = base.extend<{ sinVistaPredeterminada: void }>({
  sinVistaPredeterminada: [async ({ page }, use) => {
    await page.route('**/api/v1/historial/vistas', async route => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      const json = await res.json() as { vistas?: { predeterminada: boolean }[] }
      json.vistas = (json.vistas ?? []).map(v => ({ ...v, predeterminada: false }))
      await route.fulfill({ response: res, json })
    })
    await use()
    // Sin desvíos en vuelo al terminar: si no, el error cae en la siguiente prueba.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  }, { auto: true }],
})
