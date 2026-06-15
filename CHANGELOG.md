# Changelog

Todos los cambios notables de CryptoFolio se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y el proyecto usa [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.0.6] - 2026-06-15

### Corregido

- **Detección de Administrador en Windows** — el check anterior (`reg query HKLM\SECURITY`) solo detectaba UAC elevado; PostgreSQL bloquea a cualquier miembro del grupo Administrators aunque no tenga elevación. Ahora se usa `whoami /groups` buscando el SID `S-1-5-32-544`, que es la misma comprobación que hace PostgreSQL internamente.
- **"Error desconocido" al fallar PostgreSQL** — `embedded-postgres` lanzaba `null` en lugar de un `Error` cuando el proceso postgres fallaba al arrancar. Ahora se captura el stderr vía `onError` y se convierte a un mensaje legible. Si el stderr contiene "administrative", se muestra el mensaje de solución correcto.

## [0.0.5] - 2026-06-15

### Añadido

- **Auto-update al arrancar** — antes de levantar PostgreSQL, la app consulta GitHub Releases con timeout de 6 s. Si hay versión nueva, muestra un diálogo preguntando si actualizar ahora o más tarde. Si el usuario acepta, descarga e instala automáticamente (con progreso visible en el splash screen). Si pospone, la descarga continúa en segundo plano.
- **Banner de actualización en la UI** — si el usuario pospone la actualización, aparece una barra azul persistente en la parte superior con la versión disponible y el botón "Reiniciar y actualizar" (activo al terminar la descarga en segundo plano).
- **Comprobación periódica** — cada hora se comprueba si hay versión nueva publicada; si la hay, el banner aparece sin necesidad de reiniciar la app.

### Notas

El auto-updater solo detecta releases **publicadas** en GitHub (no drafts). Publica cada release antes de que los usuarios puedan actualizar.

## [0.0.4] - 2026-06-15

### Corregido

- **Windows — codificación WIN1252** — en sistemas Windows con locale regional, PostgreSQL se inicializaba con WIN1252 en lugar de UTF-8, lo que hacía fallar cualquier insert con caracteres como `→`, `—` o tildes en campos de texto. Los clústeres nuevos se crean ahora con `--encoding=UTF8 --locale=C`. Los clústeres existentes con codificación incorrecta se re-inicializan automáticamente al arrancar (los datos se pierden pero pueden re-importarse desde los CSV originales)

## [0.0.3] - 2026-06-15

### Añadido

- **Splash screen** — pantalla de carga animada mientras arrancan PostgreSQL y el backend

### Corregido

- **Windows — "Ejecutar como administrador"** — PostgreSQL rechaza arrancar con privilegios elevados; ahora se detecta antes del arranque y se muestra un mensaje claro indicando que hay que abrir la app sin permisos de administrador
- **Crash al mostrar error de arranque** — si el error lanzado por embedded-postgres no era una instancia de `Error`, el diálogo de fallo fallaba a su vez con `UnhandledPromiseRejection`; corregido con manejo defensivo del tipo de error

## [0.0.2] - 2026-06-15

### Corregido

#### Importación

- **BETH sin precio** — BETH (Binance staked ETH, retirado en 2023) ahora resuelve su precio usando ETH directamente (ratio 1:1), evitando llamadas fallidas a Binance y CoinGecko que bloqueaban el import durante minutos por rate-limit
- Añadidos aliases de precio para tokens 1:1: `BETH→ETH`, `WETH→ETH`, `WBTC→BTC`, `BTCB→BTC`
- **Rate limit 429 de CoinGecko** — si CoinGecko no devuelve datos históricos para un símbolo, las fechas restantes de ese símbolo se saltan en la misma sesión, evitando la cascada de llamadas que agotaban el límite de peticiones
- **Caché de precio cero** — los precios no encontrados ya no se persisten como `0` en la base de datos; cada importación futura reintentará la consulta correctamente

#### UI de importación

