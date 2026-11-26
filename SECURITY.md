# Política de seguridad

CryptoFolio es un proyecto privado mantenido por su titular. Esta política
recoge cómo se gestionan la seguridad del código y la de sus dependencias.

## Versiones soportadas

Solo la **última versión publicada** recibe correcciones de seguridad.

## Dependencias

- Todas las dependencias se fijan con **versión exacta** (lo comprueba el CI con `scripts/check-exact-versions.mjs`), en `backend`, `frontend`, `electron` y la raíz del repositorio, que solo tiene herramientas de desarrollo.
- Una versión nueva solo se adopta cuando lleva **al menos 2 semanas publicada**, para dar tiempo a detectar paquetes comprometidos o defectuosos.
- **Excepción:** las correcciones de avisos de seguridad de severidad **alta o crítica** se adoptan sin esperar. Las de severidad moderada o baja siguen la regla general.
- El CI ejecuta la auditoría con `scripts/audit.mjs`: falla con avisos altos o críticos sin corregir. Un aviso sin corrección disponible puede aceptarse de forma **temporal** en `scripts/audit-exceptions.json`, con motivo, issue de seguimiento y fecha de caducidad; al caducar, el CI vuelve a fallar.
- Dependabot avisa de las dependencias con vulnerabilidades conocidas.

## Cómo se registra una vulnerabilidad

El repositorio es privado: una vulnerabilidad se registra como **issue** con la
plantilla «Bug» y el título empezando por «Seguridad:», indicando:

- Qué componente se ve afectado (backend, frontend, app de escritorio, Docker).
- Pasos para reproducirlo o una prueba de concepto.
- Impacto estimado (qué podría hacer un atacante).

Nunca se incluyen datos reales ni credenciales válidas.

## Datos del usuario

La aplicación es local: los datos (operaciones, wallets, copias de seguridad)
se guardan en el equipo de quien la usa y no se envían a servidores propios.
Las conexiones externas son consultas de solo lectura a servicios públicos:
precios y datos de activos (Binance y CoinGecko, también los logos),
banderas de países y, en algunas comprobaciones, exploradores de bloques. Las
consultas de precios se pueden desactivar con la variable de entorno
`PRICE_SOURCES_OFFLINE=true`.
