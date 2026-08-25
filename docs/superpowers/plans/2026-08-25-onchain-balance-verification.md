# Verificación de Saldos On-Chain — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verificar automáticamente (diario + botón manual) que el saldo real en blockchain de cada wallet fría coincide con el saldo calculado por el motor FIFO, para el activo nativo y cualquier token conocido de cada red, mostrando un aviso simple en la UI cuando no coincidan.

**Architecture:** Un catálogo de adaptadores (`BalanceProvider`) por red, uno por archivo, registrado por nombre en `providers/registry.ts`. Un motor de sincronización (`walletSync.ts`) itera `wallet_addresses`, resuelve el proveedor, compara el saldo on-chain contra la suma de lotes FIFO abiertos (`fifo_lots`) del mismo `wallet_id`+activo, y escribe el resultado en `balance_sync_log`. Disparo por `node-cron` diario y por un endpoint manual. Las API keys de proveedores que las requieren se cifran (AES-256-GCM) en `network_api_keys`, con fallback a variables de entorno.

**Tech Stack:** Node/Express/TypeScript (backend), PostgreSQL (`pg`), Vitest, `node-cron`, `crypto` nativo de Node (sin dependencias de cifrado nuevas), React/TanStack Query (frontend).

**Spec:** `docs/superpowers/specs/2026-08-25-onchain-balance-verification-design.md`

## Global Constraints

- Cifrado de API keys: AES-256-GCM, IV de 12 bytes único por operación (`crypto.randomBytes(12)`), clave maestra en `WALLET_SYNC_ENCRYPTION_KEY` (32 bytes, base64), nunca hardcodeada ni logueada.
- `api_key_encrypted` nunca se serializa en respuestas HTTP — solo `{network_id, has_key, updated_at}`.
- `custom_explorer_url` (columna de `wallet_addresses`) nunca se usa para disparar peticiones HTTP reales — solo para el link "ver en explorador" del frontend. Las URLs base de cada proveedor van hardcodeadas en su adaptador.
- Toda llamada HTTP saliente (`BalanceProvider.getBalance`) lleva timeout explícito de 8000ms vía `AbortController`.
- Circuit breaker por proveedor: 3 fallos consecutivos → se salta ese proveedor en el siguiente ciclo, registrando `status='error'`.
- Umbral de discrepancia: `|onchain - expected| / expected > 0.005` (0.5%); si `expected === 0`, cualquier `onchain` por encima de `1e-6` (mismo `FIFO_DUST_EPSILON` del motor FIFO) cuenta como discrepancia.
- Ninguna llamada a proveedor externo debe lanzar una excepción sin capturar — todas resuelven `{ok: true, balance} | {ok: false, error}`.
- Todo cambio de esquema va tanto en un archivo de migración nuevo (`db/migrations/016_...sql`) como horneado directamente en `db/schema.sql` (patrón ya establecido en el proyecto — `createTestDatabase()` aplica `schema.sql`, no las migraciones, para los tests).
- Comentarios de código en castellano, solo cuando expliquen el porqué (no el qué).

---

## Task 1: Migración de esquema — `network_api_keys` y `balance_sync_log`

**Files:**
- Create: `backend/src/db/migrations/016_wallet_sync.sql`
- Modify: `backend/src/db/schema.sql` (añadir las dos tablas nuevas, después de la sección `wallet_addresses`, antes de `csv_imports`)
- Test: `backend/src/modules/walletSync/schema.test.ts`

**Interfaces:**
- Produces: tablas `network_api_keys(network_id UUID PK, api_key_encrypted BYTEA, api_key_iv BYTEA, updated_at TIMESTAMPTZ)` y `balance_sync_log(id UUID PK, wallet_address_id UUID, asset TEXT, checked_at TIMESTAMPTZ, onchain_balance NUMERIC, expected_balance NUMERIC, discrepancy_pct NUMERIC, status TEXT)`.

- [ ] **Step 1: Escribir el test que verifica el esquema (falla porque las tablas no existen)**

```ts
// backend/src/modules/walletSync/schema.test.ts
import { describe, expect, it, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

let testDb: TestDatabase;

describe('esquema — network_api_keys y balance_sync_log', () => {
  it('crea ambas tablas con las columnas esperadas', async () => {
    testDb = await createTestDatabase();
    const pool = new Pool({ connectionString: testDb.connectionString });
    try {
      const keys = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'network_api_keys' ORDER BY column_name
      `);
      expect(keys.rows.map(r => r.column_name)).toEqual(
        ['api_key_encrypted', 'api_key_iv', 'network_id', 'updated_at']
      );

      const log = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'balance_sync_log' ORDER BY column_name
      `);
      expect(log.rows.map(r => r.column_name)).toEqual([
        'asset', 'checked_at', 'discrepancy_pct', 'expected_balance',
        'id', 'onchain_balance', 'status', 'wallet_address_id',
      ]);
    } finally {
      await pool.end();
    }
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/schema.test.ts`
Expected: FAIL — `relation "network_api_keys" does not exist`

- [ ] **Step 3: Escribir la migración**

```sql
-- backend/src/db/migrations/016_wallet_sync.sql
-- ============================================================
-- Migración 016_wallet_sync
-- Qué: crea network_api_keys (override cifrado de API keys por red) y
--      balance_sync_log (histórico de verificaciones de saldo on-chain).
-- Por qué: soporte de la verificación automática de saldos on-chain vs.
--          saldo calculado por el motor FIFO (diseño en
--          docs/superpowers/specs/2026-08-25-onchain-balance-verification-design.md).
-- ============================================================

CREATE TABLE IF NOT EXISTS network_api_keys (
  network_id         UUID PRIMARY KEY REFERENCES networks(id) ON DELETE CASCADE,
  api_key_encrypted  BYTEA NOT NULL,
  api_key_iv         BYTEA NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS balance_sync_log (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address_id  UUID NOT NULL REFERENCES wallet_addresses(id) ON DELETE CASCADE,
  asset              TEXT NOT NULL,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  onchain_balance    NUMERIC,
  expected_balance   NUMERIC,
  discrepancy_pct    NUMERIC,
  status             TEXT NOT NULL CHECK (status IN ('ok', 'discrepancy', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_balance_sync_log_wallet_address
  ON balance_sync_log(wallet_address_id, checked_at DESC);
```

- [ ] **Step 4: Hornear el mismo cambio en `schema.sql`**

En `backend/src/db/schema.sql`, justo después del bloque `CREATE INDEX idx_wallet_addresses_network ...` (línea ~145) e inmediatamente antes de `-- TABLA: csv_imports`, añadir:

```sql
-- ============================================================
-- TABLA: network_api_keys
-- ============================================================
CREATE TABLE network_api_keys (
  network_id         UUID PRIMARY KEY REFERENCES networks(id) ON DELETE CASCADE,
  api_key_encrypted  BYTEA NOT NULL,
  api_key_iv         BYTEA NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================
-- TABLA: balance_sync_log
-- ============================================================
CREATE TABLE balance_sync_log (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address_id  UUID NOT NULL REFERENCES wallet_addresses(id) ON DELETE CASCADE,
  asset              TEXT NOT NULL,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  onchain_balance    NUMERIC,
  expected_balance   NUMERIC,
  discrepancy_pct    NUMERIC,
  status             TEXT NOT NULL CHECK (status IN ('ok', 'discrepancy', 'error'))
);

CREATE INDEX idx_balance_sync_log_wallet_address ON balance_sync_log(wallet_address_id, checked_at DESC);
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/migrations/016_wallet_sync.sql backend/src/db/schema.sql backend/src/modules/walletSync/schema.test.ts
git commit -m "feat(db): añadir network_api_keys y balance_sync_log"
```

---

## Task 2: Cifrado de API keys (AES-256-GCM)

**Files:**
- Create: `backend/src/modules/walletSync/apiKeyCrypto.ts`
- Test: `backend/src/modules/walletSync/apiKeyCrypto.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function encryptApiKey(plaintext: string): { encrypted: Buffer; iv: Buffer };
  export function decryptApiKey(encrypted: Buffer, iv: Buffer): string;
  ```
  Ambas leen `process.env.WALLET_SYNC_ENCRYPTION_KEY` (base64, 32 bytes) en cada llamada — lanzan si falta o tiene longitud incorrecta.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/apiKeyCrypto.test.ts
