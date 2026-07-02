// Thin API client. Stores the JWT in localStorage and attaches it as a Bearer token.
const TOKEN_KEY = 'tscd_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req(method, url, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('tscd-logout'));
    throw new Error('Session expired — please sign in again.');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const api = {
  login: (password) => req('POST', '/auth/login', { password }),
  clients: () => req('GET', '/clients'),
  createClient: (c) => req('POST', '/clients', c),
  updateClient: (id, c) => req('PUT', `/clients/${id}`, c),
  deleteClient: (id) => req('DELETE', `/clients/${id}`),
  addNote: (id, text) => req('POST', `/clients/${id}/notes`, { text }),
  deleteNote: (id, noteId) => req('DELETE', `/clients/${id}/notes/${noteId}`),
  catalog: () => req('GET', '/catalog'),
  setCatalog: (products) => req('PUT', '/catalog', { products })
};
