# Changelog

Todos los cambios notables de CryptoFolio se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y el proyecto usa [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

[Unreleased]: https://github.com/SrMeirins/CryptoFolio/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/SrMeirins/CryptoFolio/releases/tag/v0.0.1
