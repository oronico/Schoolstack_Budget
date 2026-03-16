const envBase = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";

export function getApiBase(): string {
  return envBase;
}

export function setupFetchInterceptor() {
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = input.toString();

    if (url.startsWith('/api')) {
      if (envBase) {
        url = `${envBase}${url}`;
        input = url;
      }

      const token = localStorage.getItem('auth_token');

      if (token) {
        init = init || {};
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        init.headers = headers;
      }
    }

    return originalFetch(input, init);
  };
}
