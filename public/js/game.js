import { API, Auth } from './api.js';
import { Renderer } from './renderer.js';
import { Network } from './network.js';
import { generateWorld, findSpawn, isWalkable, WORLD_SIZE } from './world.js';

const KEY_DIR = {
  ArrowUp:    { dx:  0, dy: -1, dir: 'north' },
  ArrowDown:  { dx:  0, dy:  1, dir: 'south' },
  ArrowLeft:  { dx: -1, dy:  0, dir: 'west'  },
  ArrowRight: { dx:  1, dy:  0, dir: 'east'  },
  KeyW: { dx: 0, dy: -1, dir: 'north' },
  KeyS: { dx: 0, dy:  1, dir: 'south' },
  KeyA: { dx: -1, dy: 0, dir: 'west' },
  KeyD: { dx: 1, dy:  0, dir: 'east' },
};

const PLACEABLES = ['planks','stone_tile','wood_door','flower_pot','lantern'];

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.renderer = new Renderer(canvas);
    this.network = new Network();
    this.world = null;
    this.players = {};         // id -> {x,y,dir,anim,username}
    this.localPlayer = null;   // also held in players[myId]
    this.myId = null;
    this.role = 'guest';
    this.worldId = null;
    this.worldMeta = null;
    this.lastSent = { x: -1, y: -1, dir: '', anim: '' };
    this.lastSavedAt = 0;
    this.build = { activeKey: null, cursor: null };
    this.inventory = {};       // key -> qty
    this.recipes = [];
    this.permissions = [];
    this.running = false;
    this.heldKeys = new Set();
    this.lastStepAt = 0;
    this._installInput();
    this._installNetwork();
  }

  _installInput() {
    addEventListener('keydown', (e) => {
      if (this.ui.isChatActive() && e.code !== 'Escape') return;
      if (e.code === 'KeyT' && !this.ui.isChatActive()) {
        this.ui.openChat();
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') { this.ui.closeAllPanels(); this.ui.closeChat(); return; }
      if (KEY_DIR[e.code]) { this.heldKeys.add(e.code); e.preventDefault(); }
      if (e.code === 'Space') this._interactNearest();
    });
    addEventListener('keyup', (e) => {
      this.heldKeys.delete(e.code);
      if (this.localPlayer && this.heldKeys.size === 0) {
        this.localPlayer.anim = 'idle';
      }
    });

    this.canvas.addEventListener('click', (e) => this._handleClick(e, false));
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this._handleClick(e, true); });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.build.activeKey) { this.build.cursor = null; return; }
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const t = this.renderer.pickTile(px, py);
      this.build.cursor = (t.x >= 0 && t.y >= 0 && t.x < WORLD_SIZE && t.y < WORLD_SIZE) ? t : null;
    });
  }

  _installNetwork() {
    this.network.addEventListener('msg', (e) => this._handleMessage(e.detail));
    this.network.addEventListener('close', () => {
      this.ui.chatLine('Disconnected.', 'sys');
    });
  }

  _handleMessage(msg) {
    switch (msg.t) {
      case 'hello': {
        this.myId = msg.you.id;
        this.role = msg.you.role;
        for (const p of msg.players) {
          this.players[p.id] = { ...p, local: p.id === this.myId };
        }
        // Reposition the local player at the saved character location, if it
        // matches this world, otherwise at the world's safe spawn point.
        const me = this.players[this.myId] || { id: this.myId, username: msg.you.username, dir: 'south', anim: 'idle', local: true };
        const useSaved = this.savedCharacter && Number(this.savedCharacter.last_world) === Number(this.worldId);
        if (useSaved) { me.x = this.savedCharacter.last_x; me.y = this.savedCharacter.last_y; }
        else { const s = findSpawn(this.world); me.x = s.x; me.y = s.y; }
        this.players[this.myId] = me;
        this.localPlayer = me;
        this.ui.chatLine(msg.message, 'sys');
        break;
      }
      case 'join': {
        this.players[msg.id] = { id: msg.id, username: msg.username, x: msg.x, y: msg.y, dir: msg.dir, anim: 'idle' };
        this.ui.chatLine(`A traveler is entering the Rift.`, 'sys');
        break;
      }
      case 'leave': {
        delete this.players[msg.id];
        this.ui.chatLine(`${msg.username} left.`, 'sys');
        break;
      }
      case 'move': {
        const p = this.players[msg.id];
        if (p) { p.x = msg.x; p.y = msg.y; p.dir = msg.dir; p.anim = msg.anim; }
        break;
      }
      case 'place': {
        // Replace any existing object at the tile, then add new.
        this.world.placed = this.world.placed.filter(p => !(p.x === msg.tile.x && p.y === msg.tile.y));
        this.world.placed.push(msg.tile);
        break;
      }
      case 'remove': {
        this.world.placed = this.world.placed.filter(p => !(p.x === msg.tile.x && p.y === msg.tile.y));
        break;
      }
      case 'gather': {
        // Remove the node visually for everyone.
        this.world.nodes = this.world.nodes.filter(n => !(n.x === msg.node.x && n.y === msg.node.y));
        break;
      }
      case 'puzzle': {
        const key = msg.key;
        if (this.world.puzzles[key]) this.world.puzzles[key].solved = !!msg.state;
        break;
      }
      case 'shrine': {
        const key = msg.key;
        if (this.world.shrines[key]) this.world.shrines[key].active = !!msg.active;
        if (msg.active) this.ui.chatLine('A shrine awakens.', 'sys');
        break;
      }
      case 'chat': {
        this.ui.chatLine(`<${msg.from}> ${msg.text}`);
        break;
      }
      case 'emote': {
        const p = this.players[msg.id];
        if (p) p.anim = 'interact';
        setTimeout(() => { if (p) p.anim = 'idle'; }, 600);
        break;
      }
    }
  }

  async enter(worldId) {
    this.worldId = worldId;
    this.ui.showLoading();
    const { world, state, permissions, role } = await API.getWorld(worldId);
    this.worldMeta = world;
    this.role = role;
    this.permissions = permissions;
    // Generate base world from seed, then apply persisted overlays.
    const w = generateWorld(Number(world.seed));
    if (state) {
      if (Array.isArray(state.placed)) w.placed = state.placed;
      if (state.puzzles && typeof state.puzzles === 'object') w.puzzles = { ...w.puzzles, ...state.puzzles };
      if (state.shrines && typeof state.shrines === 'object') w.shrines = { ...w.shrines, ...state.shrines };
      if (Array.isArray(state.unlocks)) w.unlocks = state.unlocks;
    }
    this.world = w;
    try { const { character } = await API.character(); this.savedCharacter = character; } catch {}
    await this._refreshInventory();
    await this._refreshRecipes();
    this.ui.setWorldTitle(world.name);
    this.ui.renderPermissions(permissions, role, async (username) => {
      try {
        await API.invite(this.worldId, username);
        const fresh = await API.getWorld(this.worldId);
        this.permissions = fresh.permissions;
        this.ui.renderPermissions(fresh.permissions, this.role);
      } catch (err) { this.ui.chatLine('Invite failed: ' + err.message, 'sys'); }
    }, async (userId) => {
      await API.revoke(this.worldId, userId);
      const fresh = await API.getWorld(this.worldId);
      this.permissions = fresh.permissions;
      this.ui.renderPermissions(fresh.permissions, this.role);
    });
    this.network.connect(Auth.token, worldId);
    this.ui.hideLoading();
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (ts) => {
      if (!this.running) return;
      this._update(ts);
      this.renderer.draw(this.world, this.players, this.localPlayer, this.build);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    this.network.close();
    this.players = {};
    this.localPlayer = null;
    this.world = null;
  }

  _update(ts) {
    // Movement: tile-stepping with cooldown.
    if (this.localPlayer && ts - this.lastStepAt > 140) {
      let stepped = false;
      for (const code of this.heldKeys) {
        const dir = KEY_DIR[code];
        if (!dir) continue;
        const nx = this.localPlayer.x + dir.dx;
        const ny = this.localPlayer.y + dir.dy;
        this.localPlayer.dir = dir.dir;
        if (isWalkable(this.world, nx, ny)) {
          this.localPlayer.x = nx;
          this.localPlayer.y = ny;
          this.localPlayer.anim = 'walk';
          stepped = true;
          this.lastStepAt = ts;
        }
        break;
      }
      if (!stepped && this.heldKeys.size === 0) this.localPlayer.anim = 'idle';
    }

    // Network sync (only when changed).
    if (this.localPlayer) {
      const p = this.localPlayer;
      if (p.x !== this.lastSent.x || p.y !== this.lastSent.y || p.dir !== this.lastSent.dir || p.anim !== this.lastSent.anim) {
        this.network.send({ t: 'move', x: p.x, y: p.y, dir: p.dir, anim: p.anim });
        this.lastSent = { x: p.x, y: p.y, dir: p.dir, anim: p.anim };
      }
    }

    // Auto-save every 20 seconds.
    if (this.localPlayer && ts - this.lastSavedAt > 20000) {
      this.lastSavedAt = ts;
      this._save().catch(() => {});
    }
  }

  async _save() {
    if (!this.worldId || !this.world) return;
    await API.saveWorld(this.worldId, {
      placed: this.world.placed,
      puzzles: this.world.puzzles,
      shrines: this.world.shrines,
      unlocks: this.world.unlocks,
    });
    if (this.localPlayer) {
      await API.saveCharacter({
        last_x: this.localPlayer.x,
        last_y: this.localPlayer.y,
        last_world: Number(this.worldId),
      });
    }
  }

  async _refreshInventory() {
    const { items } = await API.inventory();
    this.inventory = {};
    for (const i of items) this.inventory[i.item_key] = i.quantity;
    this.ui.renderInventory(this.inventory);
    this.ui.renderHotbar(this.inventory);
    this._renderBuildList();
  }

  _renderBuildList() {
    this.ui.renderBuildList(PLACEABLES, this.inventory, this.build.activeKey, (key) => {
      this.build.activeKey = (this.build.activeKey === key) ? null : key;
      this._renderBuildList();
    });
  }

  async _refreshRecipes() {
    const { recipes } = await API.recipes();
    this.recipes = recipes;
    this.ui.renderRecipes(recipes, this.inventory, async (key) => {
      try {
        await API.craft(key);
        await this._refreshInventory();
        this.ui.chatLine('Crafted: ' + key, 'sys');
      } catch (err) {
        this.ui.chatLine('Craft failed: ' + err.message, 'sys');
      }
    });
  }

  async _interactNearest() {
    if (!this.localPlayer) return;
    const px = this.localPlayer.x, py = this.localPlayer.y;
    // Search adjacent tiles + current tile.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx, ty = py + dy;
        // Gather node?
        const node = this.world.nodes.find(n => n.x === tx && n.y === ty);
        if (node) {
          await API.addInv(node.resource, 1);
          this.network.send({ t: 'gather', node });
          this.world.nodes = this.world.nodes.filter(n => !(n.x === tx && n.y === ty));
          await this._refreshInventory();
          this.localPlayer.anim = 'interact';
          this.network.send({ t: 'emote', emote: 'gather' });
          setTimeout(() => { if (this.localPlayer) this.localPlayer.anim = 'idle'; }, 300);
          this.ui.chatLine(`Gathered ${node.resource}.`, 'sys');
          return;
        }
        // Shrine?
        const sKey = `${tx},${ty}`;
        if (this.world.shrines[sKey]) {
          const sh = this.world.shrines[sKey];
          if (sh.active) { this.ui.chatLine('The shrine glows softly.', 'sys'); return; }
          if ((this.inventory.rune_key || 0) > 0) {
            await API.consumeInv('rune_key', 1);
            sh.active = true;
            this.network.send({ t: 'shrine', key: sKey, active: true });
            if (!this.world.unlocks.includes('shrine_' + sKey)) this.world.unlocks.push('shrine_' + sKey);
            await this._refreshInventory();
            this.ui.chatLine('You activate the shrine.', 'sys');
          } else {
            this.ui.chatLine('A shrine. It needs a Rune Key.', 'sys');
          }
          return;
        }
        // Puzzle (toggle pressure plate / switch)?
        if (this.world.puzzles[sKey]) {
          const pz = this.world.puzzles[sKey];
          pz.solved = !pz.solved;
          this.network.send({ t: 'puzzle', key: sKey, state: pz.solved });
          this.ui.chatLine(pz.solved ? 'Click.' : 'Reset.', 'sys');
          return;
        }
      }
    }
    this.ui.chatLine('Nothing here.', 'sys');
  }

  _handleClick(e, isRight) {
    if (!this.world) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const t = this.renderer.pickTile(px, py);
    if (t.x < 0 || t.y < 0 || t.x >= WORLD_SIZE || t.y >= WORLD_SIZE) return;

    if (isRight) {
      // Remove the placed object on this tile (if any) and return material.
      const placed = this.world.placed.find(p => p.x === t.x && p.y === t.y);
      if (placed) {
        this.world.placed = this.world.placed.filter(p => p !== placed);
        this.network.send({ t: 'remove', tile: { x: t.x, y: t.y } });
        API.addInv(placed.key, 1).then(() => this._refreshInventory());
        this.ui.chatLine(`Picked up ${placed.key}.`, 'sys');
      }
      return;
    }

    if (this.build.activeKey) {
      if ((this.inventory[this.build.activeKey] || 0) <= 0) {
        this.ui.chatLine(`No ${this.build.activeKey} in inventory.`, 'sys');
        return;
      }
      // Block if walkable check would be off-grid; allow placing on top of any tile.
      const tile = { x: t.x, y: t.y, key: this.build.activeKey };
      this.world.placed = this.world.placed.filter(p => !(p.x === t.x && p.y === t.y));
      this.world.placed.push(tile);
      this.network.send({ t: 'place', tile });
      API.consumeInv(this.build.activeKey, 1).then(() => this._refreshInventory());
      this.ui.chatLine(`Placed ${this.build.activeKey}.`, 'sys');
      return;
    }
  }

  sendChat(text) {
    if (!text) return;
    this.network.send({ t: 'chat', text });
    this.ui.chatLine(`<you> ${text}`);
  }

  async exportRift() {
    const blob = await API.exportRift(this.worldId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (this.worldMeta?.name || 'world').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
    a.href = url; a.download = `${safe}.rift`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    this.ui.chatLine('World exported as .rift', 'sys');
  }
}
