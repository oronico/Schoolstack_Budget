export function setupFetchInterceptor() {
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();

    if (url.startsWith('/api')) {
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
