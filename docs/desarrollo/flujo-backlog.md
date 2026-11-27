# Flujo de trabajo del backlog tras la 1.0.0

Diseño del proceso con el que se aborda el backlog pendiente de CryptoFolio a partir de la versión 1.0.0: una issue por sesión, una épica por release y la documentación al día en cada cambio.

## Intención

El backlog posterior a la 1.0.0 suma 34 issues abiertas en cinco épicas y una issue suelta. Hasta ahora cada issue se ha llevado a mano con un ciclo de diez pasos y confirmación en cada uno. Este documento lo convierte en un proceso repetible y en gran parte automatizado, con tres garantías:

- **Calidad profesional:** cada cambio llega con tests, revisión de código y documentación (CHANGELOG, docs y README cuando proceda).
- **Trazabilidad:** el estado del trabajo vive en GitHub (issues, tablero, PR, hitos y releases), no en la memoria de una sesión.
- **Control humano** en los puntos irreversibles: fusionar en `main` y publicar una versión.

## Objetivos, no objetivos y antiobjetivos

### Objetivos

- Que el agente lleve cada issue desde la rama hasta una PR lista para revisar, sin pedir confirmación en los pasos intermedios.
- Una versión minor por épica cerrada (1.1.0, 1.2.0...), con notas de la release generadas desde el CHANGELOG.
- Que cualquier sesión nueva pueda retomar el trabajo leyendo solo GitHub y el repositorio.

### No objetivos

- Más de dos issues implementándose a la vez.
- Redefinir las issues: ya tienen problema, solución, criterios de aceptación y tests, y las maquetas están en `.ronda-frontend/maquetas`.
- Desbloquear la épica de escritorio #293.

### Antiobjetivos

Lo que haría fracasar el proceso aunque técnicamente funcione:

- Que datos financieros reales acaben en una PR, una captura, un log o una issue del repositorio público.
- Que una migración se aplique a la base de datos de desarrollo sin copia previa.
- Que el agente fusione en `main`, suba etiquetas o publique releases sin doble confirmación.
- Que el agente rellene una ambigüedad de la issue suponiendo en lugar de preguntar.
- Saturar la CPU lanzando la suite e2e completa en bucle o varias a la vez.
- Agotar la suscripción con agentes que releen contexto o se consultan en bucle sin necesidad.

## Restricciones

- **Una sola máquina de desarrollo, con CPU limitada:** la e2e se ejecuta por fichero con `--workers=1` durante el desarrollo, y completa una vez por issue, justo antes de marcar la PR como lista. La release la vuelve a pasar una vez más.
- **Un solo stack Docker de desarrollo** (`docker-compose.dev.yml`), que monta el `src` del checkout principal. La rama activa es la que se sirve. Si cambian dependencias o configuración de build, hace falta `make rebuild`.
- **Migraciones:** crear un fichero de migración la aplica al momento a la base de datos de desarrollo, así que antes se hace `make backup`.
- **Repositorio público** con AGPL-3.0 y licencia comercial: las vulnerabilidades van a avisos de seguridad privados, nunca a issues.
- **Reglas globales del autor** (`AGENTS.md`): textos en castellano sin emojis ni rayas largas, Conventional Commits en castellano, sin atribución a IA, doble confirmación para push y merge (con la excepción de la sección «Autorización» de este documento).
- **Release:** `release.yml` se dispara al subir una etiqueta `vX.Y.Z`, compila en Linux, macOS y Windows, toma las notas de la sección `## [X.Y.Z]` del CHANGELOG (falla si no existe) y publica la release cuando terminan las tres plataformas.

## Enfoques considerados

