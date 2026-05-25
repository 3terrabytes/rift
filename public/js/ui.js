import { ITEM_INFO } from './items.js';

export class UI {
  constructor() {
    this.authScreen     = document.getElementById('auth-screen');
    this.worldsScreen   = document.getElementById('worlds-screen');
    this.gameScreen     = document.getElementById('game-screen');
    this.loading        = document.getElementById('loading-overlay');
    this.hotbar         = document.getElementById('hotbar');
    this.invGrid        = document.getElementById('inv-grid');
    this.recipeList     = document.getElementById('recipe-list');
    this.buildList      = document.getElementById('build-list');
    this.permList       = document.getElementById('perm-list');
    this.chatLog        = document.getElementById('chat-log');
    this.chatForm       = document.getElementById('chat-form');
    this.chatInput      = document.getElementById('chat-input');
    this.worldTitle     = document.getElementById('world-title');
    this.minimap        = document.getElementById('minimap');
    this.coordsEl       = document.getElementById('coords');
    this._buildCallback = () => {};
  }

  showAuth()   { this._show('auth-screen'); }
  showWorlds() { this._show('worlds-screen'); }
  showGame()   { this._show('game-screen'); }

  _show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
    document.getElementById(id).classList.add('active');
  }

  showLoading() { this.loading.classList.remove('hidden'); }
  hideLoading() { this.loading.classList.add('hidden'); }

  setWorldTitle(name) { this.worldTitle.textContent = name; }

  chatLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    this.chatLog.appendChild(div);
    while (this.chatLog.childNodes.length > 30) this.chatLog.removeChild(this.chatLog.firstChild);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  isChatActive() { return this.chatForm.classList.contains('active'); }
  openChat()  { this.chatForm.classList.add('active'); this.chatInput.focus(); }
  closeChat() { this.chatForm.classList.remove('active'); this.chatInput.value = ''; this.chatInput.blur(); }

  closeAllPanels() {
    for (const p of document.querySelectorAll('.panel')) p.classList.add('hidden');
  }

  togglePanel(name) {
    const el = document.getElementById('panel-' + name);
    if (!el) return;
    const open = !el.classList.contains('hidden');
    this.closeAllPanels();
    if (!open) el.classList.remove('hidden');
  }

  renderInventory(inv) {
    this.invGrid.innerHTML = '';
    const keys = Object.keys(inv).filter(k => inv[k] > 0).sort();
    const slots = 20;
    for (let i = 0; i < slots; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      if (keys[i]) {
        cell.classList.add('has-item');
        const info = ITEM_INFO[keys[i]] || { name: keys[i] };
        cell.innerHTML = `<div class="name">${info.name}</div><div class="qty">${inv[keys[i]]}</div>`;
      } else {
        cell.textContent = '-';
      }
      this.invGrid.appendChild(cell);
    }
  }

  renderHotbar(inv) {
    this.hotbar.innerHTML = '';
    const tools = ['pickaxe','axe','lantern','rune_key'];
    const resources = ['wood','stone','crystal','plant','mineral'];
    const slots = [...tools, ...resources];
    for (const k of slots) {
      const slot = document.createElement('div');
      slot.className = 'slot' + ((inv[k] || 0) > 0 ? ' active' : '');
      const info = ITEM_INFO[k] || { name: k };
      slot.innerHTML = `<div>${info.name.slice(0, 4)}</div>${inv[k] ? `<div class="qty">${inv[k]}</div>` : ''}`;
      this.hotbar.appendChild(slot);
    }
  }

  renderRecipes(recipes, inv, craftFn) {
    this.recipeList.innerHTML = '';
    for (const r of recipes) {
      const div = document.createElement('div');
      div.className = 'recipe';
      const costStr = Object.entries(r.inputs).map(([k, v]) => {
        const have = inv[k] || 0;
        const enough = have >= v;
        return `<span style="color:${enough ? '#7ee787' : '#ff7a7a'}">${v} ${ITEM_INFO[k]?.name || k}</span>`;
      }).join(', ');
      const canCraft = Object.entries(r.inputs).every(([k, v]) => (inv[k] || 0) >= v);
      div.innerHTML = `
        <div class="info">
          <div class="name">${r.name}</div>
          <div class="cost">${costStr}</div>
        </div>
        <button class="px-btn small" ${canCraft ? '' : 'disabled style="opacity:0.5"'}>Craft</button>`;
      div.querySelector('button').addEventListener('click', () => craftFn(r.key));
      this.recipeList.appendChild(div);
    }
  }

  renderBuildList(keys, inv, activeKey, onSelect) {
    this._buildCallback = onSelect;
    this.buildList.innerHTML = '';
    for (const k of keys) {
      const cell = document.createElement('div');
      cell.className = 'build-cell' + (activeKey === k ? ' active' : '');
      const info = ITEM_INFO[k] || { name: k };
      const qty = inv[k] || 0;
      cell.innerHTML = `<div>${info.name}</div><div class="qty">${qty}</div>`;
      cell.addEventListener('click', () => onSelect(k));
      this.buildList.appendChild(cell);
    }
  }

  renderPermissions(perms, role, onInvite, onRevoke) {
    this.permList.innerHTML = '';
    for (const p of perms) {
      const row = document.createElement('div');
      row.className = 'perm-row';
      row.innerHTML = `<span>${p.username}</span><span class="role">${p.role}</span>`;
      if (role === 'owner' && p.role !== 'owner') {
        const btn = document.createElement('button');
        btn.className = 'px-btn small';
        btn.textContent = 'Revoke';
        btn.addEventListener('click', () => onRevoke(p.user_id));
        row.appendChild(btn);
      }
      this.permList.appendChild(row);
    }
    const form = document.getElementById('invite-form');
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const username = fd.get('username');
      if (username && role === 'owner') onInvite(username);
      form.reset();
    };
  }
}
