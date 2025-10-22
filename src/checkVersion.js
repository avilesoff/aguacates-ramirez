// src/checkVersion.js

/**
 * Comprueba periódicamente /version.json y recarga la página si detecta nueva versión.
 * @param {Object} opts
 * @param {string} [opts.url='/version.json'] - Ruta del version.json (sirve desde /public)
 * @param {number} [opts.interval=60000] - Intervalo en ms entre chequeos
 * @returns {Function} cleanup - Llama a esta función si quieres detener el watcher
 */
export function startVersionWatcher({ url = '/version.json', interval = 60_000 } = {}) {
  let currentVersion = null;
  let timerId = null;

  async function fetchVersion() {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return null;
      return await res.json(); // { version, buildTime }
    } catch {
      return null;
    }
  }

  function schedule() {
    timerId = setTimeout(check, interval);
  }

  async function check() {
    const data = await fetchVersion();
    if (!data) {
      schedule();
      return;
    }

    const nextVersion = data.version || data.buildTime || '';

    // Primera vez: memoriza
    if (currentVersion === null) {
      currentVersion = nextVersion;
      schedule();
      return;
    }

    // Si cambió, recarga
    if (nextVersion && nextVersion !== currentVersion) {
      console.log('[version-check] Nueva versión detectada. Recargando…');
      window.location.reload();
      return;
    }

    schedule();
  }

  // Inicia el ciclo
  check();

  // Devuelve cleanup opcional
  return () => {
    if (timerId) clearTimeout(timerId);
  };
}
