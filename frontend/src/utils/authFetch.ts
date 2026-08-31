/**
 * Global fetch interceptor that keeps the Scrolic session sticky.
 *
 * On successful Google OAuth callback the backend sets a `scrolic_uid` cookie
 * carrying the logged-in Scrolic user id. Scrolic's Express server reads
 * `x-session-user-id` on every /api/* request and falls back to a shared
 * module-level variable when the header is missing. Patching fetch to always
 * echo the cookie into that header makes login persistent per-user and
 * resistant to Node hot-reload resetting the module-level default.
 */

export function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

try {
  const nativeFetch = window.fetch.bind(window);
  const customFetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const uid = readCookie('scrolic_uid') || localStorage.getItem('scrolic_user_id');
    if (uid) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('x-session-user-id')) {
        headers.set('x-session-user-id', uid);
      }
      init = { ...init, headers };
    }
    return nativeFetch(input as any, init);
  }) as typeof window.fetch;

  try {
    window.fetch = customFetch;
  } catch {
    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      writable: true,
      configurable: true,
    });
  }
} catch (err) {
  console.warn('Could not wrap window.fetch:', err);
}

export {};
