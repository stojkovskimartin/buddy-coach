// Applies a saved light or dark choice before the first paint, so the page never flashes the
// other theme. A file (not inline) because the Content Security Policy allows only 'self'
// scripts. The key matches THEME_KEY in src/lib/theme.ts.
try {
  var theme = window.localStorage.getItem("buddy-theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }
} catch (e) {
  // Storage blocked: the device's setting applies.
}
