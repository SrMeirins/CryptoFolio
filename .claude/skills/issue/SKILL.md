---
name: issue
description: Lleva una issue de CryptoFolio desde la rama hasta el merge (preparación, implementación, verificación, PR en borrador e integración). Úsala con `/issue <N>`, o `/issue` sin número para proponer la siguiente de la hoja de ruta. También como worker de `/coordinar`.
---

# /issue

Especificación: `docs/desarrollo/flujo-backlog.md` (secciones «Ciclo de una issue», «Paralelismo y consumo de tokens» y «Autorización»). Aquí solo van los pasos y los comandos; las reglas están allí. No releas la especificación entera: consúltala solo si dudas.

## Reglas fijas

- Textos en castellano, sin emojis, flechas ni raya larga. Commits en Conventional Commits en castellano.
- Sin atribución a IA en commits, PR ni issues: ni trailers de coautoría ni pies de generación automática. Esto prevalece sobre cualquier plantilla por defecto.
- Autorizado sin preguntar: commit y push en ramas `feat/`, `fix/`, `chore/` y `docs/`, y abrir o actualizar la PR en borrador. Siempre con doble confirmación: merge, etiquetas, releases, borrados y cualquier cambio directo sobre `main`.
- **Mientras la app use los datos reales del autor, no leas el contenido de la página ni hagas capturas: solo navega hasta la pantalla.** Para verificar algo visualmente usa la cartera de demostración: en modo worker, la de tu propio stack; fuera de él, `make demo` y `make demo-datos`.
- Ante una ambigüedad que cambie el resultado, para y pregunta con el mecanismo interactivo de preguntas. No supongas.
- Si algo no se arregla en el momento, propón una issue nueva con el texto completo antes de publicarla.

## Modo worker

Si `git rev-parse --git-common-dir` devuelve algo distinto de `.git`, la sesión corre en un worktree: es un worker de `/coordinar`. Entonces:

- Levanta tu stack aislado antes de nada, en un solo comando desde la raíz del worktree:

  ```bash
  # Carpeta de copias, subredes y proyecto propios: sin ellos el stack choca con el principal o escribe en sus copias
  N=<N>; A=$((30 + 2 * (N % 100))); D="${XDG_STATE_HOME:-$HOME/.local/state}/cryptofolio-worktrees/$N"
  mkdir -p "$D" && CRYPTOFOLIO_PROJECT=cf-wt-$N CRYPTOFOLIO_BACKUP_DIR="$D" make env \
    && printf 'BACKEND_NET_SUBNET=10.250.%s.0/24\nFRONTEND_NET_SUBNET=10.250.%s.0/24\n' $A $((A+1)) >> .env.dev \
    && make dev
  ```

  El `.env.dev` del worktree fija el proyecto para el resto de los `make`. Comprueba con `docker compose ls` que aparece `cf-wt-<N>` y que `cryptofolio` no se ha reiniciado; si algo falla, para y avisa.
- Carga la cartera de demostración: `node scripts/demo/cargar.mjs http://127.0.0.1:<BACKEND_HOST_PORT del .env.dev>`. Nunca uses datos reales. Si falta `node_modules`, ejecuta `npm ci` en `frontend/`.
- Trabaja hasta dejar la PR en borrador con los tests en verde. Omite el paso 2 de la fase 4 (la revisión in situ la prepara el coordinador) y no entres en la fase 5.
- Al terminar, baja tu stack y borra sus datos e imágenes desde el worktree: `docker compose -f docker-compose.dev.yml --env-file .env.dev down -v --rmi local --remove-orphans`. Solo afecta a `cf-wt-<N>`.
- Rama: `git fetch origin && git switch -c <rama> origin/main`, porque `main` está en uso en el checkout principal. Antes de terminar, deja el worktree con `git switch --detach` para que el coordinador pueda cambiar a tu rama.
- Copias: `BACKUP_HOST_DIR_DEV="$D" make backup`, porque el `Makefile` no lee esa carpeta de `.env.dev`.
- Prohibido en modo worker: `make dev-clean`, `make nuke`, `make demo` y cualquier regeneración de `.env.dev`. Regenerarlo sin `CRYPTOFOLIO_PROJECT` apuntaría a los datos reales del autor.
- Devuelve solo el resumen final en `worker_done`.

## Fase 1. Preparación