import { describe, expect, it, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
import { encryptApiKey, decryptApiKey } from './apiKeyCrypto';

beforeAll(() => {
  process.env.WALLET_SYNC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('apiKeyCrypto', () => {
  it('round-trip: cifrar y descifrar devuelve el valor original', () => {
    const plaintext = 'ETHERSCAN_API_KEY_DE_PRUEBA_12345';
    const { encrypted, iv } = encryptApiKey(plaintext);
    expect(decryptApiKey(encrypted, iv)).toBe(plaintext);
  });

  it('IVs distintos en cada llamada, aunque el texto plano sea el mismo', () => {
    const a = encryptApiKey('misma-key');
    const b = encryptApiKey('misma-key');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.encrypted.equals(b.encrypted)).toBe(false);
  });

  it('lanza si falta WALLET_SYNC_ENCRYPTION_KEY', () => {
    const saved = process.env.WALLET_SYNC_ENCRYPTION_KEY;
    delete process.env.WALLET_SYNC_ENCRYPTION_KEY;
    expect(() => encryptApiKey('x')).toThrow();
    process.env.WALLET_SYNC_ENCRYPTION_KEY = saved;
  });

  it('lanza al descifrar si el authTag no coincide (datos corrompidos)', () => {
    const { encrypted, iv } = encryptApiKey('valor-original');
    const corrupted = Buffer.from(encrypted);
    corrupted[0] ^= 0xff;
    expect(() => decryptApiKey(corrupted, iv)).toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/apiKeyCrypto.test.ts`
Expected: FAIL — módulo `./apiKeyCrypto` no existe

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/apiKeyCrypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function loadMasterKey(): Buffer {
  const b64 = process.env.WALLET_SYNC_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error('WALLET_SYNC_ENCRYPTION_KEY no está definida — genera una con: openssl rand -base64 32');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('WALLET_SYNC_ENCRYPTION_KEY debe decodificar a 32 bytes (AES-256)');
  }
  return key;
}

// El authTag (16 bytes) se concatena al final del ciphertext — un único
// campo BYTEA en BD en vez de una tercera columna, sin perder verificación
// de integridad de GCM.
export function encryptApiKey(plaintext: string): { encrypted: Buffer; iv: Buffer } {
  const key = loadMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([ciphertext, authTag]), iv };
}

export function decryptApiKey(encrypted: Buffer, iv: Buffer): string {
  const key = loadMasterKey();
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(0, encrypted.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/apiKeyCrypto.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Añadir la variable a `.env.example`**

En `.env.example`, dentro de la sección `# ── Seguridad ──`, después de `JWT_SECRET`:

```
# Cifrado de API keys de proveedores de verificación on-chain (ver network_api_keys)
# Genera con: openssl rand -base64 32
WALLET_SYNC_ENCRYPTION_KEY=cambia_esto                # ← cambia esto
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/walletSync/apiKeyCrypto.ts backend/src/modules/walletSync/apiKeyCrypto.test.ts .env.example
git commit -m "feat(walletSync): cifrado AES-256-GCM de API keys de proveedores"
```

---

## Task 3: Interfaz `BalanceProvider` y registro

**Files:**
- Create: `backend/src/modules/walletSync/providers/types.ts`
- Create: `backend/src/modules/walletSync/providers/registry.ts`
- Test: `backend/src/modules/walletSync/providers/registry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface BalanceResult { ok: true; balance: number } | { ok: false; error: string };
  export interface BalanceProvider {
    requiresApiKey: boolean;
    getBalance(address: string, apiKey: string | undefined, contractAddress?: string): Promise<BalanceResult>;
  }
  // registry.ts
  export function getProviderForNetwork(networkName: string): BalanceProvider | undefined;
  export function registerProvider(networkName: string, provider: BalanceProvider): void; // usado por tests
  ```

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/registry.test.ts
import { describe, expect, it } from 'vitest';
import { getProviderForNetwork, registerProvider } from './registry';
import type { BalanceProvider } from './types';

describe('providers/registry', () => {
  it('devuelve undefined para una red no registrada', () => {
    expect(getProviderForNetwork('Red Inventada')).toBeUndefined();
  });

  it('devuelve el proveedor registrado por nombre exacto de red', () => {
    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 1 }) };
    registerProvider('__Test Network__', fake);
    expect(getProviderForNetwork('__Test Network__')).toBe(fake);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/registry.test.ts`
Expected: FAIL — módulos no existen

- [ ] **Step 3: Implementar `types.ts`**

```ts
// backend/src/modules/walletSync/providers/types.ts
export type BalanceResult =
  | { ok: true; balance: number }
  | { ok: false; error: string };

export interface BalanceProvider {
  requiresApiKey: boolean;
  getBalance(address: string, apiKey: string | undefined, contractAddress?: string): Promise<BalanceResult>;
}

export const PROVIDER_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Implementar `registry.ts` (registro vacío por ahora, los providers reales se añaden en las tareas 4-11)**

```ts
// backend/src/modules/walletSync/providers/registry.ts
import type { BalanceProvider } from './types';

const registry = new Map<string, BalanceProvider>();

export function registerProvider(networkName: string, provider: BalanceProvider): void {
  registry.set(networkName, provider);
}

export function getProviderForNetwork(networkName: string): BalanceProvider | undefined {
  return registry.get(networkName);
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/registry.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/walletSync/providers/types.ts backend/src/modules/walletSync/providers/registry.ts backend/src/modules/walletSync/providers/registry.test.ts
git commit -m "feat(walletSync): interfaz BalanceProvider y registro por red"
```

---

## Task 4: Proveedor XRP Ledger

**Files:**
- Create: `backend/src/modules/walletSync/providers/xrplProvider.ts`
- Test: `backend/src/modules/walletSync/providers/xrplProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts` (nuevo — registra todos los proveedores; se amplía en cada tarea siguiente)

**Interfaces:**
- Consumes: `BalanceProvider`, `fetchWithTimeout` de `./types`; `registerProvider` de `./registry`.
- Produces: `xrplProvider: BalanceProvider`, registrado bajo el nombre exacto `'XRP Ledger'` (coincide con `networks.name`).

Usa el JSON-RPC público de rippled (`xrplcluster.com`, sin API key), método `account_info`, que devuelve el balance en drops (`1 XRP = 1,000,000 drops`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/xrplProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { xrplProvider } from './xrplProvider';

describe('xrplProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('convierte drops a XRP en una respuesta válida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: { status: 'success', account_data: { Balance: '2963538297' } },
      }),
    }) as unknown as Response));

    const result = await xrplProvider.getBalance('rN7n34b4RM8FAFGbFZapWrdMJB1qVHbXLe', undefined);
    expect(result).toEqual({ ok: true, balance: 2963.538297 });
  });

  it('devuelve ok:false si la cuenta no existe (actNotFound)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { status: 'error', error: 'actNotFound' } }),
    }) as unknown as Response));

    const result = await xrplProvider.getBalance('rInexistente', undefined);
    expect(result.ok).toBe(false);
  });

  it('devuelve ok:false si la petición lanza (timeout/red)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error'); }));
    const result = await xrplProvider.getBalance('rN7n34b4RM8FAFGbFZapWrdMJB1qVHbXLe', undefined);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/xrplProvider.test.ts`
Expected: FAIL — módulo no existe

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/xrplProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const RPC_URL = 'https://xrplcluster.com';

export const xrplProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'account_info',
          params: [{ account: address, ledger_index: 'validated' }],
        }),
      });
      const data = await res.json();
      if (data?.result?.status !== 'success' || !data.result.account_data?.Balance) {
        return { ok: false, error: data?.result?.error ?? 'respuesta inesperada de XRPL' };
      }
      const drops = Number(data.result.account_data.Balance);
      return { ok: true, balance: drops / 1_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Crear el índice de registro de proveedores**

```ts
// backend/src/modules/walletSync/providers/index.ts
// Registra todos los proveedores conocidos. Se importa una sola vez desde
// walletSync.ts para poblar el registry antes de la primera sincronización.
import { registerProvider } from './registry';
import { xrplProvider } from './xrplProvider';

