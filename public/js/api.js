const TOKEN_KEY = 'rift.token';
const USER_KEY  = 'rift.user';

export const Auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user()  { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } },
  set(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = Auth.token;
  if (t) headers.Authorization = `Bearer ${t}`;
  const r = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

export const API = {
  register: (body) => req('POST', '/api/auth/register', body),
  login:    (body) => req('POST', '/api/auth/login', body),
  logout:   ()     => req('POST', '/api/auth/logout'),
  me:       ()     => req('GET',  '/api/auth/me'),
  resetReq: (email) => req('POST', '/api/auth/password-reset/request', { email }),
  resetConfirm: (token, password) => req('POST', '/api/auth/password-reset/confirm', { token, password }),

  worlds:        () => req('GET', '/api/worlds'),
  createWorld:   (name) => req('POST', '/api/worlds', { name }),
  getWorld:      (id) => req('GET', `/api/worlds/${id}`),
  saveWorld:     (id, state) => req('PUT', `/api/worlds/${id}/state`, state),
  invite:        (id, username) => req('POST', `/api/worlds/${id}/invite`, { username }),
  revoke:        (id, userId) => req('DELETE', `/api/worlds/${id}/invite/${userId}`),
  deleteWorld:   (id) => req('DELETE', `/api/worlds/${id}`),

  character:     () => req('GET', '/api/character'),
  saveCharacter: (body) => req('PUT', '/api/character', body),

  inventory:     () => req('GET', '/api/inventory'),
  addInv:        (item_key, quantity) => req('POST', '/api/inventory/add', { item_key, quantity }),
  consumeInv:    (item_key, quantity) => req('POST', '/api/inventory/consume', { item_key, quantity }),

  recipes:       () => req('GET', '/api/crafting/recipes'),
  craft:         (recipe_key) => req('POST', '/api/crafting/craft', { recipe_key }),

  exportRift:    async (worldId) => {
    const r = await fetch(`/api/rift/export/${worldId}`, {
      headers: { Authorization: `Bearer ${Auth.token}` },
    });
    if (!r.ok) throw new Error('export failed');
    return r.blob();
  },
  importRift:    (fileBase64, overwrite_world_id) =>
    req('POST', '/api/rift/import', { file: fileBase64, overwrite_world_id }),
};
