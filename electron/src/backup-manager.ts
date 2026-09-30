import fs from 'fs';
import path from 'path';

const FILE_PREFIX = 'cryptofolio_';
const FILE_SUFFIX = '.json';

/**
 * Backup automático semanal para la app de escritorio. El Postgres embebido
 * (embedded-postgres) NO incluye pg_dump — solo initdb/pg_ctl/postgres —
 * así que, a diferencia del stack Docker (pg_dump binario real), aquí se
 * reutiliza el mismo endpoint que ya usa el botón manual "Exportar backup"
 * de Settings (GET /api/settings/backup): un backup lógico de los datos de
 * la app (transacciones/wallets/config), no un dump binario completo.
 *
 * `fetchBackupData` se inyecta en vez de construir la URL internamente —
 * desacopla esta clase de los detalles de red/puerto y la hace testeable
 * sin un backend real corriendo (mismo criterio de testabilidad que
 * secrets-manager.ts: recibe sus dependencias por parámetro).
 */
export class BackupManager {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly backupDir: string,
    private readonly fetchBackupData: () => Promise<unknown>,
    private readonly intervalMs: number = 7 * 24 * 60 * 60 * 1000, // semanal
    private readonly retentionCount: number = 14,
  ) {}

  /** Backup inicial inmediato + uno periódico mientras la app esté abierta. */
  start(): void {
    this.runBackupNow().catch((e) => console.error('[backup] Error en el backup inicial:', (e as Error).message));
    this.timer = setInterval(() => {
      this.runBackupNow().catch((e) => console.error('[backup] Error:', (e as Error).message));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runBackupNow(): Promise<string> {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const data = await this.fetchBackupData();

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(this.backupDir, `${FILE_PREFIX}${ts}${FILE_SUFFIX}`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
    console.log(`[backup] Escrito ${file}`);

    this.enforceRetention();
    return file;
  }

  private enforceRetention(): void {
    const files = fs.readdirSync(this.backupDir)
      .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX))
      .map((f) => {
        const full = path.join(this.backupDir, f);
        return { path: full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const f of files.slice(this.retentionCount)) {
      fs.unlinkSync(f.path);
    }
  }
}
