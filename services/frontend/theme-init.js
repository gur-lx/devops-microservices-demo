// Applies the saved light/dark choice before the page paints.
try {
  if (localStorage.getItem('dashboard-theme') === 'light') {
    document.documentElement.dataset.theme = 'light';
  }
} catch {
  // Defaults to dark mode when storage is unavailable.
}
