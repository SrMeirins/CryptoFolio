# Verificación de saldos on-chain — diseño

**Fecha:** 2026-08-25
**Estado:** Aprobado por el usuario, pendiente de plan de implementación
**Clasificación:** Architectural (nuevo subsistema, catálogo extensible multi-red)

## Contexto y motivación

Durante la auditoría del dominio "Importación CSV" se detectó y corrigió una discrepancia real
entre el saldo calculado por el motor FIFO y el saldo real en la wallet fría de XRP, causada por
una fee de retiro de Binance (0.2 XRP) no capturada en el CSV importado. La corrección se hizo
manualmente, consultando la API pública de xrpscan.com.

Esta funcionalidad automatiza esa verificación para todos los activos con wallet fría conocida,
de forma recurrente, para detectar discrepancias similares sin depender de que el usuario las
note por comparación manual.

El esquema de base de datos ya contemplaba parcialmente esto: las tablas `wallet_addresses` y
`networks` existen desde antes, con columnas `last_sync_at` / `last_known_balance` ya leídas
(pero nunca escritas) por `backend/src/routes/wallets.ts`. El catálogo `networks` ya incluye 11
redes precargadas (XRP Ledger, Ethereum, Solana, BNB Chain, Cardano, HBAR, Stellar, Polkadot
Asset Hub, Bitcoin, Avalanche, Tron). `wallet_addresses` tiene actualmente 0 filas — la
funcionalidad no está conectada a ningún dato real.

## Alcance v1

Todas las redes donde el usuario tiene wallets frías activas, desde el primer momento:

| Red | Activo(s) | Proveedor | Requiere API key |
|---|---|---|---|
| XRP Ledger | XRP | xrpscan.com API | No |
| Hedera | HBAR | Hedera Mirror Node REST API (`mainnet-public.mirrornode.hedera.com`) | No |
| Stellar | XLM | Horizon API (`horizon.stellar.org`) | No |
| Bitcoin | BTC | Blockstream Esplora API (`blockstream.info/api`) | No |
| Ethereum | ETH, LINK (ERC-20) | Etherscan API v2 | Sí |
| Solana | SOL | RPC público (`getBalance`) | No (endpoint compartido, rate-limited) |
| Cardano | ADA | Blockfrost API | Sí |
| Polkadot Asset Hub | DOT | Subscan API | Sí |

El catálogo queda abierto: añadir una red futura no seguida hoy (Avalanche, Tron, BNB Chain, u
otra) es implementar un nuevo `BalanceProvider` y registrarlo — sin tocar el resto del sistema.

## Modelo de datos

`wallet_addresses` no cambia. El esquema ya modela tokens sobre una red mediante la tabla
`network_assets` (`network_id`, `asset`, `contract_address`), pre-cargada con LINK/USDC/ONDO
sobre Ethereum y WIF/PYTH sobre Solana — se reutiliza tal cual: por cada `wallet_addresses` con
`network_id` dado, el motor de sync verifica el activo nativo de esa red (`networks.native_asset`)
y, además, cada fila de `network_assets` asociada a ese mismo `network_id` (misma dirección,
verificación del contrato del token).

### Nueva tabla `network_api_keys`
```sql
CREATE TABLE network_api_keys (
  network_id UUID PRIMARY KEY REFERENCES networks(id),
  api_key_encrypted BYTEA NOT NULL,
  api_key_iv BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```
Override opcional desde la UI. Si no hay fila para una red, se usa la variable de entorno
correspondiente (`ETHERSCAN_API_KEY`, `BLOCKFROST_API_KEY`, `SUBSCAN_API_KEY`) como fallback.

