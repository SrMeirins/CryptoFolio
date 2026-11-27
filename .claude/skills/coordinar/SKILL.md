---
name: coordinar
description: Coordina el backlog de CryptoFolio en paralelo. Mantiene hasta dos workers de Orca, cada uno en su worktree, implementando issues hasta la PR en borrador mientras el autor revisa otra en el checkout principal. Úsala al invocar /coordinar o cuando el autor pida avanzar varias issues a la vez.
---

# /coordinar

Sesión coordinadora del flujo descrito en [docs/desarrollo/flujo-backlog.md](../../../docs/desarrollo/flujo-backlog.md), sección «Paralelismo y consumo de tokens». El trabajo de cada issue lo hace la skill [/issue](../issue/SKILL.md) en modo worker; esta skill solo reparte, espera y prepara la revisión.

## Reglas de ahorro

- No leas código ni diffs: recibe del worker su resumen final de 5 líneas como máximo y la URL de la PR.
- No consultes a los workers en bucle. Tras lanzarlos, termina el turno: Orca te despierta con su `worker_done` o con una pregunta.
- Carga la guía de Orca una sola vez por sesión: `$ORCA_CLI_COMMAND skills get orchestration` (en Linux fuera de Orca, `orca-ide`; nunca `orca` a secas). En adelante, `ORCA` es ese ejecutable.

## 1. Estado

1. Issues en curso: `gh pr list --state open --json number,title,headRefName,isDraft` y `ORCA orchestration worker-list --environment local`.
2. Siguientes candidatas, por el orden de la tabla «Hoja de ruta» de la especificación, consultando sus etiquetas y su cuerpo: `gh issue view <N> --json labels,body`.

## 2. Elegir hasta dos issues

Hay hueco si hay menos de dos workers activos y menos de dos PR en borrador por delante de la que revisa el autor. Una candidata es compatible si cumple todo esto:

- Es de otra épica que las issues en curso, o de la misma épica sin tocar los mismos ficheros. En Ajustes #486, el orden es estricto.
- No prevé una migración mientras otra issue en curso prevea otra.
- No depende de una issue sin fusionar.

Si dudas de una dependencia, pregunta al autor con el mecanismo interactivo antes de lanzarla.

**Modelo del worker:** `claude-sonnet-5-5`. Usa `claude-opus-5-5` si la issue tiene la etiqueta `area/fiscal` o `area/fifo`, o si su cuerpo prevé una migración.

## 3. Lanzar

Escribe la especificación de cada worker en un fichero del scratchpad (`spec-<N>.md`) con tu herramienta de ficheros, sin heredocs, y con estas tres líneas:

```text
Ejecuta la skill /issue <N> en modo worker (repositorio CryptoFolio).
Entregable: PR en borrador con los tests en verde y tu stack bajado.
Devuelve en worker_done solo el resumen final de /issue.
```

Lanza las dos desde un único comando de shell, como indica `references/parallel-start.md` de la guía:

```text
ORCA orchestration worker-start --environment local --spec-file <spec-N.md> --task-title "Issue #<N>" --worktree new-child --name issue-<N> --base-branch main --agent claude --model <modelo>
```

Si `worker-start` falla, no lo repitas: sigue lo que imprime y `references/recovery-and-cleanup.md`. Después, termina el turno.

## 4. Al despertar

- **Pregunta del worker:** respóndela con `ORCA orchestration reply` solo si la respuesta sale de la issue o de la especificación. Si no, pregunta al autor.
- **`worker_done`:** anota la PR y su resumen y libera el worker si sigue abierto. Si no hay ninguna revisión en curso, prepara esta.
- **Escalado o fallo:** sigue la guía de Orca y avisa al autor con el motivo.

## 5. Preparar la revisión in situ (checkout principal)

Las revisiones van de una en una, en el checkout principal, contra el stack del autor con sus datos reales.

1. `git status` limpio, y después `git fetch` y `git switch <rama de la PR>`. Si falla porque el worktree del worker aún tiene la rama, pídele `git switch --detach` con `send`.
2. Si la PR trae una migración, ejecuta `make backup` antes de nada. Si cambió dependencias o configuración de build, `make rebuild`.
3. Abre la app en el navegador de Orca en la pantalla afectada (URL con `make urls`). **Mientras la app use los datos reales del autor, no leas el contenido de la página ni hagas capturas: solo navega hasta la pantalla.**
4. Entrega al autor el resumen del worker y el enlace de la PR, y espera su revisión.
5. Los cambios que pida se envían a ese worker con `ORCA orchestration send --to dispatch:<id>`. Si el worker ya cerró, se aplican en esta sesión con `/issue <N>`, que retoma la rama.
6. El merge sigue la fase 5 de `/issue`: e2e completa por turnos, CI en verde y doble confirmación.
7. Después del merge, vuelve a `main` y ejecuta `make rebuild`. Si queda hueco, vuelve al paso 1.

## Prohibido

- Lanzar más de dos workers a la vez o arrancar un stack de worktree sin `CRYPTOFOLIO_PROJECT`.
- Que un worker ejecute `make dev-clean`, `make nuke` o `make demo`, o regenere su `.env.dev`.
- Fusionar, subir etiquetas o borrar nada sin la doble confirmación del autor.
- Llevar datos reales del autor a un worktree, una PR, una captura o un log.
