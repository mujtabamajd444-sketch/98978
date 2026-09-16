export const APP_VERSION = '1.0.2';

type VersionFile = { version?: unknown };

export async function getAvailableVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json?checked=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return null;
    const data = await response.json() as VersionFile;
    return typeof data.version === 'string' && data.version.trim() ? data.version.trim() : null;
  } catch {
    return null;
  }
}

export async function clearApplicationCacheAndReload() {
  if ('caches' in window) {
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator) {
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
  }
  window.location.reload();
}
