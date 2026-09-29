import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const CONFIG_FILE = 'electron-secrets.json';

interface SecretsConfig {
  // Clave maestra AES-256 (32 bytes en base64) que cifra las API keys de
  // proveedores on-chain guardadas en BD (network_api_keys). Sin ella, el
  // backend rechaza cualquier operación de cifrado/descifrado — ver
  // backend/src/modules/walletSync/apiKeyCrypto.ts:loadMasterKey().
  // En Docker la genera scripts/dev-env.sh o la fija el usuario en .env; en
  // Electron no hay ningún .env que el usuario final pueda editar, así que
  // se genera una vez y se persiste (mismo patrón que el password de
  // Postgres en postgres-manager.ts).
  walletSyncEncryptionKey: string;
}

/**
 * Recibe el directorio de datos de usuario en vez de llamar a
 * `app.getPath('userData')` internamente — permite testear la lógica de
 * generación/persistencia con un directorio temporal real, sin depender del
 * runtime de Electron (que no está disponible en el test runner).
 */
export class SecretsManager {
  private readonly configPath: string;
  private config!: SecretsConfig;

  constructor(userDataDir: string) {
    this.configPath = path.join(userDataDir, CONFIG_FILE);
  }

  get walletSyncEncryptionKey(): string {
    return this.config.walletSyncEncryptionKey;
  }

  /** Carga la config existente o genera una nueva la primera vez. Idempotente. */
  loadOrCreate(): void {
    if (fs.existsSync(this.configPath)) {
      this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as SecretsConfig;
      return;
    }
    this.config = {
      // 32 bytes reales en base64 — mismo formato que loadMasterKey() espera
      // decodificar (`Buffer.from(b64, 'base64').length === 32`).
      walletSyncEncryptionKey: crypto.randomBytes(32).toString('base64'),
    };
    // mode 0o600: solo el dueño del fichero puede leer/escribir (mismo
    // criterio que electron-db.json en postgres-manager.ts).
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), { mode: 0o600 });
  }
}
