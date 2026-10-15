// Copia schema.sql y las migraciones SQL a dist/ tras compilar (#114), para
// que el backend empaquetado pueda aplicarlas. En Node y no con mkdir/cp/find
// para que funcione también en Windows, donde npm ejecuta los scripts con
// cmd.exe (#205: el build de Windows fallaba con «The syntax of the command
// is incorrect»).
const fs = require('fs');
const path = require('path');

/** Copia src/db/schema.sql y src/db/migrations/*.sql (sin subcarpetas) a dist/db/. */
function copyDbAssets(root) {
  const src = path.join(root, 'src', 'db');
  const dest = path.join(root, 'dist', 'db');
  fs.mkdirSync(path.join(dest, 'migrations'), { recursive: true });
  fs.copyFileSync(path.join(src, 'schema.sql'), path.join(dest, 'schema.sql'));
  const migrations = fs.readdirSync(path.join(src, 'migrations'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.sql'))
    .map(e => e.name);
  for (const name of migrations) {
    fs.copyFileSync(path.join(src, 'migrations', name), path.join(dest, 'migrations', name));
  }
  return migrations.length;
}

module.exports = { copyDbAssets };

if (require.main === module) {
  const count = copyDbAssets(path.resolve(__dirname, '..'));
  console.log(`[build] schema.sql y ${count} migraciones copiadas a dist/db`);
}