export function registerAllProviders(): void {
  registerProvider('XRP Ledger', xrplProvider);
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/xrplProvider.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/walletSync/providers/xrplProvider.ts backend/src/modules/walletSync/providers/xrplProvider.test.ts backend/src/modules/walletSync/providers/index.ts
git commit -m "feat(walletSync): proveedor de saldo XRP Ledger"
```

---

## Task 5: Proveedor Hedera (HBAR)

**Files:**
- Create: `backend/src/modules/walletSync/providers/hederaProvider.ts`
- Test: `backend/src/modules/walletSync/providers/hederaProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts`

**Interfaces:**
- Produces: `hederaProvider: BalanceProvider`, registrado bajo `'HBAR'` (nombre de red en `networks.name`).

Usa el Mirror Node público de Hedera (sin API key): `GET /api/v1/accounts/{accountId}`. Balance en tinybars (`1 HBAR = 100,000,000 tinybars`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/hederaProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { hederaProvider } from './hederaProvider';

describe('hederaProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('convierte tinybars a HBAR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ balance: { balance: 150000000 } }),
    }) as unknown as Response));

    const result = await hederaProvider.getBalance('0.0.1234567', undefined);
    expect(result).toEqual({ ok: true, balance: 1.5 });
  });

  it('devuelve ok:false si la respuesta HTTP no es 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response));
    const result = await hederaProvider.getBalance('0.0.0', undefined);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/hederaProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/hederaProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://mainnet-public.mirrornode.hedera.com/api/v1';

export const hederaProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/accounts/${address}`);
      if (!res.ok) return { ok: false, error: `Mirror Node respondió ${res.status}` };
      const data = await res.json();
      const tinybars = data?.balance?.balance;
      if (typeof tinybars !== 'number') return { ok: false, error: 'respuesta sin balance' };
      return { ok: true, balance: tinybars / 100_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Registrar en el índice**

En `backend/src/modules/walletSync/providers/index.ts`, añadir el import y la línea de registro:

```ts
import { hederaProvider } from './hederaProvider';
// ...dentro de registerAllProviders():
registerProvider('HBAR', hederaProvider);
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/hederaProvider.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/walletSync/providers/hederaProvider.ts backend/src/modules/walletSync/providers/hederaProvider.test.ts backend/src/modules/walletSync/providers/index.ts
git commit -m "feat(walletSync): proveedor de saldo Hedera (HBAR)"
```

---

## Task 6: Proveedor Stellar (XLM)

**Files:**
- Create: `backend/src/modules/walletSync/providers/stellarProvider.ts`
- Test: `backend/src/modules/walletSync/providers/stellarProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts`

**Interfaces:**
- Produces: `stellarProvider: BalanceProvider`, registrado bajo `'Stellar'`.

Usa Horizon público (sin API key): `GET /accounts/{account}`. `balances[]` incluye una entrada con `asset_type: 'native'` cuyo campo `balance` ya es un string decimal en XLM.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/stellarProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { stellarProvider } from './stellarProvider';

describe('stellarProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('extrae el balance nativo (XLM) del array de balances', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: 'credit_alphanum4', asset_code: 'USDC', balance: '10.0000000' },
          { asset_type: 'native', balance: '542.1234567' },
        ],
      }),
    }) as unknown as Response));

    const result = await stellarProvider.getBalance('GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV5UOIQJOHNHKN', undefined);
    expect(result).toEqual({ ok: true, balance: 542.1234567 });
  });

  it('devuelve ok:false si la cuenta no existe (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response));
    const result = await stellarProvider.getBalance('GINEXISTENTE', undefined);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/stellarProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/stellarProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://horizon.stellar.org';

export const stellarProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/accounts/${address}`);
      if (!res.ok) return { ok: false, error: `Horizon respondió ${res.status}` };
      const data = await res.json();
      const native = (data?.balances ?? []).find((b: { asset_type: string }) => b.asset_type === 'native');
      if (!native) return { ok: false, error: 'sin balance nativo en la respuesta' };
      return { ok: true, balance: parseFloat(native.balance) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Registrar en el índice**

```ts
import { stellarProvider } from './stellarProvider';
// registerAllProviders():
registerProvider('Stellar', stellarProvider);
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/stellarProvider.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/walletSync/providers/stellarProvider.ts backend/src/modules/walletSync/providers/stellarProvider.test.ts backend/src/modules/walletSync/providers/index.ts
git commit -m "feat(walletSync): proveedor de saldo Stellar (XLM)"
```

---

## Task 7: Proveedor Bitcoin (BTC)

**Files:**
- Create: `backend/src/modules/walletSync/providers/blockstreamProvider.ts`
- Test: `backend/src/modules/walletSync/providers/blockstreamProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts`

**Interfaces:**
- Produces: `blockstreamProvider: BalanceProvider`, registrado bajo `'Bitcoin'`.

Usa la Esplora API pública de Blockstream (sin API key): `GET /api/address/{address}`. Balance en satoshis = `chain_stats.funded_txo_sum - chain_stats.spent_txo_sum` (UTXOs confirmados; se ignora mempool_stats para evitar contar fondos no confirmados).

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/blockstreamProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { blockstreamProvider } from './blockstreamProvider';

describe('blockstreamProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calcula el balance confirmado en BTC a partir de funded/spent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        chain_stats: { funded_txo_sum: 150_000_000, spent_txo_sum: 50_000_000 },
      }),
    }) as unknown as Response));

    const result = await blockstreamProvider.getBalance('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', undefined);
    expect(result).toEqual({ ok: true, balance: 1 });
  });

  it('devuelve ok:false si la petición falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }) as unknown as Response));
    const result = await blockstreamProvider.getBalance('direccion-invalida', undefined);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/blockstreamProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/blockstreamProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://blockstream.info/api';

export const blockstreamProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/address/${address}`);
      if (!res.ok) return { ok: false, error: `Esplora respondió ${res.status}` };
      const data = await res.json();
      const sats = (data?.chain_stats?.funded_txo_sum ?? 0) - (data?.chain_stats?.spent_txo_sum ?? 0);
      return { ok: true, balance: sats / 100_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Registrar en el índice**

```ts
import { blockstreamProvider } from './blockstreamProvider';
// registerAllProviders():
registerProvider('Bitcoin', blockstreamProvider);
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/blockstreamProvider.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/walletSync/providers/blockstreamProvider.ts backend/src/modules/walletSync/providers/blockstreamProvider.test.ts backend/src/modules/walletSync/providers/index.ts
git commit -m "feat(walletSync): proveedor de saldo Bitcoin"
```

---

## Task 8: Proveedor Ethereum (ETH + tokens ERC-20, ej. LINK)

**Files:**
- Create: `backend/src/modules/walletSync/providers/etherscanProvider.ts`
- Test: `backend/src/modules/walletSync/providers/etherscanProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `etherscanProvider: BalanceProvider`, registrado bajo `'Ethereum'`. `requiresApiKey: true`.

Usa Etherscan API v2 (requiere key): balance nativo con `action=balance` (wei, `/1e18`); balance de token con `action=tokenbalance&contractaddress=...` (unidad mínima del token). Como los decimales varían por token (LINK=18, pero USDC=6), se consultan on-chain vía `action=eth_call` al selector `decimals()` (`0x313ce567`) en vez de asumir 18 — evita el error clásico de asumir 18 decimales para tokens como USDC.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/etherscanProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { etherscanProvider } from './etherscanProvider';

function mockFetchSequence(responses: unknown[]) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const body = responses[call++];
    return { ok: true, json: async () => body } as unknown as Response;
  }));
}

describe('etherscanProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('balance nativo ETH: convierte wei a ETH', async () => {
    mockFetchSequence([{ status: '1', result: '2500000000000000000' }]); // 2.5 ETH
    const result = await etherscanProvider.getBalance('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'FAKEKEY');
    expect(result).toEqual({ ok: true, balance: 2.5 });
  });

  it('balance de token ERC-20 (LINK, 18 decimales): consulta decimals() y convierte', async () => {
    mockFetchSequence([
      { status: '1', result: '10000000000000000000' }, // tokenbalance: 10 LINK en unidad mínima
      { status: '1', result: '0x12' },                  // eth_call decimals(): 18
    ]);
    const result = await etherscanProvider.getBalance(
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      'FAKEKEY',
      '0x514910771AF9Ca656af840dff83E8264EcF986CA'
    );
    expect(result).toEqual({ ok: true, balance: 10 });
  });

  it('balance de token con 6 decimales (ej. USDC) no se confunde con 18', async () => {
    mockFetchSequence([
      { status: '1', result: '5000000' }, // 5 USDC en unidad mínima (6 decimales)
      { status: '1', result: '0x6' },     // eth_call decimals(): 6
    ]);
    const result = await etherscanProvider.getBalance(
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      'FAKEKEY',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    );
    expect(result).toEqual({ ok: true, balance: 5 });
  });

  it('devuelve ok:false si Etherscan responde status "0" (ej. rate limit o key inválida)', async () => {
    mockFetchSequence([{ status: '0', message: 'NOTOK', result: 'Invalid API Key' }]);
    const result = await etherscanProvider.getBalance('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'BADKEY');
    expect(result.ok).toBe(false);
  });

  it('devuelve ok:false si no hay API key disponible', async () => {
    const result = await etherscanProvider.getBalance('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', undefined);
    expect(result).toEqual({ ok: false, error: 'falta API key para Ethereum (Etherscan)' });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/etherscanProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/etherscanProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 1; // Ethereum mainnet
const DECIMALS_SELECTOR = '0x313ce567'; // decimals()

async function fetchDecimals(contractAddress: string, apiKey: string): Promise<number> {
  const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=proxy&action=eth_call&to=${contractAddress}&data=${DECIMALS_SELECTOR}&tag=latest&apikey=${apiKey}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();
  return parseInt(data.result, 16);
}

export const etherscanProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey, contractAddress): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Ethereum (Etherscan)' };
    try {
      if (!contractAddress) {
        const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
        const res = await fetchWithTimeout(url);
        const data = await res.json();
        if (data.status !== '1') return { ok: false, error: data.result ?? 'fallo de Etherscan' };
        return { ok: true, balance: Number(data.result) / 1e18 };
      }

      const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&tag=latest&apikey=${apiKey}`;
      const res = await fetchWithTimeout(url);
      const data = await res.json();
      if (data.status !== '1') return { ok: false, error: data.result ?? 'fallo de Etherscan' };
      const decimals = await fetchDecimals(contractAddress, apiKey);
      return { ok: true, balance: Number(data.result) / 10 ** decimals };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Registrar en el índice**

```ts
import { etherscanProvider } from './etherscanProvider';
// registerAllProviders():
registerProvider('Ethereum', etherscanProvider);
```

- [ ] **Step 5: Añadir la variable de entorno**

En `.env.example`, nueva sección tras `# ── Precios ──`:

```
# ── Verificación de saldos on-chain (opcional por red) ─────────
# Etherscan: https://etherscan.io/myapikey (gratuita)
ETHERSCAN_API_KEY=
```

- [ ] **Step 6: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/etherscanProvider.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/walletSync/providers/etherscanProvider.ts backend/src/modules/walletSync/providers/etherscanProvider.test.ts backend/src/modules/walletSync/providers/index.ts .env.example
git commit -m "feat(walletSync): proveedor de saldo Ethereum (nativo + ERC-20)"
```

---

## Task 9: Proveedor Solana (SOL + tokens SPL)

**Files:**
- Create: `backend/src/modules/walletSync/providers/solanaProvider.ts`
- Test: `backend/src/modules/walletSync/providers/solanaProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts`

**Interfaces:**
- Produces: `solanaProvider: BalanceProvider`, registrado bajo `'Solana'`. `requiresApiKey: false` (usa el RPC público compartido; sujeto a rate-limit, contemplado por el circuit breaker general).

Usa JSON-RPC público de Solana (`api.mainnet-beta.solana.com`). Nativo: `getBalance` (lamports, `/1e9`). Token SPL: `getTokenAccountsByOwner` con `{mint: contractAddress}` y `encoding: 'jsonParsed'` — el RPC ya devuelve `uiAmount` con los decimales aplicados, sin necesidad de consultarlos aparte.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/solanaProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { solanaProvider } from './solanaProvider';

describe('solanaProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('balance nativo SOL: convierte lamports a SOL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { value: 2_500_000_000 } }),
    }) as unknown as Response));

    const result = await solanaProvider.getBalance('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', undefined);
    expect(result).toEqual({ ok: true, balance: 2.5 });
  });

  it('balance de token SPL: usa uiAmount ya con decimales aplicados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 42.5 } } } } } }] },
      }),
    }) as unknown as Response));

    const result = await solanaProvider.getBalance(
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', undefined, 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
    );
    expect(result).toEqual({ ok: true, balance: 42.5 });
  });

  it('balance de token SPL sin cuentas asociadas devuelve 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ result: { value: [] } }) }) as unknown as Response));
    const result = await solanaProvider.getBalance('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', undefined, 'mint-sin-cuenta');
    expect(result).toEqual({ ok: true, balance: 0 });
  });

  it('devuelve ok:false si el RPC devuelve un error JSON-RPC', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ error: { code: -32602, message: 'Invalid params' } }),
    }) as unknown as Response));
    const result = await solanaProvider.getBalance('direccion-invalida', undefined);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/solanaProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/solanaProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const RPC_URL = 'https://api.mainnet-beta.solana.com';

async function rpcCall(method: string, params: unknown[]): Promise<{ result?: any; error?: { message: string } }> {
  const res = await fetchWithTimeout(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

export const solanaProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address, _apiKey, contractAddress): Promise<BalanceResult> {
    try {
      if (!contractAddress) {
        const data = await rpcCall('getBalance', [address]);
        if (data.error) return { ok: false, error: data.error.message };
        return { ok: true, balance: (data.result?.value ?? 0) / 1e9 };
      }

      const data = await rpcCall('getTokenAccountsByOwner', [
        address,
        { mint: contractAddress },
        { encoding: 'jsonParsed' },
      ]);
      if (data.error) return { ok: false, error: data.error.message };
      const accounts = data.result?.value ?? [];
      if (accounts.length === 0) return { ok: true, balance: 0 };
      const total = accounts.reduce(
        (sum: number, acc: any) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
        0
      );
      return { ok: true, balance: total };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Registrar en el índice**

```ts
import { solanaProvider } from './solanaProvider';
// registerAllProviders():
registerProvider('Solana', solanaProvider);
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/solanaProvider.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/walletSync/providers/solanaProvider.ts backend/src/modules/walletSync/providers/solanaProvider.test.ts backend/src/modules/walletSync/providers/index.ts
git commit -m "feat(walletSync): proveedor de saldo Solana (nativo + SPL)"
```

---

## Task 10: Proveedor Cardano (ADA)

**Files:**
- Create: `backend/src/modules/walletSync/providers/blockfrostProvider.ts`
- Test: `backend/src/modules/walletSync/providers/blockfrostProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `blockfrostProvider: BalanceProvider`, registrado bajo `'Cardano'`. `requiresApiKey: true`.

Usa Blockfrost (requiere `project_id` como header, key gratuita): `GET /addresses/{address}`. `amount[]` incluye `{unit: 'lovelace', quantity: '...'}`; `1 ADA = 1,000,000 lovelace`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/blockfrostProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { blockfrostProvider } from './blockfrostProvider';

describe('blockfrostProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('convierte lovelace a ADA', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ amount: [{ unit: 'lovelace', quantity: '325000000' }] }),
    }) as unknown as Response));

    const result = await blockfrostProvider.getBalance('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer', 'FAKEKEY');
    expect(result).toEqual({ ok: true, balance: 325 });
  });

  it('devuelve ok:false si no hay API key', async () => {
    const result = await blockfrostProvider.getBalance('addr1...', undefined);
    expect(result).toEqual({ ok: false, error: 'falta API key para Cardano (Blockfrost)' });
  });

  it('devuelve ok:false si la dirección no existe (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response));
    const result = await blockfrostProvider.getBalance('addr1inexistente', 'FAKEKEY');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/blockfrostProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/blockfrostProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://cardano-mainnet.blockfrost.io/api/v0';

export const blockfrostProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Cardano (Blockfrost)' };
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/addresses/${address}`, {
        headers: { project_id: apiKey },
      });
      if (!res.ok) return { ok: false, error: `Blockfrost respondió ${res.status}` };
      const data = await res.json();
      const lovelace = (data?.amount ?? []).find((a: { unit: string }) => a.unit === 'lovelace');
      if (!lovelace) return { ok: false, error: 'sin unidad lovelace en la respuesta' };
      return { ok: true, balance: Number(lovelace.quantity) / 1_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Registrar en el índice**

```ts
import { blockfrostProvider } from './blockfrostProvider';
// registerAllProviders():
registerProvider('Cardano', blockfrostProvider);
```

- [ ] **Step 5: Añadir la variable de entorno**

En `.env.example`, dentro de la sección añadida en la Tarea 8:

```
# Blockfrost (Cardano): https://blockfrost.io — free tier, project_id como key
BLOCKFROST_API_KEY=
```

- [ ] **Step 6: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/blockfrostProvider.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/walletSync/providers/blockfrostProvider.ts backend/src/modules/walletSync/providers/blockfrostProvider.test.ts backend/src/modules/walletSync/providers/index.ts .env.example
git commit -m "feat(walletSync): proveedor de saldo Cardano"
```

---

## Task 11: Proveedor Polkadot Asset Hub (DOT)

**Files:**
- Create: `backend/src/modules/walletSync/providers/subscanProvider.ts`
- Test: `backend/src/modules/walletSync/providers/subscanProvider.test.ts`
- Modify: `backend/src/modules/walletSync/providers/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `subscanProvider: BalanceProvider`, registrado bajo `'Polkadot Asset Hub'`. `requiresApiKey: true` (Subscan exige key desde marzo 2026).

Usa Subscan API v2 para Asset Hub (requiere `X-API-Key`): `POST /api/v2/scan/account` con body `{key: address}`. `data.account.balance` ya viene como string decimal en DOT.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/providers/subscanProvider.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { subscanProvider } from './subscanProvider';

describe('subscanProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lee el balance en DOT ya formateado por Subscan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 0, data: { account: { balance: '87.5000000000' } } }),
    }) as unknown as Response));

    const result = await subscanProvider.getBalance('1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg', 'FAKEKEY');
    expect(result).toEqual({ ok: true, balance: 87.5 });
  });

  it('devuelve ok:false si no hay API key', async () => {
    const result = await subscanProvider.getBalance('1FRMM8...', undefined);
    expect(result).toEqual({ ok: false, error: 'falta API key para Polkadot Asset Hub (Subscan)' });
  });

  it('devuelve ok:false si Subscan responde code != 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 10004, message: 'Invalid API Key' }),
    }) as unknown as Response));
    const result = await subscanProvider.getBalance('1FRMM8...', 'BADKEY');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/subscanProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/providers/subscanProvider.ts
import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://assethub-polkadot.api.subscan.io';

export const subscanProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Polkadot Asset Hub (Subscan)' };
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/api/v2/scan/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ key: address }),
      });
      const data = await res.json();
      if (data.code !== 0) return { ok: false, error: data.message ?? 'fallo de Subscan' };
      const balance = data?.data?.account?.balance;
      if (typeof balance !== 'string') return { ok: false, error: 'respuesta sin balance' };
      return { ok: true, balance: parseFloat(balance) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
```

- [ ] **Step 4: Registrar en el índice**

```ts
import { subscanProvider } from './subscanProvider';
// registerAllProviders():
registerProvider('Polkadot Asset Hub', subscanProvider);
```

- [ ] **Step 5: Añadir la variable de entorno**

```
# Subscan (Polkadot Asset Hub): https://pro.subscan.io — free plan, requiere API key desde 2026
SUBSCAN_API_KEY=
```

- [ ] **Step 6: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/providers/subscanProvider.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/walletSync/providers/subscanProvider.ts backend/src/modules/walletSync/providers/subscanProvider.test.ts backend/src/modules/walletSync/providers/index.ts .env.example
git commit -m "feat(walletSync): proveedor de saldo Polkadot Asset Hub"
```

---

## Task 12: Exportar `getOpenLots`/`FIFO_DUST_EPSILON` del motor FIFO

**Files:**
- Modify: `backend/src/modules/fifo/engine.ts`

**Interfaces:**
- Produces: `export async function getOpenLots(...)`, `export const FIFO_DUST_EPSILON`. Sin cambio de comportamiento — solo visibilidad, para que `walletSync.ts` (Tarea 13) calcule el saldo esperado reutilizando la misma consulta que ya usa el motor, sin duplicarla.

- [ ] **Step 1: Cambiar la visibilidad**

En `backend/src/modules/fifo/engine.ts`, línea 52, cambiar:
```ts
const FIFO_DUST_EPSILON = 1e-6;
```
a:
```ts
export const FIFO_DUST_EPSILON = 1e-6;
```

Y en la línea 775, cambiar:
```ts
async function getOpenLots(asset: string, walletId: string, client: PoolClient): Promise<FifoLot[]> {
```
a:
```ts
export async function getOpenLots(asset: string, walletId: string, client: PoolClient): Promise<FifoLot[]> {
```

- [ ] **Step 2: Ejecutar la suite completa del motor para confirmar que no rompe nada**

Run: `cd backend && npx vitest run src/modules/fifo/engine.test.ts`
Expected: PASS (los 19 tests existentes, sin cambios de comportamiento)

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/fifo/engine.ts
git commit -m "refactor(fifo): exportar getOpenLots y FIFO_DUST_EPSILON para reuso en walletSync"
```

---

## Task 13: Motor de sincronización `walletSync.ts`

**Files:**
- Create: `backend/src/modules/walletSync/walletSync.ts`
- Test: `backend/src/modules/walletSync/walletSync.test.ts`

**Interfaces:**
- Consumes: `getProviderForNetwork` (Tarea 3), `getOpenLots`/`FIFO_DUST_EPSILON` (Tarea 12), `encryptApiKey`/`decryptApiKey` (Tarea 2), `db`/`pool` de `../../db/client`.
- Produces:
  ```ts
  export interface SyncResult { asset: string; status: 'ok' | 'discrepancy' | 'error'; onchainBalance: number | null; expectedBalance: number; discrepancyPct: number | null; error?: string }
  export async function syncWalletAddress(walletAddressId: string): Promise<SyncResult[]>;
  export async function syncAllWalletAddresses(): Promise<void>; // job diario: recorre todas, purga log >90 días
  ```

Umbral y circuit breaker según Global Constraints. Este test usa `createTestDatabase()` (integración real contra Postgres) con un `BalanceProvider` fake inyectado vía `registerProvider`, siguiendo el patrón ya usado por `engine.test.ts`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/walletSync.test.ts
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import { registerProvider } from './providers/registry';
import type { BalanceProvider } from './providers/types';

let testDb: TestDatabase;
let pool: Pool;
let walletId: string;
let networkId: string;

// Se inyecta un módulo db propio apuntando a la BD de test — walletSync.ts
// recibe el pool vía el mismo patrón que engine.ts (import de ../../db/client),
// así que aquí sobreescribimos DATABASE_URL antes de importar el módulo bajo test.
async function loadWalletSyncWithTestDb() {
  process.env.DATABASE_URL = testDb.connectionString;
  const mod = await import('./walletSync');
  return mod;
}

describe('walletSync', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });

    const net = await pool.query(`SELECT id FROM networks WHERE name = 'XRP Ledger'`);
    networkId = net.rows[0].id;

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet de test', 'hardware') RETURNING id`
    );
    walletId = wallet.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM balance_sync_log');
    await pool.query('DELETE FROM fifo_lots');
    await pool.query('DELETE FROM transactions');
  });

  it('status ok cuando la diferencia está por debajo del 0.5%', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest1') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, opened_at, wallet_id, is_closed)
       VALUES ('XRP', 1000, 1000, 500, 0.5, NOW(), $1, FALSE)`,
      [walletId]
    );

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 1000.5 }) };
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    const xrpResult = results.find(r => r.asset === 'XRP')!;
    expect(xrpResult.status).toBe('ok');
    expect(xrpResult.onchainBalance).toBe(1000.5);
  });

  it('status discrepancy cuando la diferencia supera el 0.5%', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest2') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, opened_at, wallet_id, is_closed)
       VALUES ('XRP', 1000, 1000, 500, 0.5, NOW(), $1, FALSE)`,
      [walletId]
    );

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 900 }) }; // -10%
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    const xrpResult = results.find(r => r.asset === 'XRP')!;
    expect(xrpResult.status).toBe('discrepancy');
    expect(xrpResult.discrepancyPct).toBeCloseTo(0.1, 2);
  });

  it('status error si el proveedor falla, sin lanzar excepción', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest3') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: false, error: 'timeout' }) };
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    expect(results[0].status).toBe('error');
  });

  it('escribe el resultado en balance_sync_log y actualiza last_known_balance/last_sync_at del activo nativo', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest4') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 42 }) };
    registerProvider('XRP Ledger', fake);

    await syncWalletAddress(addressId);

    const log = await pool.query(`SELECT * FROM balance_sync_log WHERE wallet_address_id = $1`, [addressId]);
    expect(log.rows.length).toBe(1);
    expect(Number(log.rows[0].onchain_balance)).toBe(42);

    const addr = await pool.query(`SELECT last_known_balance, last_sync_at FROM wallet_addresses WHERE id = $1`, [addressId]);
    expect(Number(addr.rows[0].last_known_balance)).toBe(42);
    expect(addr.rows[0].last_sync_at).not.toBeNull();
  });

  it('sin lotes abiertos (expected=0): cualquier saldo on-chain por encima del polvo cuenta como discrepancia', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest5') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 5 }) };
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    expect(results[0].status).toBe('discrepancy');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/walletSync.test.ts`
Expected: FAIL — módulo no existe

- [ ] **Step 3: Implementar**

```ts
// backend/src/modules/walletSync/walletSync.ts
import { PoolClient } from 'pg';
import { db, pool } from '../../db/client';
import { getOpenLots, FIFO_DUST_EPSILON } from '../fifo/engine';
import { getProviderForNetwork } from './providers/registry';
import { decryptApiKey } from './apiKeyCrypto';

export interface SyncResult {
  asset: string;
  status: 'ok' | 'discrepancy' | 'error';
  onchainBalance: number | null;
  expectedBalance: number;
  discrepancyPct: number | null;
  error?: string;
}

const DISCREPANCY_THRESHOLD = 0.005; // 0.5%
const CIRCUIT_BREAKER_THRESHOLD = 3;
const ENV_KEY_BY_NETWORK: Record<string, string> = {
  Ethereum: 'ETHERSCAN_API_KEY',
  Cardano: 'BLOCKFROST_API_KEY',
  'Polkadot Asset Hub': 'SUBSCAN_API_KEY',
};

// Fallos consecutivos por red — vive en memoria del proceso; si el backend
// reinicia, el circuit breaker se resetea (aceptable: un reinicio es una
// señal razonable para volver a intentar).
const consecutiveFailures = new Map<string, number>();

async function resolveApiKey(networkId: string, networkName: string, client: PoolClient): Promise<string | undefined> {
  const row = await client.query(
    `SELECT api_key_encrypted, api_key_iv FROM network_api_keys WHERE network_id = $1`,
    [networkId]
  );
  if (row.rows.length > 0) {
    return decryptApiKey(row.rows[0].api_key_encrypted, row.rows[0].api_key_iv);
  }
  const envVar = ENV_KEY_BY_NETWORK[networkName];
  return envVar ? process.env[envVar] || undefined : undefined;
}

async function getExpectedBalance(asset: string, walletId: string, client: PoolClient): Promise<number> {
  const lots = await getOpenLots(asset, walletId, client);
  return lots.reduce((sum, l) => sum + l.quantityRemaining, 0);
}

function evaluate(onchain: number, expected: number): { status: SyncResult['status']; discrepancyPct: number | null } {
  if (expected === 0) {
    return onchain > FIFO_DUST_EPSILON
      ? { status: 'discrepancy', discrepancyPct: null }
      : { status: 'ok', discrepancyPct: 0 };
  }
  const pct = Math.abs(onchain - expected) / expected;
  return { status: pct > DISCREPANCY_THRESHOLD ? 'discrepancy' : 'ok', discrepancyPct: pct };
}

async function syncOneAsset(
  asset: string,
  address: string,
  walletId: string,
  contractAddress: string | undefined,
  providerName: string,
  apiKey: string | undefined,
  client: PoolClient
): Promise<Omit<SyncResult, 'asset'>> {
  const failures = consecutiveFailures.get(providerName) ?? 0;
  if (failures >= CIRCUIT_BREAKER_THRESHOLD) {
    const expectedBalance = await getExpectedBalance(asset, walletId, client);
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: 'circuit breaker abierto (proveedor con fallos repetidos)' };
  }

  const provider = getProviderForNetwork(providerName);
  const expectedBalance = await getExpectedBalance(asset, walletId, client);
  if (!provider) {
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: 'sin proveedor registrado para esta red' };
  }

  const result = await provider.getBalance(address, apiKey, contractAddress);
  if (!result.ok) {
    consecutiveFailures.set(providerName, failures + 1);
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: result.error };
  }
  consecutiveFailures.set(providerName, 0);

  const { status, discrepancyPct } = evaluate(result.balance, expectedBalance);
  return { status, onchainBalance: result.balance, expectedBalance, discrepancyPct };
}

