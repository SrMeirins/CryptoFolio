# migrations/

Migraciones SQL aplicadas, en orden, por `run-migrations.ts` sobre bases de
datos **ya desplegadas** (standalone/Electron — en Docker el schema se aplica
vía `docker-entrypoint-initdb.d`). No confundir con `schema.sql`, que define
el estado completo para instalaciones nuevas.

## Historial pre-lanzamiento squasheado

Las migraciones `002` a `024` (desde el enum `operation_type` inicial hasta
hacer explícito `ON DELETE RESTRICT` en las FK restantes) se integraron por
completo en `schema.sql` y se eliminaron de este directorio: en el momento de
hacerlo no existía ninguna instancia externa real (beta tester, despliegue
Docker fuera del entorno de desarrollo) cuya base de datos dependiera de
aplicarlas — los tags/releases hasta ese punto fueron pruebas internas.
Verificado exhaustivamente antes de borrarlas: cada cambio estructural y de
datos de las 23 migraciones ya estaba reflejado en `schema.sql` (incluidas
correcciones de datos como el mapeo de LUNC o los `contract_address` de
Solana, ya horneadas en los `INSERT` semilla).

El historial completo de cada migración sigue disponible en `git log` /
`git show` sobre este directorio — nada se pierde, solo deja de ser necesario
para instalaciones nuevas.

## Convención para migraciones futuras

A partir de aquí, cualquier cambio de esquema sobre una base de datos ya
desplegada con datos reales empieza de nuevo en `001_descripcion.sql`
(formato `NNN_descripcion.sql`, validado por `run-migrations.ts`) — **y debe
reflejarse también en `schema.sql`** para que las instalaciones nuevas no
dependan de reproducir el historial de migraciones.
