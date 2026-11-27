// Copia schema.sql y las migraciones SQL a dist/ tras compilar (#114), para
// que el backend empaquetado pueda aplicarlas. En Node y no con mkdir/cp/find
// para que funcione también en Windows, donde npm ejecuta los scripts con
// cmd.exe (#205: el build de Windows fallaba con «The syntax of the command
// is incorrect»).
const fs = require('fs');
const path = require('path');

/** Copia los .sql de primer nivel de `from` a `to` y devuelve cuántos copió. */
function copySqlFiles(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  const names = fs.readdirSync(from, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.sql'))
    .map(e => e.name);
  for (const name of names) fs.copyFileSync(path.join(from, name), path.join(to, name));
  return names.length;
}

/**
 * Copia src/db/schema.sql, src/db/migrations/*.sql y el puente de
 * src/db/migrations/legado/*.sql (versión 1.0) a dist/db/. Las demás
 * subcarpetas (down/, reversiones a mano) no se copian.
 */
function copyDbAssets(root) {
  const src = path.join(root, 'src', 'db');
  const dest = path.join(root, 'dist', 'db');
  fs.mkdirSync(path.join(dest, 'migrations'), { recursive: true });
  fs.copyFileSync(path.join(src, 'schema.sql'), path.join(dest, 'schema.sql'));
  return copySqlFiles(path.join(src, 'migrations'), path.join(dest, 'migrations'))
    + copySqlFiles(path.join(src, 'migrations', 'legado'), path.join(dest, 'migrations', 'legado'));
}

/** Copia el paquete local de logos (src/assets/crypto-icons, #449) a dist/assets/. */
function copyIconAssets(root) {
  const src = path.join(root, 'src', 'assets', 'crypto-icons');
  const dest = path.join(root, 'dist', 'assets', 'crypto-icons');
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  const icons = fs.readdirSync(src, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.png'))
    .map(e => e.name);
  for (const name of icons) fs.copyFileSync(path.join(src, name), path.join(dest, name));
  return icons.length;
}

module.exports = { copyDbAssets, copyIconAssets };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const count = copyDbAssets(root);
  console.log(`[build] schema.sql y ${count} migraciones copiadas a dist/db`);
  console.log(`[build] ${copyIconAssets(root)} logos del paquete local copiados a dist/assets`);
}
