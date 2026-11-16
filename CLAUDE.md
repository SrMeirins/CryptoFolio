# CryptoFolio: instrucciones del proyecto

## Política de ejecución de pruebas

La máquina de desarrollo se satura de CPU con la suite e2e: cada worker de
Playwright levanta un Chromium completo. Para no perder cobertura sin
saturarla:

- **Feedback rápido:** usa `vitest run` (unitarios, sin navegador). No lances
  e2e para comprobar un cambio suelto.
- **e2e durante el desarrollo:** solo el fichero afectado y acotado:
  `npx playwright test e2e/<fichero>.spec.ts --workers=1`
- **Suite e2e completa:** UNA sola vez al final, con `npm run test:e2e:local`.
  Nunca en bucle.
- **No solapar en local** `test:e2e` con `build` ni con un `npm run dev` propio.

Los comandos de Playwright se ejecutan desde `frontend/`; contra el backend de
desarrollo hace falta `BACKEND_PROXY_HOST` (por ejemplo, `127.0.0.1:43001`).
En CI, `playwright.config.ts` mantiene los valores por defecto (workers y
servidor web) al estar definida la variable `CI`.