### Nueva tabla `balance_sync_log`
```sql
CREATE TABLE balance_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address_id UUID NOT NULL REFERENCES wallet_addresses(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,              -- activo verificado en esta fila (nativo o token, ej. XRP, LINK)
  checked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  onchain_balance NUMERIC,
  expected_balance NUMERIC,
  discrepancy_pct NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('ok', 'discrepancy', 'error'))
);
CREATE INDEX idx_balance_sync_log_wallet_address ON balance_sync_log(wallet_address_id, checked_at DESC);
```
Histórico de cada verificación (automática o manual), una fila por `(wallet_address_id, asset)`
comprobado. Retención: se purgan filas con más de 90 días de antigüedad al final de cada
ejecución del job diario (no hay cron independiente para esto).

## Seguridad

- **Cifrado de API keys**: AES-256-GCM. IV de 12 bytes generado con `crypto.randomBytes` en cada
  operación de cifrado, nunca reutilizado. Clave maestra en la variable de entorno
  `WALLET_SYNC_ENCRYPTION_KEY` (32 bytes, generada con `openssl rand -base64 32`), nunca
  hardcodeada ni versionada.
- **Nunca se serializa `api_key_encrypted`** en ninguna respuesta de la API. Los endpoints que
  consultan `network_api_keys` devuelven únicamente `{network_id, has_key: boolean, updated_at}`.