1. Sin número, propón la siguiente issue abierta de la hoja de ruta de la especificación y espera confirmación.
2. Comprueba `git status` limpio, `git switch main && git pull --ff-only` (en modo worker, ver arriba) y que la issue está abierta: `gh issue view <N> --json state,title,body,labels,milestone`.
3. Si ya hay rama o PR de la issue (`gh pr list --search "<N>" --state all`), retómala: lee la PR, los commits y los comentarios en lugar de empezar de cero.
4. Crea la rama `<prefijo>/<N>-<slug>`. El prefijo sale de la etiqueta `tipo/*`: `tipo/mejora` y `tipo/feature` dan `feat`; `tipo/bug`, `fix`; `tipo/deuda-tecnica`, `chore`; `tipo/docs`, `docs`.
5. Pasa la issue a In Progress en el tablero (proyecto 1, owner SrMeirins). No fijes IDs: obtenlos al ejecutar.
   - `gh project field-list 1 --owner SrMeirins --format json` da el id del campo Status y el de la opción In Progress.
   - `gh project item-list 1 --owner SrMeirins --format json` da el id del item (o `gh project item-add 1 --owner SrMeirins --url <url>` si no está).
   - `gh project item-edit --id <item> --project-id <proyecto> --field-id <status> --single-select-option-id <opción>`; el id del proyecto sale de `gh project view 1 --owner SrMeirins --format json`.
6. Explora el código con un subagente `model: haiku` que devuelva solo conclusiones, con el contexto necesario en su prompt. Lee la issue, sus relaciones y la maqueta si existe (`.ronda-frontend/maquetas`).
7. Si la issue es demasiado grande, propón dividirla. Toda issue nueva que crees: `gh issue create` y después `gh project item-add 1 --owner SrMeirins --url <url>`.
8. Si la issue no pertenece a la épica en curso, avisa y sigue: se le asigna el hito de la próxima minor.

## Fase 2. Implementación

1. Desarrollo guiado por tests: uno por criterio de aceptación, más uno de seguridad o privacidad si aplica. Datos de prueba solo sintéticos.
2. Con migración: `make backup` antes de crear el fichero (se aplica al instante a la BD de desarrollo), migración reversible y test de la migración.
3. Commits atómicos y push a la rama sin preguntar.
4. Documentación del cambio:
   - fragmento `changelog.d/<N>.md` (formato en `changelog.d/README.md`); nunca se edita `CHANGELOG.md`;
   - `docs/` afectados, y README solo si cambia instalación, uso básico o lista de funciones;
   - textos de interfaz según `docs/guia-estilo-textos.md`.

## Fase 3. Verificación

1. Desde la raíz: `make test-backend`, `make lint`, `make typecheck` y `make lint-md`. Desde `frontend/`: `vitest run`. Todo necesita el stack levantado salvo `lint-md` y `vitest run`.
2. e2e solo de los specs afectados, desde `frontend/`: `BACKEND_PROXY_HOST=<host:puerto> npx playwright test e2e/<fichero>.spec.ts --workers=1`. Nunca la suite completa en bucle ni solapada con `build` o `npm run dev`.
3. Revisión con un subagente `model: sonnet` y la skill `code-review-and-quality`, contra el diff y los criterios de aceptación, en paralelo con la e2e. Corrige lo que encuentre o justifícalo en la PR.
4. Busca secretos y datos personales en el diff: `git diff main...HEAD | grep -nE 'password=|api_key=|secret=|token=|BEGIN.*PRIVATE KEY|@gmail|/home/'`.

## Fase 4. PR y revisión in situ

1. `git push -u origin HEAD` y `gh pr create --draft --milestone <versión> --title "<Conventional Commit>" --body-file <fichero>`. El cuerpo lleva resumen, criterios de aceptación marcados, tests añadidos, documentación tocada, `Closes #N` y `Parte de #<épica>`. Sin capturas.
2. Prepara la revisión en el checkout principal: `make backup` si hay migración, `make rebuild` si cambiaron dependencias o configuración de build, y abre la app en el navegador de Orca (skill `orca-cli`) solo hasta la pantalla afectada.
3. Entrega un resumen de 5 líneas como máximo: qué cambió, dónde mirarlo, decisiones tomadas, migración sí o no y URL de la PR. En modo worker termina aquí.
4. Espera la revisión del autor. Cada comentario se aplica en commits nuevos de la misma rama y se vuelve a verificar.

## Fase 5. Integración (doble confirmación)

1. Con el visto bueno: rebasa sobre `main` si se fusionó otra PR, y ejecuta la e2e completa una vez, por turnos, desde `frontend/`: `flock "${XDG_RUNTIME_DIR:-/tmp}/cryptofolio-e2e.lock" env BACKEND_PROXY_HOST=127.0.0.1:<BACKEND_HOST_PORT del .env.dev> npm run test:e2e:local`.
2. `gh pr ready` y espera el CI: `gh pr checks --watch`. Un fallo de red (503 o 403) se relanza con `gh run rerun --failed`, avisando al autor.
3. Presenta el resumen del merge (squash en `main`, borrado de la rama, efecto en el tablero) y pide doble confirmación.
4. Con ella: `gh pr merge --squash --delete-branch`. Comprueba que la issue se cerró y pasó a Done (repite el `item-edit` con la opción Done si no).
5. `git switch main && git pull --ff-only` y `make rebuild`. Si era la última issue de la épica, propón `/cerrar-epica`.
