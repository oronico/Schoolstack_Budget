const envBase = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";
const API_BASE = envBase || (typeof window !== "undefined" && window.location.hostname.includes("netlify.app")
  ? "https://workspaceapi-server-production-bffd.up.railway.app"
  : "");

export function getApiBase(): string {
  return API_BASE;
}

export function setupFetchInterceptor() {
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = input.toString();

    if (url.startsWith('/api')) {
      if (API_BASE) {
        url = `${API_BASE}${url}`;
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
