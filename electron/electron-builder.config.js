/**
 * electron-builder configuration
 * Docs: https://www.electron.build/configuration/configuration
 */

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.cryptofolio.app',
  productName: 'CryptoFolio',
  copyright: 'Copyright © 2026 CryptoFolio',

  // Archivos del proceso Electron (main + preload compilados).
  // Usamos la forma {from, to} para que electron-builder no aplique los
  // filtros de .gitignore — el directorio dist/ está gitignoreado pero sí
  // debe incluirse en el paquete (se genera en CI antes de empaquetar).
  files: [
    'compiled/**/*',
    'assets/**/*',
    'node_modules/**/*',
    'package.json',
  ],

  // Recursos adicionales copiados fuera del asar (accesibles en runtime)
  extraResources: [
    {
      // Backend compilado
      from: '../backend/dist',
      to:   'backend/dist',
      filter: ['**/*'],
    },
    {
      // Dependencias del backend
      from: '../backend/node_modules',
      to:   'backend/node_modules',
      filter: ['**/*', '!**/*.md', '!**/test/**', '!**/.bin/**'],
    },
    {
      // Frontend buildeado (HTML/JS/CSS estáticos)
      from: '../frontend/dist',
      to:   'frontend/dist',
      filter: ['**/*'],
    },
    {
      // Migraciones SQL para que el backend las ejecute en modo standalone
      from: '../backend/src/db',
      to:   'backend/src/db',
      filter: ['*.sql', 'migrations/*.sql'],
    },
  ],

  // embedded-postgres lanza binarios de PostgreSQL vía spawn().
  // spawn() del SO no puede atravesar rutas dentro de un .asar (Linux ve el
  // asar como fichero, no directorio → ENOTDIR). Deshabilitar asar evita
  // este problema sin sacrificar funcionalidad en una app de uso personal.
  asar: false,

  // ── Plataformas ────────────────────────────────────────────────────────────
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'assets/icon.ico',
    // certificateFile: process.env.CSC_LINK,  // descomenta cuando tengas cert
    // certificatePassword: process.env.CSC_KEY_PASSWORD,
  },

  nsis: {
    oneClick: false,
    perMachine: false,         // El usuario puede instalar sin admin
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CryptoFolio',
    installerIcon: 'assets/icon.ico',
    uninstallerIcon: 'assets/icon.ico',
    license: '../LICENSE',
  },

  mac: {
    target: [
      { target: 'dmg',  arch: ['x64', 'arm64'] },
      { target: 'zip',  arch: ['x64', 'arm64'] },
    ],
    icon: 'assets/icon.icns',
    category: 'public.app-category.finance',
    hardenedRuntime: true,
    entitlements: 'assets/entitlements.mac.plist',
    entitlementsInherit: 'assets/entitlements.mac.plist',
    // notarize: { teamId: process.env.APPLE_TEAM_ID },  // descomenta con cuenta Developer
  },

  dmg: {
    title: 'CryptoFolio ${version}',
    icon: 'assets/icon.icns',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  linux: {
    target: [
      { target: 'deb', arch: ['x64'] },
    ],
    icon: 'assets/',
    category: 'Finance',
    maintainer: 'CryptoFolio',
    description: 'Gestión de portfolio y fiscalidad crypto para España',
  },

  // ── Publicación en GitHub Releases ─────────────────────────────────────────
  publish: {
    provider: 'github',
    owner: 'SrMeirins',        // ← tu usuario de GitHub
    repo: 'CryptoFolio',
    releaseType: 'draft',   // draft → revisa artefactos en GitHub antes de publicar
  },

  // Directorio de salida de los instaladores
  directories: {
    output: '../releases',
    buildResources: 'assets',
  },
};