- **Errores de proveedor**: se registran de forma genérica ("fallo de autenticación con proveedor
  X"), nunca incluyendo la API key ni el payload completo de la petición en logs.
- **`custom_explorer_url`** (columna ya existente en `wallet_addresses`) se usa exclusivamente
  para construir el enlace "ver en explorador" en la UI. Nunca se usa para disparar la llamada
  HTTP real de verificación de saldo — esto evita SSRF vía URL controlada por el usuario. Las
  URLs base de cada proveedor están hardcodeadas en su adaptador, no en base de datos.
- **Timeouts explícitos**: cada llamada de `BalanceProvider.getBalance()` lleva timeout (8s).
- **Circuit breaker simple por proveedor**: tras N fallos consecutivos (N=3) en ejecuciones
  sucesivas, ese proveedor se salta en el siguiente ciclo del job y se registra
  `status='error'` en `balance_sync_log`, sin bloquear la sincronización del resto de redes.
- **Aislamiento por fila**: un fallo en un proveedor (ej. Solana caído) no aborta el resto del
  lote — cada verificación se envuelve individualmente (fail-secure por fila).

## Arquitectura de proveedores

```ts
interface BalanceProvider {
  requiresApiKey: boolean;
  getBalance(address: string, contractAddress?: string): Promise<number>;
}
```
Un archivo por red (`backend/src/modules/walletSync/providers/xrplProvider.ts`,
`etherscanProvider.ts`, `hederaProvider.ts`, `stellarProvider.ts`, `blockstreamProvider.ts`,
`solanaProvider.ts`, `blockfrostProvider.ts`, `subscanProvider.ts`), registrado en
`providers/registry.ts` mediante un `Record<string, BalanceProvider>` **keyed por
`networks.name`** (no hay columna `code` en `networks`; el nombre ya es `UNIQUE` y estable —
'XRP Ledger', 'Ethereum', 'Solana', 'Cardano', 'HBAR', 'Stellar', 'Polkadot Asset Hub',
'Bitcoin'). Añadir una red nueva = un archivo nuevo + una línea de registro con su nombre exacto.

## Motor de sincronización

`backend/src/modules/walletSync/walletSync.ts`:

1. Por cada fila de `wallet_addresses` (con `address` no nulo): resuelve el `BalanceProvider` por
   `networks.name`. Si no hay proveedor registrado para esa red (red personalizada del usuario),
   se omite sin error.
2. Llama `getBalance(address)` para el activo nativo, y `getBalance(address, contract_address)`
   por cada fila de `network_assets` de esa misma red — con timeout + circuit breaker.
3. Calcula el saldo esperado, por cada activo (`asset`): suma de `fifo_lots` abiertos filtrados
   por `wallet_id` (el mismo `wallet_id` vinculado a esa dirección) y ese activo.
4. Compara: si `|onchain - expected| / expected > 0.5%` → `status='discrepancy'`; si falla la
   llamada → `status='error'`; si no → `status='ok'`.
5. Escribe una fila en `balance_sync_log` por `(wallet_address_id, asset)`. Además, actualiza
   `wallet_addresses.last_known_balance` / `last_sync_at` con el resultado del **activo nativo**
   de la red (es el que ya sirve `GET /api/wallets`; el detalle por token queda en
   `balance_sync_log`, consultado aparte por la UI para pintar el badge).
6. Al final, purga `balance_sync_log` de filas >90 días.

**Disparo**: `node-cron` diario dentro del proceso backend (consistente con cómo ya arranca
`runMigrations()` al boot, sin infraestructura nueva). Adicionalmente, un endpoint
`POST /api/wallets/:walletId/addresses/:addressId/sync` para el botón manual "Verificar ahora"
por fila, que ejecuta el mismo flujo (activo nativo + todos los tokens de esa red) para una sola
`wallet_address_id` y devuelve el array de resultados.

## UI/UX

Todo vive dentro de la pantalla ya existente `frontend/src/pages/settings/WalletsSection.tsx`,
sin pantallas nuevas:

- **Badge de estado por fila**: 🟢 "Verificado" + fecha · 🟡 "Revisar" (discrepancia) · ⚪
  "Pendiente" (sin sincronizar aún, o red sin API key) · 🔴 "Sin conexión" (fallos consecutivos).
- Al pulsar el badge 🟡 se despliega una línea en lenguaje llano: *"Saldo real en blockchain: X ·
  Saldo calculado en la app: Y · Diferencia: Z"* — sin jerga técnica, sin exponer
  `discrepancy_pct` crudo ni logs.
- **Botón discreto "Verificar ahora"** por fila, junto al badge — dispara el endpoint manual sin
  esperar al ciclo diario. Útil para comprobar al momento si una corrección funcionó (como se
  hizo manualmente con XRP durante la auditoría).
- **Configuración de API key**: solo visible en redes que la requieren (Ethereum/LINK, Solana no
  aplica, Cardano, Polkadot). Campo opcional con texto de ayuda: *"Sin esta clave, esta red no se
  puede verificar automáticamente — puedes dejarla vacía"*. Si ya hay valor por variable de
  entorno, se muestra "Configurada desde el servidor ✓" en vez de un campo vacío que induzca a
  pensar que no hay ninguna key activa.

## Testing

- `providers/*.test.ts` por cada adaptador: mock de `fetch`, casos de respuesta válida, dirección
  inexistente, timeout, error 5xx/rate-limit. Ninguno debe lanzar sin capturar ni filtrar la API
  key en mensajes de error.
- `walletSync.test.ts`: proveedor fake inyectado. Cubre cálculo del saldo esperado (suma de lotes
  FIFO por `wallet_id`), umbral 0.5% (límite inferior/superior), aislamiento de fallos entre
  proveedores, escritura correcta en `balance_sync_log`.
- Cifrado de `network_api_keys`: test de round-trip (cifrar → guardar → leer → descifrar = valor
  original) y test de que ningún endpoint serializa `api_key_encrypted`.
- Retención: test de que la purga de `balance_sync_log` solo borra filas >90 días.
- Sin tests de integración contra las APIs externas reales en CI (frágiles, dependen de red); la
  verificación contra datos reales se hace manualmente una vez por red al implementarla, siguiendo
  el mismo patrón usado para validar la corrección de XRP.

## Fuera de alcance (v1)

- Corrección automática de discrepancias — solo aviso visual, la decisión de corregir queda en el
  usuario (igual que se hizo manualmente con XRP).
- Sincronización en tiempo real o por webhook — solo diaria + manual bajo demanda.
- Redes no usadas actualmente por el usuario (Avalanche, Tron, BNB Chain) — catálogo ya
  preparado, se implementan cuando haya una wallet real que las use.
