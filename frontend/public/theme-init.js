// Aplica el tema guardado antes del primer pintado, sin destello del otro
// tema (#197). Fichero propio y no script en línea: la CSP de producción solo
// permite scripts del mismo origen (script-src 'self'). La app escribe aquí el
// tema efectivo (utils/theme.ts, THEME_STORAGE_KEY) cada vez que lo aplica.
(function () {
  var theme = 'dark';
  try {
    if (window.localStorage.getItem('cflio_theme_effective') === 'light') theme = 'light';
  } catch (e) {
    // Almacenamiento bloqueado: tema oscuro por defecto.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
