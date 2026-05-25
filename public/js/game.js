import { API, Auth } from './api.js';
import { Renderer } from './renderer.js';
import { Network } from './network.js';
import {
  createWorld, findSpawn, isWalkable, snapshotState,
  getNodeAt, getFeatureAt, getPlacedAt, addPlaced, removePlacedAt,
  getTileKind,
} from './world.js';

const HORIZ = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1 };
const VERT  = { KeyW: -1, ArrowUp:   -1, KeyS: 1, ArrowDown:  1 };

const SPEED_WALK = 4.0;   // tiles/sec
const SPEED_RUN  = 7.0;   // tiles/sec
const MOVE_SEND_MS = 80;  // network throttle for local move broadcasts

const PLACEABLES = ['planks','stone_tile','wood_door','flower_pot','lantern'];

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.renderer = new Renderer(canvas);
    this.network  = new Network();
    this.world = null;
    this.players = {};
    this.localPlayer = null;
    this.myId = null;
    this.role = 'guest';
    this.worldId = null;
    this.worldMeta = null;
    this.savedCharacter = null;
    this.lastSent = { x: 0, y: 0, dir: '', anim: '' };
    this.lastSentTs = 0;
    this.lastSavedAt = 0;
    this.lastFrameTs = 0;
    this.build = { activeKey: null, cursor: null };
    this.inventory = {};
    this.recipes = [];
    this.permissions = [];
    this.running = false;
    this.heldKeys = new Set();
    this._lastFootstepTs = 0;
    this._lastPickupTs = 0;
    this.treeHits = new Map(); // "x,y" -> int hits dealt this session
    this._installInput();
    this._installNetwork();
  }

  static TREE_HP = 3;

  _installInput() {
    addEventListener('keydown', (e) => {
      if (this.ui.isChatActive() && e.code !== 'Escape') return;
      if (e.code === 'KeyT' && !this.ui.isChatActive()) { this.ui.openChat(); e.preventDefault(); return; }
      if (e.code === 'Escape') { this.ui.closeAllPanels(); this.ui.closeChat(); return; }
      if (HORIZ[e.code] !== undefined || VERT[e.code] !== undefined) { this.heldKeys.add(e.code); e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.heldKeys.add('Shift');
      if (e.code === 'Space') { this._interactNearest(); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => {
      this.heldKeys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.heldKeys.delete('Shift');
    });
    addEventListener('blur', () => this.heldKeys.clear());

    this.canvas.addEventListener('click', (e) => this._handleClick(e, false));
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this._handleClick(e, true); });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const t = this.renderer.pickTile(px, py);
      this.build.cursor = this.build.activeKey ? t : null;
    });
  }

  _installNetwork() {
    this.network.addEventListener('msg', (e) => this._handleMessage(e.detail));
    this.network.addEventListener('close', () => this.ui.chatLine('Disconnected.', 'sys'));
  }

  _handleMessage(msg) {
    switch (msg.t) {
      case 'hello': {
        this.myId = msg.you.id;
        this.role = msg.you.role;
        for (const p of msg.players) {
          this.players[p.id] = { ...p, targetX: p.x, targetY: p.y, local: p.id === this.myId };
        }
        const me = this.players[this.myId] || { id: this.myId, username: msg.you.username, dir: 'south', anim: 'idle', local: true };
        const useSaved = this.savedCharacter && Number(this.savedCharacter.last_world) === Number(this.worldId);
        if (useSaved) {
          me.x = Number(this.savedCharacter.last_x);
          me.y = Number(this.savedCharacter.last_y);
        } else {
          const s = findSpawn(this.world, 0, 0);
          me.x = s.x; me.y = s.y;
        }
        me.targetX = me.x; me.targetY = me.y;
        this.players[this.myId] = me;
        this.localPlayer = me;
        this.ui.chatLine(msg.message, 'sys');
        break;
      }
      case 'join': {
        this.players[msg.id] = {
          id: msg.id, username: msg.username,
          x: msg.x, y: msg.y, targetX: msg.x, targetY: msg.y,
          dir: msg.dir, anim: 'idle',
        };
        this.ui.chatLine('A traveler is entering the Rift.', 'sys');
        break;
      }
      case 'leave': {
        delete this.players[msg.id];
        this.ui.chatLine(`${msg.username} left.`, 'sys');
        break;
      }
      case 'move': {
        const p = this.players[msg.id];
        if (p) { p.targetX = msg.x; p.targetY = msg.y; p.dir = msg.dir; p.anim = msg.anim; }
        break;
      }
      case 'place': {
        addPlaced(this.world, msg.tile);
        break;
      }
      case 'remove': {
        removePlacedAt(this.world, msg.tile.x, msg.tile.y);
        break;
      }
      case 'gather': {
        this.world.removed.add(`${msg.node.x},${msg.node.y}`);
        this.renderer.addParticles(msg.node.x + 0.5, msg.node.y + 0.5, this._particleColor(msg.node.key));
        break;
      }
      case 'chop': {
        // Remote chop: only show feedback. Local hit count is per-player so a
        // chopper's progress can't be desynced by other players' hits.
        this.renderer.shakeAt(msg.x, msg.y);
        this.renderer.addParticles(msg.x + 0.5, msg.y + 0.5, '#5ea142', 4);
        break;
      }
      case 'drop': {
        // Merge stack if same key on same tile, else push new.
        const d = msg.drop;
        const existing = this.world.drops.find(x => x.x === d.x && x.y === d.y && x.key === d.key);
        if (existing) existing.qty += d.qty;
        else this.world.drops.push({ ...d });
        break;
      }
      case 'pickup': {
        this.world.drops = this.world.drops.filter(d => !(d.x === msg.x && d.y === msg.y && d.key === msg.key));
        break;
      }
      case 'puzzle': {
        this.world.puzzles[msg.key] = { ...(this.world.puzzles[msg.key] || {}), solved: !!msg.state };
        break;
      }
      case 'shrine': {
        this.world.shrines[msg.key] = { ...(this.world.shrines[msg.key] || {}), active: !!msg.active };
        if (msg.active) this.ui.chatLine('A shrine awakens.', 'sys');
        break;
      }
      case 'chat': {
        this.ui.chatLine(`<${msg.from}> ${msg.text}`);
        break;
      }
      case 'emote': {
        const p = this.players[msg.id];
        if (p) { p.anim = 'interact'; setTimeout(() => { if (p) p.anim = 'idle'; }, 600); }
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
    this.world = createWorld(Number(world.seed), state || {});
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
      if (!this.lastFrameTs) this.lastFrameTs = ts;
      const dt = Math.min(0.1, (ts - this.lastFrameTs) / 1000);
      this.lastFrameTs = ts;
      this._update(ts, dt);
      this.renderer.draw(this.world, this.players, this.localPlayer, this.build, dt);
      if (this.ui.minimap && this.localPlayer) {
        this.renderer.drawMinimap(this.ui.minimap, this.world, this.localPlayer, this.players);
      }
      this._updateCoords();
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

  _update(ts, dt) {
    // Local player movement (free-direction, axis-separated collision).
    if (this.localPlayer && this.world) {
      let dx = 0, dy = 0;
      for (const k of this.heldKeys) {
        if (HORIZ[k] !== undefined) dx += HORIZ[k];
        if (VERT[k]  !== undefined) dy += VERT[k];
      }
      const running = this.heldKeys.has('Shift');
      const speed = running ? SPEED_RUN : SPEED_WALK;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const nx = this.localPlayer.x + dx * speed * dt;
        const ny = this.localPlayer.y + dy * speed * dt;
        if (this._canStand(nx, this.localPlayer.y)) this.localPlayer.x = nx;
        if (this._canStand(this.localPlayer.x, ny)) this.localPlayer.y = ny;

        this.localPlayer.anim = 'walk';
        // 4-direction sprite from dominant motion.
        if (Math.abs(dx) > Math.abs(dy)) this.localPlayer.dir = dx > 0 ? 'east' : 'west';
        else                              this.localPlayer.dir = dy > 0 ? 'south' : 'north';

        // Footstep dust on grass/dirt/sand at a cadence.
        if (ts - this._lastFootstepTs > (running ? 140 : 220)) {
          const t = getTileKind(this.world, Math.floor(this.localPlayer.x), Math.floor(this.localPlayer.y));
          if (t === 'grass' || t === 'dirt' || t === 'sand') {
            const c = t === 'grass' ? '#7fc25c' : t === 'sand' ? '#d6c290' : '#8a6a48';
            this.renderer.addParticles(this.localPlayer.x, this.localPlayer.y, c, 2);
          }
          this._lastFootstepTs = ts;
        }
      } else {
        this.localPlayer.anim = 'idle';
      }
    }

    // Smooth interpolation for remote players.
    for (const id in this.players) {
      const p = this.players[id];
      if (p === this.localPlayer) continue;
      if (p.targetX === undefined) { p.targetX = p.x; p.targetY = p.y; }
      const k = Math.min(1, dt * 12);
      p.x += (p.targetX - p.x) * k;
      p.y += (p.targetY - p.y) * k;
    }

    // Throttled network sync.
    if (this.localPlayer && ts - this.lastSentTs > MOVE_SEND_MS) {
      const p = this.localPlayer;
      const moved = Math.hypot(p.x - this.lastSent.x, p.y - this.lastSent.y) > 0.04;
      const animDirChanged = p.dir !== this.lastSent.dir || p.anim !== this.lastSent.anim;
      if (moved || animDirChanged) {
        this.network.send({ t: 'move', x: p.x, y: p.y, dir: p.dir, anim: p.anim });
        this.lastSent = { x: p.x, y: p.y, dir: p.dir, anim: p.anim };
        this.lastSentTs = ts;
      }
    }

    // Walk-over pickup of ground drops.
    this._checkPickups(ts);

    // Auto-save every 20 s.
    if (this.localPlayer && ts - this.lastSavedAt > 20000) {
      this.lastSavedAt = ts;
      this._save().catch(() => {});
    }
  }

  _canStand(x, y) {
    // Player occupies a 0.6 box - check the 4 corners for collision.
    const r = 0.3;
    return isWalkable(this.world, x - r, y - r)
        && isWalkable(this.world, x + r, y - r)
        && isWalkable(this.world, x - r, y + r)
        && isWalkable(this.world, x + r, y + r);
  }

  _updateCoords() {
    if (this.ui.coordsEl && this.localPlayer) {
      const x = Math.round(this.localPlayer.x);
      const y = Math.round(this.localPlayer.y);
      const t = getTileKind(this.world, x, y);
      this.ui.coordsEl.textContent = `(${x}, ${y})  ${t}`;
    }
  }

  async _save() {
    if (!this.worldId || !this.world) return;
    await API.saveWorld(this.worldId, snapshotState(this.world));
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

  _punchTree(x, y) {
    if (!this.localPlayer || !this.world) return;
    const k = `${x},${y}`;
    const hits = (this.treeHits.get(k) || 0) + 1;
    this.treeHits.set(k, hits);
    this.network.send({ t: 'chop', x, y });
    this.renderer.shakeAt(x, y);
    this.renderer.addParticles(x + 0.5, y + 0.5, '#5ea142', 6);
    this.localPlayer.anim = 'interact';
    this.network.send({ t: 'emote', emote: 'chop' });
    setTimeout(() => { if (this.localPlayer) this.localPlayer.anim = 'idle'; }, 240);

    if (hits >= Game.TREE_HP) {
      this.treeHits.delete(k);
      this.world.removed.add(k);
      this.network.send({ t: 'gather', node: { x, y, key: 'tree' } });
      this._dropAt(x, y, 'wood', 1);
      this.ui.chatLine('Tree felled. Wood dropped.', 'sys');
    }
  }

  _dropAt(x, y, key, qty) {
    const existing = this.world.drops.find(d => d.x === x && d.y === y && d.key === key);
    if (existing) {
      existing.qty += qty;
    } else {
      this.world.drops.push({ x, y, key, qty });
    }
    this.network.send({ t: 'drop', drop: { x, y, key, qty } });
  }

  async _pickupDrop(drop) {
    if (drop._claimed) return;
    drop._claimed = true;
    this.world.drops = this.world.drops.filter(d => d !== drop);
    this.network.send({ t: 'pickup', x: drop.x, y: drop.y, key: drop.key });
    try {
      await API.addInv(drop.key, drop.qty);
      await this._refreshInventory();
    } catch {}
    this.renderer.addParticles(drop.x + 0.5, drop.y + 0.5, '#ffd479', 6);
    this.ui.chatLine(`Picked up ${drop.qty} ${drop.key}.`, 'sys');
  }

  _checkPickups(ts) {
    if (!this.localPlayer || !this.world.drops.length) return;
    if (ts - this._lastPickupTs < 90) return;
    this._lastPickupTs = ts;
    const px = this.localPlayer.x, py = this.localPlayer.y;
    // Take a snapshot — _pickupDrop mutates the array.
    for (const drop of this.world.drops.slice()) {
      const dx = (drop.x + 0.5) - px;
      const dy = (drop.y + 0.5) - py;
      if (dx * dx + dy * dy < 0.36) { // 0.6 tile radius
        this._pickupDrop(drop);
      }
    }
  }

  _particleColor(key) {
    return ({
      tree: '#5ea142', plant: '#7fc25c', rock: '#a1a8b6',
      mineral: '#d4b25a', crystal: '#8ed8ff',
    })[key] || '#caa07a';
  }

  async _interactNearest() {
    if (!this.localPlayer || !this.world) return;
    const px = Math.floor(this.localPlayer.x);
    const py = Math.floor(this.localPlayer.y);
    // Search current tile + 8 neighbours, sort by distance.
    const candidates = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx, ty = py + dy;
        const dist = Math.hypot(tx + 0.5 - this.localPlayer.x, ty + 0.5 - this.localPlayer.y);
        candidates.push({ tx, ty, dist });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const { tx, ty } of candidates) {
      const node = getNodeAt(this.world, tx, ty);
      if (node) {
        if (node.key === 'tree') {
          this._punchTree(tx, ty);
          return;
        }
        await API.addInv(node.resource, 1);
        this.world.removed.add(`${tx},${ty}`);
        this.network.send({ t: 'gather', node });
        this.renderer.addParticles(tx + 0.5, ty + 0.5, this._particleColor(node.key));
        this.localPlayer.anim = 'interact';
        this.network.send({ t: 'emote', emote: 'gather' });
        setTimeout(() => { if (this.localPlayer) this.localPlayer.anim = 'idle'; }, 280);
        await this._refreshInventory();
        this.ui.chatLine(`Gathered ${node.resource}.`, 'sys');
        return;
      }
      const sKey = `${tx},${ty}`;
      const feat = getFeatureAt(this.world, tx, ty);
      if (feat && feat.kind === 'shrine') {
        const cur = this.world.shrines[sKey] || {};
        if (cur.active) { this.ui.chatLine('The shrine glows softly.', 'sys'); return; }
        if ((this.inventory.rune_key || 0) > 0) {
          await API.consumeInv('rune_key', 1);
          this.world.shrines[sKey] = { active: true };
          this.network.send({ t: 'shrine', key: sKey, active: true });
          if (!this.world.unlocks.includes('shrine_' + sKey)) this.world.unlocks.push('shrine_' + sKey);
          this.renderer.addParticles(tx + 0.5, ty + 0.5, '#ffd479', 20);
          await this._refreshInventory();
          this.ui.chatLine('You activate the shrine.', 'sys');
        } else {
          this.ui.chatLine('A shrine. It needs a Rune Key.', 'sys');
        }
        return;
      }
      if (feat && feat.kind === 'puzzle') {
        const cur = this.world.puzzles[sKey] || {};
        const newState = !cur.solved;
        this.world.puzzles[sKey] = { solved: newState };
        this.network.send({ t: 'puzzle', key: sKey, state: newState });
        this.ui.chatLine(newState ? 'Click.' : 'Reset.', 'sys');
        return;
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

    if (isRight) {
      const placed = getPlacedAt(this.world, t.x, t.y);
      if (placed) {
        removePlacedAt(this.world, t.x, t.y);
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
      const tile = { x: t.x, y: t.y, key: this.build.activeKey };
      addPlaced(this.world, tile);
      this.network.send({ t: 'place', tile });
      API.consumeInv(this.build.activeKey, 1).then(() => this._refreshInventory());
      this.ui.chatLine(`Placed ${this.build.activeKey}.`, 'sys');
    }
  }

  sendChat(text) {
    if (!text) return;
    this.network.send({ t: 'chat', text });
    this.ui.chatLine(`<you> ${text}`);
  }

  async exportRift() {
    await this._save().catch(() => {});
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
