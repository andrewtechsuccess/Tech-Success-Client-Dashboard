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
  clientsVersion: () => req('GET', '/clients/version'),
  createClient: (c) => req('POST', '/clients', c),
  deleteClient: (id) => req('DELETE', `/clients/${id}`),

  // Field-level edits. Each sends only what changed, so a save can't revert
  // another user's concurrent work on the same client. All return the updated
  // client. Prefer these over updateClient.
  patchClient: (id, patch) => req('PATCH', `/clients/${id}`, patch),
  addProject: (id, project) => req('POST', `/clients/${id}/projects`, project),
  patchProject: (id, projectId, patch) => req('PATCH', `/clients/${id}/projects/${projectId}`, patch),
  deleteProject: (id, projectId) => req('DELETE', `/clients/${id}/projects/${projectId}`),
  addTask: (id, projectId, text) => req('POST', `/clients/${id}/projects/${projectId}/tasks`, { text }),
  patchTask: (id, projectId, taskId, patch) =>
    req('PATCH', `/clients/${id}/projects/${projectId}/tasks/${taskId}`, patch),
  deleteTask: (id, projectId, taskId) => req('DELETE', `/clients/${id}/projects/${projectId}/tasks/${taskId}`),
  addProduct: (id, product) => req('POST', `/clients/${id}/products`, product),
  patchProduct: (id, productId, patch) => req('PATCH', `/clients/${id}/products/${productId}`, patch),
  deleteProduct: (id, productId) => req('DELETE', `/clients/${id}/products/${productId}`),

  // Legacy whole-record replace — kept for the client-creation flow only.
  updateClient: (id, c) => req('PUT', `/clients/${id}`, c),
  addNote: (id, text) => req('POST', `/clients/${id}/notes`, { text }),
  deleteNote: (id, noteId) => req('DELETE', `/clients/${id}/notes/${noteId}`),
  catalog: () => req('GET', '/catalog'),
  setCatalog: (products) => req('PUT', '/catalog', { products }),
  backlog: () => req('GET', '/backlog'),
  setBacklogTemplates: (templates) => req('PUT', '/backlog/templates', { templates }),
  setBacklogEngineers: (engineers) => req('PUT', '/backlog/engineers', { engineers }),
  setBacklogTask: (id, patch) => req('PUT', `/clients/${id}/backlog`, patch)
};
