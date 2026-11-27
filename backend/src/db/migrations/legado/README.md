# migrations/legado/

Puente de actualización para bases de datos creadas **antes del squash de la
PR #116** (6 de octubre de 2026), es decir, por las releases públicas v0.0.1 a
v0.0.14 o por instalaciones de esa época.

El squash integró las migraciones `002` a `024` en `schema.sql` y las borró,
suponiendo que no había instalaciones reales. Las había (releases públicas con
instaladores), y sin estas migraciones su base no podía actualizarse: la `011`
actual fallaba por la tabla `balance_sync_log`, que nunca se creaba.

## Cómo se aplica

`run-migrations.ts` recorre esta carpeta solo si la base ya existía y no tiene
el dominio `eur_amount`. Ese dominio se creó justo antes del squash (#115) y
ninguna migración antigua lo usa, así que su ausencia identifica una base
anterior. Aplica, en orden, las que no estén registradas en
`schema_migrations` (cada una con su nombre original) y después las
migraciones actuales del directorio superior.

- `002` a `024`: copia literal de las migraciones borradas (`git show
  fcf1856^:backend/src/db/migrations/<fichero>`).
- `025_paridad_esquema_actual.sql`: lo que falta para igualar `schema.sql`
  (elimina una vista retirada y crea el dominio `eur_amount`, que marca el
  puente como aplicado).

Las instalaciones nuevas y las de Docker creadas desde `schema.sql` ya tienen
el dominio y nunca pasan por aquí.

## Reglas

- No editar estas migraciones: son las que se aplicaron en su día.
- No añadir migraciones nuevas aquí: las nuevas van en el directorio superior.
- El test `src/db/actualizacionDesde0014.test.ts` actualiza una base creada con
  el `schema.sql` de la v0.0.14 y la compara con una instalación nueva.
