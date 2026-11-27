# CryptoFolio: instrucciones del proyecto

## Política de ejecución de pruebas

La máquina de desarrollo se satura de CPU con la suite e2e: cada worker de
Playwright levanta un Chromium completo. Para no perder cobertura sin
saturarla:

- **Feedback rápido:** usa `vitest run` (unitarios, sin navegador). No lances
  e2e para comprobar un cambio suelto.
- **e2e durante el desarrollo:** solo el fichero afectado y acotado:
  `npx playwright test e2e/<fichero>.spec.ts --workers=1`
- **Suite e2e completa:** una vez por issue, antes de marcar la PR como lista,
  y por turnos para que dos agentes no la solapen:
  `flock "${XDG_RUNTIME_DIR:-/tmp}/cryptofolio-e2e.lock" npm run test:e2e:local`.
  Nunca en bucle.
- **No solapar en local** `test:e2e` con `build` ni con un `npm run dev` propio.

Los comandos de Playwright se ejecutan desde `frontend/`; contra el backend de
desarrollo hace falta `BACKEND_PROXY_HOST` (por ejemplo, `127.0.0.1:43001`).
En CI, `playwright.config.ts` mantiene los valores por defecto (workers y
servidor web) al estar definida la variable `CI`.

## Flujo del backlog

El backlog se trabaja con las skills `/issue`, `/coordinar` y `/cerrar-epica`
(`.claude/skills/`), según [docs/desarrollo/flujo-backlog.md](docs/desarrollo/flujo-backlog.md).

- **Autorizado sin preguntar:** commit y push en ramas de issue (`feat/`,
  `fix/`, `chore/` y `docs/`) y abrir o actualizar PR en borrador.
- **Siempre con doble confirmación del autor:** merge en `main`, subir
  etiquetas, publicar o editar releases, cualquier borrado en GitHub y
  cualquier operación directa sobre `main`.
- **CHANGELOG:** cada PR añade `changelog.d/<N>.md`; `CHANGELOG.md` solo lo
  modifica `/cerrar-epica`.
- **Datos reales:** solo en el stack principal y para la revisión del autor.
  Mientras la app los use, ningún agente lee la página ni hace capturas.
