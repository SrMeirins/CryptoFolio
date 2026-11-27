---
name: cerrar-epica
description: Prepara y publica la release de una épica del backlog (rama chore/release, CHANGELOG desde changelog.d, versión, e2e, prueba previa, PR, etiqueta y hito). Úsala con /cerrar-epica <N> al terminar la última issue de una épica, o con /cerrar-epica --parche para un parche X.Y.Z sin cerrar épica.
---

# Cierre de épica y release

Especificación: `docs/desarrollo/flujo-backlog.md`, secciones «Cierre de épica y release» y «Autorización». Este documento solo fija los comandos. Texto plano: sin emojis, flechas ni raya larga. Sin atribución a IA en commits, PR ni notas.

## Paradas obligatorias

Doble confirmación explícita del autor, en el momento y por separado, antes de:

- el merge de la PR de release en `main`;
- subir la etiqueta `vX.Y.Z` (publica la release);
- cualquier borrado: `git rm` de fragmentos, ramas, hitos, comentarios o releases.

Commits y push en la rama `chore/release-X.Y.Z` y la PR en borrador van sin preguntar. Nada se hace sobre `main` directamente. Usa el mecanismo interactivo de preguntas, con el enunciado en una o dos líneas y el contexto en el texto previo.

## Argumentos

- `<N>`: número de la épica. Versión `X.Y.0`: la que asigna la hoja de ruta de la especificación o el hito abierto de la épica. Si no es inequívoca, pregunta.
- `--parche`: versión `X.Y.Z` con Z mayor que 0, la propone el agente y la confirma el autor. Ejecuta los pasos 2 a 8 sin cerrar épica ni hito de épica. Recoge todo lo pendiente en `changelog.d/`.

## Pasos

Lleva una lista de progreso con checkboxes `[ ]` / `[x]` y avisa al autor al terminar cada paso.

### 1. Comprobaciones previas (solo con `<N>`)

```bash
# Sub-issues de la épica: todas deben estar cerradas
gh issue view <N> --json state,title
gh api repos/{owner}/{repo}/issues/<N>/sub_issues --jq '.[] | "\(.number) \(.state) \(.title)"'
# Fusionado desde la release anterior y fragmentos existentes
git fetch origin main && git log --oneline "$(git describe --tags --abbrev=0 origin/main)"..origin/main
ls changelog.d/
```

Cada PR fusionada desde la etiqueta anterior debe tener su `changelog.d/<N>.md`, también las de otras épicas. Si falta alguno o hay una sub-issue abierta, para y pregunta al autor: no inventes el fragmento.

### 2. Rama y versión

```bash
git switch -c chore/release-X.Y.Z origin/main
for d in backend frontend electron; do npm version X.Y.Z --no-git-tag-version --prefix "$d"; done
```

`--no-git-tag-version` no crea commit ni etiqueta: solo edita `package.json` y el `package-lock.json` de cada carpeta.

### 3. CHANGELOG

```bash
git rm $(node scripts/changelog/juntar.mjs X.Y.Z YYYY-MM-DD)
```

El script compone `## [X.Y.Z] - YYYY-MM-DD`, actualiza los enlaces de comparación del pie y escribe `CHANGELOG.md`. Imprime los fragmentos consumidos. Si sale con código 1 no escribe nada: corrige el fragmento que nombra el error. El `git rm` borra, así que va tras la confirmación del autor.

Después, agrupa las viñetas por tema como en la 1.0.0 si hace falta y revisa el README contra el código (lista de funciones, capturas). Comprueba `npm run lint:md`.

### 4. Capturas del README (solo si cambiaron pantallas)

Con la cartera sintética, nunca con datos reales:

```bash
make demo        # stack de demostración vacío, base y puertos propios
make demo-datos  # carga la cartera sintética de scripts/demo/
```

Regenera las capturas afectadas y, al terminar, pregunta antes de `make demo-down` (borra los datos de la demo).

### 5. Validación

```bash
(cd backend && npm test) && (cd frontend && npm run typecheck && npm test)
(cd frontend && BACKEND_PROXY_HOST=127.0.0.1:43001 npm run test:e2e:local)  # una sola vez, sin build ni dev en paralelo
```

La e2e completa se ejecuta una vez, nunca en bucle (ver `CLAUDE.md`). Los comandos de Playwright van desde `frontend/`.

### 6. Prueba previa a la release

Los fallos de la 1.0.0 se encontraron aquí.

```bash
git push -u origin chore/release-X.Y.Z
gh workflow run build-test.yml --ref chore/release-X.Y.Z   # Windows, Linux y macOS, sin publicar
gh run list --workflow build-test.yml --limit 1
gh run watch <id>
```

Cuando termine en verde, el autor instala el `.deb` y lo abre sobre una copia de sus datos de escritorio con `--user-data-dir`. Espera su visto bueno antes de seguir. Si algo falla, se corrige en la rama y se repite el paso.

### 7. PR de release y merge

```bash
gh pr create --draft --base main --title "chore(release): versión X.Y.Z" --body-file <cuerpo>
```

Cuerpo: resumen de la sección del CHANGELOG, resultado de e2e y de la prueba previa. Pasa la PR a lista y espera la revisión del autor. **Doble confirmación** y entonces `gh pr merge <PR> --squash`. Confirma que `main` está al día antes de etiquetar.

### 8. Etiqueta (doble confirmación aparte)

Explica que subirla dispara `release.yml` y publica. Tras la confirmación:

```bash
git switch main && git pull --ff-only
git tag vX.Y.Z && git push origin vX.Y.Z
```

`release.yml` solo se dispara con etiquetas `vX.Y.Z` y extrae las notas de la sección `## [X.Y.Z]` del CHANGELOG: si falla por eso, el CHANGELOG de `main` está mal.

### 9. Seguimiento de la release

```bash
gh run list --workflow release.yml --limit 1
gh run watch <id>
gh release view vX.Y.Z --json isDraft,assets,body
```

Comprueba que los instaladores de las tres plataformas están adjuntos, que las notas son las del CHANGELOG y que la release está publicada (no en borrador). Si queda en borrador, publicarla o editarla requiere doble confirmación.

### 10. Cierre (solo con `<N>`)

```bash
gh issue comment <N> --body-file <resumen>   # resumen: qué entra, versión, enlace a la release
gh issue close <N>
gh api repos/{owner}/{repo}/milestones --jq '.[] | "\(.number) \(.title) \(.state)"'
gh api -X PATCH repos/{owner}/{repo}/milestones/<hito> -f state=closed
```

El hito se llama como la versión (`1.1.0`, `1.2.0`...). Antes de cerrarlo, comprueba que no quedan issues abiertas en él: si las hay, pregunta si pasan al siguiente. Deja el tablero al día (épica y sub-issues en Done). Con `--parche` no hay épica: solo el hito, si existe.

## Errores y bloqueos

- Un fallo sin causa clara se investiga con depuración sistemática antes de cambiar nada.
- Una herramienta que falla dos veces con el mismo enfoque: cambia de estrategia o avisa.
- Un conflicto de merge que toque lógica fiscal, FIFO o seguridad se presenta al autor, no se resuelve solo.
- Si la sesión se corta, el estado es lo que hay en GitHub (rama, PR, etiqueta, hito): retoma desde el último paso sin completar.

## Resumen final

Cinco líneas como máximo: versión publicada, qué entra, resultado de las pruebas, URL de la release y decisiones tomadas.
