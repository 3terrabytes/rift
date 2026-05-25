import { API, Auth } from './api.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const ui = new UI();
let game = null;

// ---------- Auth screen ----------
const loginForm    = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const resetForm    = document.getElementById('reset-form');
const authError    = document.getElementById('auth-error');

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    loginForm.classList.toggle('hidden', btn.dataset.tab !== 'login');
    registerForm.classList.toggle('hidden', btn.dataset.tab !== 'register');
    resetForm.classList.add('hidden');
    authError.textContent = '';
  });
});

document.getElementById('open-reset').addEventListener('click', () => {
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  resetForm.classList.remove('hidden');
  authError.textContent = '';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const fd = new FormData(loginForm);
  try {
    const { token, user } = await API.login({ username: fd.get('username'), password: fd.get('password') });
    Auth.set(token, user);
    await openWorldsScreen();
  } catch (err) { authError.textContent = err.message; }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const fd = new FormData(registerForm);
  try {
    const { token, user } = await API.register({
      username: fd.get('username'),
      email:    fd.get('email'),
      password: fd.get('password'),
    });
    Auth.set(token, user);
    await openWorldsScreen();
  } catch (err) { authError.textContent = err.message; }
});

resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const fd = new FormData(resetForm);
  const email = fd.get('email');
  if (!email) return;
  try {
    const { reset_token } = await API.resetReq(email);
    const line = document.getElementById('reset-token-line');
    if (reset_token) {
      line.textContent = 'Reset token (dev): ' + reset_token;
      line.classList.remove('hidden');
    } else {
      line.textContent = 'If this email exists, a token was sent.';
      line.classList.remove('hidden');
    }
  } catch (err) { authError.textContent = err.message; }
});

document.getElementById('confirm-reset').addEventListener('click', async () => {
  authError.textContent = '';
  const fd = new FormData(resetForm);
  try {
    await API.resetConfirm(fd.get('token'), fd.get('password'));
    authError.textContent = 'Password updated. Sign in.';
  } catch (err) { authError.textContent = err.message; }
});

// ---------- Worlds screen ----------
const worldList = document.getElementById('world-list');
const worldsError = document.getElementById('worlds-error');

async function openWorldsScreen() {
  ui.showWorlds();
  document.getElementById('who-username').textContent = (Auth.user?.username || '');
  await refreshWorlds();
}

async function refreshWorlds() {
  worldList.innerHTML = '';
  worldsError.textContent = '';
  try {
    const { worlds } = await API.worlds();
    if (!worlds.length) {
      const empty = document.createElement('li');
      empty.innerHTML = '<div>No worlds yet. Create your first one.</div>';
      worldList.appendChild(empty);
    }
    for (const w of worlds) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <div>${w.name}</div>
          <div class="meta">Owner: ${w.owner_username} - Role: ${w.role} - Updated: ${new Date(w.updated_at).toLocaleString()}</div>
        </div>
        <div class="actions">
          <button class="px-btn primary small" data-enter>Enter the Rift</button>
          ${w.role === 'owner' ? `<button class="px-btn small" data-export>Export .rift</button>` : ''}
          ${w.role === 'owner' ? `<button class="px-btn small" data-delete>Delete</button>` : ''}
        </div>`;
      li.querySelector('[data-enter]').addEventListener('click', () => enterWorld(w.id));
      const exportBtn = li.querySelector('[data-export]');
      if (exportBtn) exportBtn.addEventListener('click', async () => {
        try {
          const blob = await API.exportRift(w.id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const safe = w.name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'world';
          a.href = url; a.download = `${safe}.rift`;
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        } catch (err) { worldsError.textContent = 'Export failed: ' + err.message; }
      });
      const delBtn = li.querySelector('[data-delete]');
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this world? This cannot be undone.')) return;
        try { await API.deleteWorld(w.id); await refreshWorlds(); }
        catch (err) { worldsError.textContent = err.message; }
      });
      worldList.appendChild(li);
    }
  } catch (err) {
    worldsError.textContent = err.message;
    if (err.status === 401) { Auth.clear(); ui.showAuth(); }
  }
}

document.getElementById('new-world-btn').addEventListener('click', async () => {
  const name = prompt('Name your world:', 'My Rift') || 'My Rift';
  try {
    await API.createWorld(name.trim());
    await refreshWorlds();
  } catch (err) { worldsError.textContent = err.message; }
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  worldsError.textContent = '';
  try {
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const r = await API.importRift(b64);
    await refreshWorlds();
    alert('World imported. (id ' + r.world_id + ')');
  } catch (err) {
    worldsError.textContent = 'Import failed: ' + err.message;
  } finally {
    e.target.value = '';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await API.logout(); } catch {}
  Auth.clear();
  ui.showAuth();
});

// ---------- Game screen ----------
async function enterWorld(worldId) {
  ui.showGame();
  if (game) game.stop();
  const canvas = document.getElementById('game-canvas');
  game = new Game(canvas, ui);
  await game.enter(worldId);
}

document.getElementById('leave-btn').addEventListener('click', async () => {
  if (game) { try { await game._save(); } catch {} game.stop(); game = null; }
  await openWorldsScreen();
});

document.querySelectorAll('[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => ui.togglePanel(btn.dataset.panel));
});
document.querySelectorAll('.panel .close').forEach(btn => {
  btn.addEventListener('click', () => ui.closeAllPanels());
});
document.getElementById('invite-btn').addEventListener('click', () => ui.togglePanel('permissions'));
document.getElementById('export-btn').addEventListener('click', () => { if (game) game.exportRift(); });

document.getElementById('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = document.getElementById('chat-input').value.trim();
  if (text && game) game.sendChat(text);
  ui.closeChat();
});

// ---------- Startup ----------
(async function start() {
  if (Auth.token) {
    try {
      const { user } = await API.me();
      if (user) { Auth.set(Auth.token, user); await openWorldsScreen(); return; }
    } catch { Auth.clear(); }
  }
  ui.showAuth();
})();
