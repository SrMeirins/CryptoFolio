# Fragmentos de CHANGELOG

Cada PR que cambia algo visible para quien usa la app añade un fragmento
`changelog.d/<N>.md`, donde `<N>` es el número de la PR o de la issue. Así dos PR
en paralelo no se pisan editando la misma sección de `CHANGELOG.md`.

Al cerrar la release, `/cerrar-epica` ejecuta `node scripts/changelog/juntar.mjs <version> <fecha>`,
que compone la sección `## [X.Y.Z] - YYYY-MM-DD`, actualiza los enlaces del pie y
lista los fragmentos consumidos para borrarlos con `git rm`.

## Formato

```markdown
### Cambiado

- Historial: tabla con anchos fijos y totales por día (#554).
```

- Cada fragmento tiene una o varias subsecciones `### <Nombre>`, cada una con al menos una viñeta `- ...`.
- Subsecciones permitidas, en el orden en que salen en la release: Añadido, Cambiado, Obsoleto, Eliminado, Corregido, Seguridad.
- No hay texto fuera de las viñetas. Una viñeta larga puede seguir en líneas indentadas.
- Dentro de cada subsección, las viñetas salen ordenadas por el número del fichero.
- Si el fragmento no cumple el formato, el script falla con el nombre del fichero y no toca `CHANGELOG.md`.