export async function syncWalletAddress(walletAddressId: string): Promise<SyncResult[]> {
  return db.transaction(async client => {
    const addrRes = await client.query(
      `SELECT wa.wallet_id, wa.address, wa.network_id, n.name AS network_name, n.native_asset
       FROM wallet_addresses wa JOIN networks n ON n.id = wa.network_id
       WHERE wa.id = $1`,
      [walletAddressId]
    );
    if (addrRes.rows.length === 0 || !addrRes.rows[0].address) return [];
    const { wallet_id: walletId, address, network_id: networkId, network_name: networkName, native_asset: nativeAsset } = addrRes.rows[0];

    const apiKey = await resolveApiKey(networkId, networkName, client);
    const results: SyncResult[] = [];

    const nativeOutcome = await syncOneAsset(nativeAsset, address, walletId, undefined, networkName, apiKey, client);
    results.push({ asset: nativeAsset, ...nativeOutcome });

    const tokens = await client.query(`SELECT asset, contract_address FROM network_assets WHERE network_id = $1`, [networkId]);
    for (const token of tokens.rows) {
      const outcome = await syncOneAsset(token.asset, address, walletId, token.contract_address, networkName, apiKey, client);
      results.push({ asset: token.asset, ...outcome });
    }

    for (const r of results) {
      await client.query(
        `INSERT INTO balance_sync_log (wallet_address_id, asset, onchain_balance, expected_balance, discrepancy_pct, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [walletAddressId, r.asset, r.onchainBalance, r.expectedBalance, r.discrepancyPct, r.status]
      );
    }

    const native = results.find(r => r.asset === nativeAsset);
    if (native && native.onchainBalance !== null) {
      await client.query(
        `UPDATE wallet_addresses SET last_known_balance = $1, last_sync_at = clock_timestamp() WHERE id = $2`,
        [native.onchainBalance, walletAddressId]
      );
    }

    return results;
  });
}

export async function syncAllWalletAddresses(): Promise<void> {
  const addresses = await pool.query(`SELECT id FROM wallet_addresses WHERE address IS NOT NULL`);
  for (const row of addresses.rows) {
    try {
      await syncWalletAddress(row.id);
    } catch (err) {
      console.error(`[walletSync] error sincronizando wallet_address ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.query(`DELETE FROM balance_sync_log WHERE checked_at < NOW() - INTERVAL '90 days'`);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/walletSync.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/walletSync/walletSync.ts backend/src/modules/walletSync/walletSync.test.ts
git commit -m "feat(walletSync): motor de sincronización de saldos on-chain"
```

---

## Task 14: Scheduler diario (`node-cron`) y arranque

**Files:**
- Modify: `backend/package.json` (añadir dependencia `node-cron`)
- Create: `backend/src/modules/walletSync/scheduler.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/modules/walletSync/scheduler.test.ts`

**Interfaces:**
- Consumes: `syncAllWalletAddresses` (Tarea 13), `registerAllProviders` (Tarea 4).
- Produces: `export function scheduleWalletSync(): void` — programa el cron diario a las 03:00 y registra los proveedores una vez al arrancar.

- [ ] **Step 1: Instalar la dependencia**

Run: `cd backend && npm install node-cron`

- [ ] **Step 2: Escribir el test que falla**

```ts
// backend/src/modules/walletSync/scheduler.test.ts
import { describe, expect, it, vi } from 'vitest';
import cron from 'node-cron';
import { scheduleWalletSync } from './scheduler';

describe('scheduler', () => {
  it('programa exactamente una tarea cron con el patrón diario 03:00', () => {
    const spy = vi.spyOn(cron, 'schedule');
    scheduleWalletSync();
    expect(spy).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/modules/walletSync/scheduler.test.ts`
Expected: FAIL — módulo no existe

- [ ] **Step 4: Implementar**

```ts
// backend/src/modules/walletSync/scheduler.ts
import cron from 'node-cron';
import { registerAllProviders } from './providers';
import { syncAllWalletAddresses } from './walletSync';

// '0 3 * * *' — cada día a las 03:00 (hora del servidor). Fuera de horas
// activas típicas, y el saldo on-chain no cambia salvo que el usuario opere,
// así que no se necesita mayor frecuencia (ver spec: umbral de discrepancia).
export function scheduleWalletSync(): void {
  registerAllProviders();
  cron.schedule('0 3 * * *', () => {
    syncAllWalletAddresses().catch(err =>
      console.error('[walletSync] error en la sincronización diaria:', err instanceof Error ? err.message : err)
    );
  });
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/modules/walletSync/scheduler.test.ts`
Expected: PASS

- [ ] **Step 6: Conectar en el arranque del backend**

En `backend/src/index.ts`, añadir el import junto a los demás módulos:

```ts
import { scheduleWalletSync } from './modules/walletSync/scheduler';
```

Y dentro de `bootstrap()`, justo después de `setupPricesWebSocket(server);`:

```ts
    setupPricesWebSocket(server);
    scheduleWalletSync();
```

- [ ] **Step 7: Verificar manualmente que el backend arranca sin error**

Run: `cd backend && npm run build && npm start` (o `npm run dev`), confirmar en el log que no hay excepciones al arrancar.
Expected: `[SERVER] Listening on ...` sin errores relacionados con `walletSync` o `node-cron`.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/modules/walletSync/scheduler.ts backend/src/modules/walletSync/scheduler.test.ts backend/src/index.ts
git commit -m "feat(walletSync): programar sincronización diaria con node-cron"
```

---

## Task 15: Endpoints API — sync manual y gestión de API keys

**Files:**
- Modify: `backend/src/routes/wallets.ts`
- Test: `backend/src/routes/wallets.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/wallets/:walletId/addresses/:addressId/sync` → `SyncResult[]` (Tarea 13)
  - `GET /api/wallets/networks/:networkId/api-key` → `{network_id, has_key: boolean, updated_at: string | null}`
  - `PUT /api/wallets/networks/:networkId/api-key` (body `{api_key: string}`) → `{success: true}`
  - `DELETE /api/wallets/networks/:networkId/api-key` → `{success: true}`
  - `GET /api/wallets` (existente) se extiende: cada elemento de `addresses[]` gana `sync_status: 'ok' | 'discrepancy' | 'error' | 'pending'` y `sync_details: Array<{asset, onchain_balance, expected_balance, checked_at, status}>` — el peor estado entre los activos verificados de esa dirección (`discrepancy` > `error` > `ok` > `pending`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/routes/wallets.test.ts
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';
import { registerProvider } from '../modules/walletSync/providers/registry';
import type { BalanceProvider } from '../modules/walletSync/providers/types';
import { randomBytes } from 'crypto';

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let networkId: string;

describe('routes/wallets — sync y api-key', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    process.env.WALLET_SYNC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    pool = new Pool({ connectionString: testDb.connectionString });

    const net = await pool.query(`SELECT id FROM networks WHERE name = 'XRP Ledger'`);
    networkId = net.rows[0].id;

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet API test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM balance_sync_log');
    await pool.query('DELETE FROM network_api_keys');
  });

  it('POST .../sync dispara la verificación y devuelve el resultado', async () => {
    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rApiTest') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 10 }) };
    registerProvider('XRP Ledger', fake);

    const res = await request(app).post(`/api/wallets/${walletId}/addresses/${addressId}/sync`);
    expect(res.status).toBe(200);
    expect(res.body[0].asset).toBe('XRP');
  });

  it('PUT/GET/DELETE api-key: nunca expone el valor cifrado', async () => {
    let res = await request(app).get(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.body).toEqual({ network_id: networkId, has_key: false, updated_at: null });

    res = await request(app).put(`/api/wallets/networks/${networkId}/api-key`).send({ api_key: 'mi-key-secreta' });
    expect(res.status).toBe(200);

    res = await request(app).get(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.body.has_key).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('mi-key-secreta');
    expect(Object.keys(res.body)).not.toContain('api_key_encrypted');

    res = await request(app).delete(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.status).toBe(200);

    res = await request(app).get(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.body.has_key).toBe(false);
  });

  it('GET /api/wallets expone sync_status agregado por dirección', async () => {
    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rApiTest2') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;
    await pool.query(
      `INSERT INTO balance_sync_log (wallet_address_id, asset, onchain_balance, expected_balance, discrepancy_pct, status)
       VALUES ($1, 'XRP', 5, 10, 0.5, 'discrepancy')`,
      [addressId]
    );

    const res = await request(app).get('/api/wallets');
    const wallet = res.body.find((w: { id: string }) => w.id === walletId);
    const addr = wallet.addresses.find((a: { id: string }) => a.id === addressId);
    expect(addr.sync_status).toBe('discrepancy');
    expect(addr.sync_details[0].asset).toBe('XRP');
  });
});
```

- [ ] **Step 2: Verificar que `supertest` está disponible (dependencia de test ya usada por otros routes.test.ts o hay que añadirla)**

Run: `cd backend && grep -r supertest package.json || npm install -D supertest @types/supertest`

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/routes/wallets.test.ts`
Expected: FAIL — endpoints no existen

- [ ] **Step 4: Implementar los endpoints nuevos en `backend/src/routes/wallets.ts`**

Añadir estos imports al principio del archivo:

```ts
import { syncWalletAddress } from '../modules/walletSync/walletSync';
import { encryptApiKey } from '../modules/walletSync/apiKeyCrypto';
```

Añadir estas rutas antes de `export default router;`:

```ts
// ── POST /api/wallets/:walletId/addresses/:addressId/sync ─────────────────
router.post('/:walletId/addresses/:addressId/sync', async (req: Request, res: Response) => {
  const { addressId } = req.params;
  const results = await syncWalletAddress(addressId);
  res.json(results);
});

// ── GET /api/wallets/networks/:networkId/api-key ───────────────────────────
router.get('/networks/:networkId/api-key', async (req: Request, res: Response) => {
  const { networkId } = req.params;
  const result = await db.query(
    `SELECT updated_at FROM network_api_keys WHERE network_id = $1`,
    [networkId]
  );
  res.json({
    network_id: networkId,
    has_key: result.rows.length > 0,
    updated_at: result.rows[0]?.updated_at ?? null,
  });
});

// ── PUT /api/wallets/networks/:networkId/api-key ────────────────────────────
router.put('/networks/:networkId/api-key', async (req: Request, res: Response) => {
  const { networkId } = req.params;
  const { api_key } = req.body;
  if (!api_key || typeof api_key !== 'string') {
    res.status(400).json({ error: 'api_key es requerida' });
    return;
  }
  const { encrypted, iv } = encryptApiKey(api_key);
  await db.query(
    `INSERT INTO network_api_keys (network_id, api_key_encrypted, api_key_iv, updated_at)
     VALUES ($1, $2, $3, clock_timestamp())
     ON CONFLICT (network_id) DO UPDATE SET api_key_encrypted = $2, api_key_iv = $3, updated_at = clock_timestamp()`,
    [networkId, encrypted, iv]
  );
  res.json({ success: true });
});

// ── DELETE /api/wallets/networks/:networkId/api-key ─────────────────────────
router.delete('/networks/:networkId/api-key', async (req: Request, res: Response) => {
  const { networkId } = req.params;
  await db.query(`DELETE FROM network_api_keys WHERE network_id = $1`, [networkId]);
  res.json({ success: true });
});
```

- [ ] **Step 5: Extender `GET /api/wallets` con `sync_status`/`sync_details`**

En la query de `router.get('/', ...)`, dentro del `json_build_object` de cada dirección (línea ~13-23), añadir dos campos calculados con una subconsulta correlacionada. Reemplazar el bloque completo de la query por:

```ts
router.get('/', async (_req: Request, res: Response) => {
  const wallets = await db.query(`
    SELECT
      w.id, w.name, w.type, w.is_system, w.is_default, w.color, w.notes, w.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id',                  wa.id,
            'network_id',          wa.network_id,
            'network_name',        n.name,
            'network_native_asset', n.native_asset,
            'explorer_url',        COALESCE(wa.custom_explorer_url, n.explorer_url),
            'custom_network',      wa.custom_network,
            'address',             wa.address,
            'last_sync_at',        wa.last_sync_at,
            'last_known_balance',  wa.last_known_balance,
            'sync_status', (
              SELECT CASE
                WHEN bool_or(status = 'discrepancy') THEN 'discrepancy'
                WHEN bool_or(status = 'error') THEN 'error'
                WHEN COUNT(*) > 0 THEN 'ok'
                ELSE 'pending'
              END
              FROM (
                SELECT DISTINCT ON (asset) asset, status
                FROM balance_sync_log
                WHERE wallet_address_id = wa.id
                ORDER BY asset, checked_at DESC
              ) latest
            ),
            'sync_details', (
              SELECT COALESCE(json_agg(json_build_object(
                'asset', asset, 'onchain_balance', onchain_balance,
                'expected_balance', expected_balance, 'checked_at', checked_at, 'status', status
              )), '[]')
              FROM (
                SELECT DISTINCT ON (asset) asset, onchain_balance, expected_balance, checked_at, status
                FROM balance_sync_log
                WHERE wallet_address_id = wa.id
                ORDER BY asset, checked_at DESC
              ) latest
            )
          ) ORDER BY n.name
        ) FILTER (WHERE wa.id IS NOT NULL),
        '[]'
      ) AS addresses
    FROM wallets w
    LEFT JOIN wallet_addresses wa ON wa.wallet_id = w.id
    LEFT JOIN networks n ON n.id = wa.network_id
    WHERE
      w.type = 'exchange'
      OR w.is_system = FALSE
    GROUP BY w.id
    ORDER BY w.is_system DESC, w.created_at ASC
  `);
  res.json(wallets.rows);
});
```

- [ ] **Step 6: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/routes/wallets.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Ejecutar toda la suite del backend para confirmar que nada se rompió**

Run: `cd backend && npm test`
Expected: PASS (todos los tests, incluidos los del motor FIFO y los routes existentes)

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/wallets.ts backend/src/routes/wallets.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(api): endpoints de sync manual y gestión de API keys de proveedores"
```

---

## Task 16: UI — badges de estado, botón "Verificar ahora" y config de API key

**Files:**
- Modify: `frontend/src/pages/settings/WalletsSection.tsx`
- Modify: `frontend/src/api/portfolio.ts`

**Interfaces:**
- Consumes: `POST /api/wallets/:walletId/addresses/:addressId/sync`, `GET/PUT/DELETE /api/wallets/networks/:networkId/api-key` (Tarea 15); `addr.sync_status`/`addr.sync_details` ya vienen en `GET /api/wallets` (Tarea 15).

Sin test automatizado de UI en este plan (el proyecto no tiene suite de tests de frontend) — verificación manual en el navegador, siguiendo la norma del proyecto para cambios de frontend.

- [ ] **Step 1: Añadir los métodos de API en `frontend/src/api/portfolio.ts`**

Junto a `deleteAddress` (línea 176):

```ts
  syncAddress: (walletId: string, addressId: string) =>
    api.post<Array<{ asset: string; status: string; onchainBalance: number | null; expectedBalance: number; discrepancyPct: number | null }>>(
      `/wallets/${walletId}/addresses/${addressId}/sync`, {}
    ),
  getNetworkApiKeyStatus: (networkId: string) =>
    api.get<{ network_id: string; has_key: boolean; updated_at: string | null }>(`/wallets/networks/${networkId}/api-key`),
  setNetworkApiKey: (networkId: string, apiKey: string) =>
    api.put<{ success: boolean }>(`/wallets/networks/${networkId}/api-key`, { api_key: apiKey }),
  deleteNetworkApiKey: (networkId: string) =>
    api.delete<{ success: boolean }>(`/wallets/networks/${networkId}/api-key`),
```

- [ ] **Step 2: Añadir tipos y el componente de badge en `WalletsSection.tsx`**

Extender `AddressData` (línea 10-17) con:

```ts
interface SyncDetail {
  asset: string
  onchain_balance: number | null
  expected_balance: number
  checked_at: string
  status: 'ok' | 'discrepancy' | 'error'
}

interface AddressData {
  id: string
  network_name: string | null
  network_native_asset: string | null
  custom_network: string | null
  address: string | null
  explorer_url: string | null
  sync_status: 'ok' | 'discrepancy' | 'error' | 'pending'
  sync_details: SyncDetail[]
}
```

Añadir el import `RefreshCw` a la línea 5-7 (junto a los demás iconos de `lucide-react`).

Añadir el componente de badge, después de `CopyButton` (línea 65):

```tsx
const SYNC_BADGE: Record<AddressData['sync_status'], { label: string; className: string }> = {
  ok:          { label: 'Verificado', className: 'bg-accent-green/15 text-accent-green' },
  discrepancy: { label: 'Revisar',    className: 'bg-accent-amber/15 text-accent-amber' },
  error:       { label: 'Sin conexión', className: 'bg-accent-red/15 text-accent-red' },
  pending:     { label: 'Pendiente',  className: 'bg-gray-700/30 text-gray-500' },
}

function SyncBadge({ addr, onSync, syncing }: { addr: AddressData; onSync: () => void; syncing: boolean }) {
  const [showDetail, setShowDetail] = useState(false)
  const meta = SYNC_BADGE[addr.sync_status]

  return (
    <div className="relative flex items-center gap-1">
      <button onClick={() => setShowDetail(v => !v)}
        className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${meta.className}`}>
        {meta.label}
      </button>
      <button onClick={onSync} disabled={syncing}
        title="Verificar ahora"
        className="p-1 text-gray-600 hover:text-accent-blue disabled:opacity-40 transition-colors">
        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
      </button>
      {showDetail && addr.sync_details.length > 0 && (
        <div className="absolute top-6 left-0 z-10 w-64 rounded-lg border border-border bg-background-card p-2.5 shadow-lg space-y-1">
          {addr.sync_details.map(d => (
            <p key={d.asset} className="text-[11px] text-gray-400">
              <span className="font-medium text-gray-300">{d.asset}</span> — Real: {d.onchain_balance ?? '—'} · App: {d.expected_balance} 
              {d.status === 'discrepancy' && d.onchain_balance !== null && (
                <span className="text-accent-amber"> · Diferencia: {(d.onchain_balance - d.expected_balance).toFixed(6)}</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Integrar el badge en la fila de dirección**

Dentro de `WalletsSection`, añadir el estado de sincronización en curso (junto a los demás `useState`, línea ~307-315):

```ts
  const [syncingAddressId, setSyncingAddressId] = useState<string | null>(null)

  async function handleSyncAddress(walletId: string, addressId: string) {
    setSyncingAddressId(addressId)
    try {
      await portfolioApi.syncAddress(walletId, addressId)
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
    } finally {
      setSyncingAddressId(null)
    }
  }
```

En el `return` de cada dirección (dentro de `wallet.addresses.map(addr => ...)`, tras el bloque `{!isEditingAddr && (...)}` de los botones editar/borrar, línea ~520-529), añadir el badge cuando la dirección tiene `address` asignado:

```tsx
                          {!isEditingAddr && addr.address && (
                            <SyncBadge
                              addr={addr}
                              syncing={syncingAddressId === addr.id}
                              onSync={() => handleSyncAddress(wallet.id, addr.id)}
                            />
                          )}
```

- [ ] **Step 4: Añadir el formulario de API key en `AddAddressForm` (solo redes que la requieren)**

En `AddAddressForm` (línea 176-245), tras el bloque de selección de red y antes del campo de dirección, añadir un componente `NetworkApiKeyField` que solo se renderiza para las redes conocidas que la necesitan:

```tsx
const NETWORKS_REQUIRING_KEY = ['Ethereum', 'Cardano', 'Polkadot Asset Hub']

function NetworkApiKeyField({ networkId, networkName }: { networkId: string; networkName: string }) {
  const [status, setStatus] = useState<{ has_key: boolean } | null>(null)
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    portfolioApi.getNetworkApiKeyStatus(networkId).then(setStatus)
  }, [networkId])

  if (!NETWORKS_REQUIRING_KEY.includes(networkName)) return null

  async function handleSave() {
    if (!value) return
    setSaving(true)
    try {
      await portfolioApi.setNetworkApiKey(networkId, value)
      setStatus({ has_key: true })
      setValue('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1 pt-1">
      <label className="text-xs text-gray-500">
        API key de verificación on-chain (opcional)
        {status?.has_key && <span className="ml-1.5 text-accent-green">Configurada ✓</span>}
      </label>
      <div className="flex gap-1.5">
        <input type="password" value={value} onChange={e => setValue(e.target.value)}
          placeholder={status?.has_key ? 'Ya configurada — pega una nueva para reemplazarla' : 'Sin esta clave, esta red no se puede verificar automáticamente'}
          className="flex-1 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-xs placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
        <button onClick={handleSave} disabled={!value || saving}
          className="px-3 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
          Guardar
        </button>
      </div>
    </div>
  )
}
```

Necesita `useEffect` — añadir al import de React en la línea 1: `import { useState, useEffect } from 'react'`.

Insertar `<NetworkApiKeyField networkId={selected} networkName={selectedNetwork?.name ?? ''} />` dentro de `AddAddressForm`, justo después del bloque `{explorerHref && (...)}` (línea 209-214), condicionado a `!isCustom && selected`.

- [ ] **Step 5: Verificación manual en navegador**

Run: `docker compose up -d` (o el flujo de dev habitual), abrir Ajustes → Wallets:
- Confirmar que una dirección sin verificar muestra el badge "Pendiente".
- Pulsar "Verificar ahora" en la wallet fría de XRP (dirección real ya guardada) y confirmar que el badge pasa a "Verificado" con el saldo correcto.
- Añadir una red que requiera API key (Ethereum) y confirmar que aparece el campo, que guardar la key no la muestra en ningún response de red (inspeccionar Network tab), y que tras guardarla aparece "Configurada ✓".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/settings/WalletsSection.tsx frontend/src/api/portfolio.ts
git commit -m "feat(ui): badges de verificación on-chain, botón manual y config de API keys"
```

---

## Self-Review (registro de la autorrevisión)

- **Cobertura del spec:** modelo de datos → Tarea 1; seguridad de cifrado → Tarea 2; arquitectura de proveedores → Tareas 3-11; motor de sincronización + umbral + circuit breaker → Tareas 12-13; scheduler diario + botón manual → Tareas 14-15; UI/UX → Tarea 16. Retención de 90 días cubierta en `syncAllWalletAddresses` (Tarea 13). SSRF (`custom_explorer_url` nunca usado para fetch) — ninguna tarea lo toca para llamadas HTTP, solo se lee en el SELECT existente para el link de la UI (sin cambios). Todo cubierto.
- **Placeholders:** ninguno — cada paso de código tiene implementación real, sin TODOs.
- **Consistencia de tipos:** `BalanceProvider.getBalance(address, apiKey, contractAddress?)` es la firma usada de forma idéntica en las 8 implementaciones (Tareas 4-11) y en `walletSync.ts` (Tarea 13). `SyncResult` se define una vez (Tarea 13) y se reutiliza en la Tarea 15 (respuesta del endpoint) y Tarea 16 (tipo del lado frontend, redeclarado como literal por ser un archivo `.tsx` separado sin import cruzado backend/frontend — coherente con el resto del proyecto, que no comparte tipos entre ambos paquetes).
- **Dependencia entre tareas:** Tarea 12 (exportar `getOpenLots`) debe ejecutarse antes de la Tarea 13, que la consume — el orden del plan ya lo refleja.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-25-onchain-balance-verification.md`.**

Dos opciones de ejecución:

1. **Subagent-Driven (recomendado)** — despacho un subagente nuevo por tarea, reviso entre tareas, iteración rápida.
2. **Ejecución en esta sesión** — ejecuto las tareas en este chat con `executing-plans`, por lotes con puntos de control para tu revisión.

¿Cuál prefieres?