- **Consola siempre visible** — el log de progreso se muestra en tiempo real durante toda la importación, no solo al finalizar
- **Auto-scroll del log** — la consola se desplaza automáticamente al último mensaje recibido
- **Barra de progreso real en fase de precios** — la barra de "Precios hist." muestra el porcentaje real (`N/total`) en lugar de un indicador estático al 50%

## [0.0.1] - 2026-06-14

> **Alpha** — versión funcional en pruebas. No recomendada para uso en producción sin supervisión.

### Añadido

#### Aplicación de escritorio (Electron)

- App nativa para **Windows** (NSIS installer), **macOS** (DMG universal) y **Linux** (deb)
- PostgreSQL embebido: la base de datos se gestiona automáticamente, sin configuración
- Backend Express arranca en segundo plano escuchando solo en `127.0.0.1` (no expuesto a la red)
- Auto-updater: notifica y aplica actualizaciones desde GitHub Releases
- Runner de migraciones automático al arrancar en modo standalone
- CI/CD con GitHub Actions: build matrix en Ubuntu, macOS y Windows en cada tag `vX.Y.Z`

#### Importación de operaciones Binance

- Soporte completo para **19 tipos de operación** de Binance CSV (Spot, Funding, Earn, Strategy)
- `BUY / SELL` — operaciones de compra/venta spot y swaps cripto↔cripto
- `STAKING_REWARD` — recompensas de staking (ETH Staking, Simple Earn Locked Rewards)
- `LENDING_INTEREST / LENDING_INTEREST_LOCKED` — intereses de Simple Earn Flexible/Locked
- `AIRDROP` — airdrops, cashback, Token Swap Distribution, Launchpool claim/distribution
- `CASHBACK` — reembolsos y referidos
- `STAKING_LOCK / STAKING_UNLOCK` — bloqueo y desbloqueo de activos en staking
- `LAUNCHPOOL_LOCK / LAUNCHPOOL_UNLOCK` — ciclos de participación en launchpool
- `TRANSFER_INTERNAL` — transferencias entre cuentas Spot↔Strategy, grid bots multi-activo
- `DEPOSIT_FIAT / WITHDRAW_FIAT` — movimientos fiat en EUR
- `DEPOSIT_CRYPTO / WITHDRAW` — movimientos cripto con coste personalizable
- `FEE_EXCHANGE` — comisiones de trading pagadas en BNB (Strategy Fee Rebate)
- Cuenta **Strategy** (grid trading bots): soportada con todos sus tipos de operación

#### Portfolio y fiscalidad

- Cálculo FIFO conforme a la normativa española (IRPF)
- Exportación de informe fiscal PDF para la declaración de la renta
- Valoración de activos con precios históricos de CoinGecko
- Historial de operaciones con coste en activo origen para swaps cripto↔cripto

#### Seguridad

- Validación de magic bytes en subida de ficheros CSV (bloquea EXE/ELF/PDF/ZIP/JPEG/PNG)
- Validación de esquema en parámetros JSON para prevenir prototype pollution
- `parseYear()` con rango 2009–2100 en rutas fiscales
- `validateSymbol()` con regex `/^[A-Z0-9]{1,20}$/` en rutas de settings
- CSP restrictivo: `connect-src` limitado a la API de Binance y CoinGecko exactamente
- Frontend Docker: proceso Vite no corre como root (`USER node`)
- Electron: `contextIsolation`, `sandbox`, sin `nodeIntegration`, navegación externa bloqueada

---

## Cómo añadir una entrada

Antes de hacer un nuevo tag, añade una sección `## [X.Y.Z] - YYYY-MM-DD` encima de la anterior
con los cambios agrupados en: **Añadido**, **Cambiado**, **Corregido**, **Eliminado**, **Seguridad**.

[Unreleased]: https://github.com/SrMeirins/CryptoFolio/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/SrMeirins/CryptoFolio/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/SrMeirins/CryptoFolio/releases/tag/v0.0.1