| Enfoque | Ventajas | Inconvenientes | Decisión |
| --- | --- | --- | --- |
| **A. Sesión nueva por issue con skills del proyecto** | Contexto limpio en cada issue, estado en GitHub, revisión in situ directa sobre el stack principal | Hay que abrir una sesión por issue | **Elegido como unidad de trabajo** |
| B. Sesión orquestadora con un subagente por issue | Encadena issues sin intervención | El contexto crece durante 34 issues y empeora la calidad; cada subagente empieza sin contexto; la parada en cada PR se mantiene de todos modos | Descartado |
| C. Worker de Orca en un worktree por issue | Aislamiento real y trabajo en paralelo | Un stack Docker por worktree; la revisión con datos reales sigue en el checkout principal | **Elegido para ejecutar A en paralelo** (máximo dos workers) |

El autor eligió primero trabajar de una en una y después pidió paralelizar al máximo, con el menor consumo de tokens posible. El diseño final combina A y C: cada worker de Orca ejecuta la skill `/issue` en su propio worktree, y la sesión principal coordina el trabajo y prepara las revisiones.

## Diseño

### Piezas

1. **Este documento**, enlazado desde la sección «Contribuir» del README.
2. **Skill `/issue <N>`** en `.claude/skills/issue/SKILL.md`: lleva una issue desde el inicio hasta la PR revisada y fusionada.
3. **Skill `/cerrar-epica <N>`** en `.claude/skills/cerrar-epica/SKILL.md`: cierra una épica y prepara su release.
4. **Skill `/coordinar`** en `.claude/skills/coordinar/SKILL.md`: mantiene hasta dos workers de Orca por delante de la PR en revisión (ver «Paralelismo y consumo de tokens»).
5. **Script `scripts/changelog/juntar.mjs`**: junta los fragmentos de `changelog.d/` en la sección de la versión.
6. **Hitos de GitHub** por versión (`1.1.0` a `1.4.0`), con las issues de cada épica asignadas. Sirven de vista de progreso por release. (Decisión del constructor: hoy no se usan hitos; se añaden porque dan esa vista sin coste.)

Las skills son públicas y no contienen datos personales: usuarios, rutas de la máquina e identificadores del tablero se leen de la configuración local o se obtienen con `gh`. Como `.gitignore` ignora hoy toda la carpeta `.claude/`, la PR inicial la cambia para versionar solo `.claude/skills/` y seguir dejando fuera `settings.local.json` y `worktrees/`.

### Hoja de ruta

| Versión | Épica | Orden de las issues |
| --- | --- | --- |
| 1.1.0 | Historial #485 | #554, #555, #557, #556 |
| 1.2.0 | Importar y Nueva operación #484 | #548, #549, #550, #551 |
| 1.3.0 | Ajustes #486 (incluye #646) | #558, #559, #560, #646, #561, #562, #563, #564, #565, #566, #567, #568, #606 |
| 1.4.0 | Armazón y primer uso #480 | #501, #500, #503, #502, #504, #505 |
| Fuera del plan | Escritorio #293 | Bloqueada |

Criterios de orden:

- Historial está a medias (#552 y #553 cerradas) y su contexto sigue reciente.
- Ajustes va en orden estricto porque varias issues tocan los mismos ficheros. El modelo de wallets (#558) va primero porque lo usa la interfaz. #646 (Conexiones) se vincula como sub-issue de #486 y va detrás de las issues de wallets, porque depende de las redes de cada wallet. #606 cierra la épica porque agrupa lo configurable de todas las pestañas.
- Armazón va al final porque la búsqueda global (#504) y los atajos (#505) cubren todas las pestañas.
- En Historial, #557 (la columna `price_eur` está vacía) va antes de #556 por si el desglose fiscal del detalle necesita ese dato. (Decisión del constructor.)

Si al implementar se descubre una dependencia que contradice este orden, la skill para y lo pregunta antes de cambiarlo.

### Ciclo de una issue: `/issue <N>`

Se abre una sesión nueva por issue. Si se invoca sin número, la skill propone la siguiente issue abierta según la hoja de ruta.

#### Fase 1. Preparación (automática)

1. Comprueba que `main` está limpio y actualizado y que la issue está abierta. Si la issue no pertenece a la épica en curso (un bug o una issue surgida durante el trabajo), avisa y sigue: se le asigna el hito de la próxima minor, y su entrada en `[Unreleased]` sale en esa release. Si el autor decide que un bug no puede esperar, se publica un parche (ver el cierre de épica). (Decisión del constructor.)
2. Si ya existe la rama de la issue, retoma desde ella: lee la PR, los commits y los comentarios en lugar de empezar de cero.
3. Crea la rama `<tipo>/<N>-<slug>` (feat, fix, chore o docs, según la etiqueta `tipo/*`) y pasa la issue a In Progress en el tablero.
4. Lee la issue, sus relaciones y la maqueta, si la hay, y estudia el código afectado.
5. **Parada por ambigüedad:** si los criterios de aceptación no bastan para decidir algo que cambia el resultado, pregunta con el mecanismo interactivo antes de implementar. Si la issue resulta demasiado grande, propone dividirla en issues nuevas.

#### Fase 2. Implementación (automática)

1. Desarrollo guiado por tests: un test unitario o de integración por criterio de aceptación, más uno de seguridad o privacidad cuando aplique.
2. Si la issue requiere una migración: `make backup` antes de crear el fichero, migración reversible y test de la migración.
3. Commits atómicos en la rama con Conventional Commits en castellano.
4. **Documentación del cambio:**
   - **CHANGELOG:** un fragmento `changelog.d/<N>.md` con la subsección (Añadido, Cambiado, Corregido, Eliminado o Seguridad) y la entrada escrita para el usuario. No se edita `CHANGELOG.md` directamente, para que dos PR en paralelo no choquen; `/cerrar-epica` junta los fragmentos.
   - **docs/:** se actualizan los documentos afectados (operaciones soportadas, guía de estilo...).
   - **README:** solo si el cambio afecta a la instalación, al uso básico o a la lista de funciones. Si no, el README se revisa al cerrar la épica.
   - **Textos de la interfaz:** conforme a `docs/guia-estilo-textos.md`.

#### Fase 3. Verificación (automática)

1. `vitest run`, tests de backend, lint, typecheck y `make lint-md`.
2. e2e solo de los specs afectados, con `--workers=1`, en cada ronda de cambios.
3. Revisión de código por un subagente con la skill `code-review-and-quality`, contra el diff y los criterios de aceptación. Lo que encuentre se corrige o se justifica en la PR.
4. Comprobación de secretos y datos personales en el diff.

#### Fase 4. PR y revisión in situ (parada para el autor)

1. Push de la rama y PR en borrador con:
   - un título en Conventional Commits;
   - un resumen;
   - los criterios de aceptación marcados;
   - los tests añadidos;
   - la documentación tocada;
   - `Closes #N` y `Parte de #<épica>`;
   - el hito de la versión.
   - La PR no lleva capturas.
2. Prepara la revisión: `make backup` si hay migración, `make rebuild` si cambiaron dependencias, y abre la app en el navegador de Orca en la pantalla afectada. La revisión se hace con los datos reales del autor, por decisión suya. Para que esos datos no salgan de la máquina, el agente solo navega hasta la pantalla: **no lee el contenido de la página ni hace capturas** mientras la app use los datos reales. Si necesita verificar algo visualmente, lo hace con la cartera de demostración (`make demo`, `make demo-datos`), que usa una base de datos y puertos propios. (Decisión del constructor.)
3. Entrega un resumen corto: qué cambió, dónde mirarlo y qué decisiones tomó el agente.
4. **Espera** a la revisión del autor. Cada comentario se aplica en commits nuevos de la misma rama y se vuelve a verificar.

#### Fase 5. Integración (doble confirmación)

1. Con el visto bueno del autor, ejecuta la suite e2e completa una vez (`npm run test:e2e:local`). Después pasa la PR a lista y espera a que el CI esté en verde. Un fallo puntual de red (503 o 403) se relanza con `gh run rerun --failed`, avisando.
2. Presenta el resumen del merge (squash en `main`, borrado de la rama, efecto en el tablero) y pide **doble confirmación**.
3. Fusiona, comprueba que la issue se cerró y que pasó a Done, añade un comentario de cierre si aporta algo que no esté en la PR, vuelve a `main` y ejecuta `make rebuild`.
4. Si era la última issue de la épica, propone `/cerrar-epica`.

### Cierre de épica y release: `/cerrar-epica <N>`

1. Comprueba que todas las sub-issues están cerradas y que cada issue fusionada desde la release anterior tiene su fragmento en `changelog.d/`. La release incluye todo lo fusionado hasta ese momento, aunque sea de otra épica.
2. Rama `chore/release-X.Y.0`:
   - versión en los tres `package.json` (backend, frontend y electron);
   - los fragmentos de `changelog.d/` se juntan en `## [X.Y.0] - <fecha>`, agrupados por tema como en la 1.0.0, y se borran con `git rm`;
   - enlaces de comparación al pie;
   - revisión del README contra el código (lista de funciones, capturas).
3. Si la épica cambió pantallas que salen en el README, regenera las capturas con la cartera de demostración (`make demo`, `make demo-datos`). Nunca con los datos reales.
4. Ejecuta la suite e2e completa una sola vez (`npm run test:e2e:local`).
5. **Prueba previa a la release** (es como se encontraron los fallos de la 1.0.0):
   - build de prueba en las tres plataformas, con el workflow `build-test.yml`;
   - el autor instala el `.deb` y lo abre sobre una copia de sus datos de escritorio con `--user-data-dir`.
6. PR de release, revisión del autor y merge con **doble confirmación**.
7. Etiqueta `vX.Y.0` en `main`, con **doble confirmación** aparte: subirla publica la release.
8. Sigue `release.yml` hasta que publique y comprueba los instaladores y las notas.
9. Cierra la épica con un comentario de resumen, cierra el hito y deja el tablero al día.

Los bugs que aparezcan entre releases siguen el mismo ciclo `/issue`, en ramas `fix/`. Por defecto salen con la siguiente minor. Si el autor decide que un bug necesita versión propia, `/cerrar-epica --parche` publica un parche `X.Y.Z` con los pasos 2 a 8, sin cerrar ninguna épica. Ese parche recoge todo lo que haya en `[Unreleased]` en ese momento.

### Paralelismo y consumo de tokens

Ejecutar en paralelo no reduce el consumo total: una issue cuesta lo mismo la haga quien la haga. Lo que hace es gastar antes la ventana de uso de la suscripción. Por eso el ahorro se busca con tres medidas: modelo según la tarea, skills breves y una coordinación que no consulte en bucle.

#### Nivel 1: dentro de cada issue (subagentes)

- La exploración del código la hace un subagente Haiku que devuelve solo las conclusiones.
- La revisión de código (Sonnet) se ejecuta en paralelo con la e2e de los specs afectados.
- El contexto que necesita el subagente va en su prompt. No se le pide que relea lo que la sesión ya sabe.

#### Nivel 2: entre issues (workers de Orca en worktrees)

- **Coordinador:** la sesión principal, con Opus.
  - Elige las issues que pueden ir a la vez, lanza los workers con la skill `orchestration` y se queda esperando su aviso de fin, sin consultarlos en bucle.
  - No lee código. Recibe del worker un resumen corto y el enlace de la PR.
- **Workers:** como máximo dos a la vez.
  - Cada uno trabaja en su worktree con su propio stack Docker, con la cartera de demostración y nunca con los datos reales. El stack se aísla en cuatro puntos:
    - un `COMPOSE_PROJECT_NAME` propio (`cf-wt-<N>`);
    - puertos libres, que asigna `make env`;
    - subredes propias (`BACKEND_NET_SUBNET` y `FRONTEND_NET_SUBNET`), porque las del stack principal son fijas;
    - una carpeta de copias propia, creada antes de arrancar el stack. Si no se fija, el sidecar de backup escribiría en las copias reales del autor.

    La receta exacta está en la skill `/issue`, en su modo worker.
  - Ejecuta `/issue <N>` hasta dejar la PR en borrador, con los tests en verde.
  - Al terminar baja su stack y borra sus volúmenes.
- **Modelo del worker:** Sonnet por defecto. Opus cuando la issue toca fiscalidad, FIFO o migraciones (etiquetas `area/fiscal` o `area/fifo`, o una migración prevista).
- **Qué issues pueden ir a la vez:**
  - de épicas distintas, o de la misma épica si no tocan los mismos ficheros;
  - nunca dos con migración a la vez;
  - nunca una que dependa de otra que no está fusionada (el orden de la hoja de ruta manda).
- **Revisión:** siempre de una en una. Se hace en el checkout principal, contra tu stack con tus datos reales, cambiando a la rama de la PR. Como tu ritmo de revisión marca el ritmo de todo el flujo, no hay más de dos PR por delante de la que estás revisando.
- **e2e completa por turnos:** un fichero de bloqueo fuera del repositorio impide que dos se ejecuten a la vez.
- **Rebase:** cuando se fusiona una PR, el worker o la sesión que tenga la siguiente rebasa su rama sobre `main` antes de pasar la PR a lista.

### Autorización

Las reglas globales del autor piden confirmación antes de cada commit y doble confirmación antes de cada push. Este flujo propone una autorización estable y acotada:

- **Autorizado sin preguntar:** commits y push en ramas de issue (`feat/`, `fix/`, `chore/`, `docs/`) y abrir o actualizar PR en borrador.
- **Siempre con doble confirmación:** merge en `main`, subir etiquetas, publicar o editar releases, borrar cualquier cosa en GitHub y cualquier operación sobre `main` directamente.

El autor la aprobó el 2026-11-27. Queda escrita en el `CLAUDE.md` del proyecto, para que valga en cualquier sesión, y la memoria local del flujo por issue se actualiza para que no la contradiga.

### Continuidad entre sesiones

- El estado es lo que hay en GitHub: tablero (Todo, In Progress, Done), ramas, PR e hitos. Una sesión nueva no necesita memoria previa.
- Si una sesión se corta, `/issue <N>` detecta la rama o la PR existente y retoma desde allí.
- Lo que no se arregla en el momento se convierte en una issue propuesta al autor, con el texto completo, antes de publicarla.

### Errores y bloqueos

- Un test que falla sin causa clara se investiga con depuración sistemática antes de cambiar nada.
- Una herramienta que falla dos veces con el mismo enfoque obliga a cambiar de estrategia o a avisar.
- Un conflicto de merge que toque lógica fiscal, FIFO o de seguridad no se resuelve solo: se presenta al autor.

## Puesta en marcha

1. **PR inicial** `chore: flujo de trabajo del backlog`:
   - este documento, las tres skills y el script de fragmentos;
   - el cambio de `.gitignore`;
   - la carpeta `changelog.d/` con su formato;
   - la regla de autorización y la de e2e por issue en el `CLAUDE.md` del proyecto;
   - el enlace en el README.

   Además se actualiza la memoria local del flujo por issue, que no forma parte de la PR.
2. Tareas en GitHub: vincular #646 como sub-issue de #486, crear los hitos `1.1.0` a `1.4.0` y asignarles las issues.
3. **Piloto:** `/issue 554` como primera issue real. Al terminarla se ajustan las skills con lo aprendido, en la misma rama de la siguiente issue o en una PR aparte.

## Lo que queda al constructor

- La redacción exacta de las skills y de la plantilla de la PR.
- Cómo calcular la «siguiente issue» y qué pares pueden ir a la vez (orden de la tabla de este documento o de las sub-issues de la épica).
- Los comandos concretos de Orca para lanzar workers en worktrees y recibir su aviso de fin (skill `orchestration`), y cómo dar a cada worktree su stack aislado.
- El formato de los fragmentos de `changelog.d/` y el script que los junta.
- Los comandos concretos de Orca para abrir el navegador en la pantalla afectada.
- Si conviene un script auxiliar (por ejemplo, `scripts/backlog/`) para el tablero y los hitos, o basta con `gh` desde la skill.
