import { TILE_W, TILE_H, TILE_THICK, buildAssets } from './art.js';
import { getTileKind, getNodeAt, getFeatureAt, getPlacedAt } from './world.js';

export function gridToScreen(gx, gy) {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}
export function screenToGrid(sx, sy) {
  return {
    x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
    y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
  };
}

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;
const DEFAULT_ZOOM = 1.5;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.assets = buildAssets();
    this.camera = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
    this.dpr = 1;
    this.particles = [];
    this._resize();
    window.addEventListener('resize', () => this._resize());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.pow(1.0015, -e.deltaY);
      this.camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camera.zoom * factor));
    }, { passive: false });
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.imageSmoothingEnabled = false;
    this.dpr = dpr;
  }

  worldToScreen(gx, gy) {
    const s = gridToScreen(gx, gy);
    const z = this.camera.zoom;
    const cx = this.canvas.width / 2 / this.dpr;
    const cy = this.canvas.height / 2 / this.dpr;
    return { x: (s.x - this.camera.x) * z + cx, y: (s.y - this.camera.y) * z + cy };
  }
  screenToWorld(px, py) {
    const z = this.camera.zoom;
    const cx = this.canvas.width / 2 / this.dpr;
    const cy = this.canvas.height / 2 / this.dpr;
    return screenToGrid((px - cx) / z + this.camera.x, (py - cy) / z + this.camera.y);
  }
  pickTile(px, py) {
    const g = this.screenToWorld(px, py);
    return { x: Math.floor(g.x), y: Math.floor(g.y) };
  }

  addParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.04,
        vy: -0.02 - Math.random() * 0.04,
        life: 600 + Math.random() * 400,
        born: performance.now(),
        color,
      });
    }
  }

  _stepParticles(dt) {
    const now = performance.now();
    this.particles = this.particles.filter(p => now - p.born < p.life);
    for (const p of this.particles) {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.0012 * dt * 60;
    }
  }

  draw(world, players, localPlayer, build, dt) {
    const ctx = this.ctx;
    const z = this.camera.zoom;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;

    // Smooth camera follow.
    if (localPlayer) {
      const target = gridToScreen(localPlayer.x, localPlayer.y);
      const lerp = Math.min(1, dt * 8);
      this.camera.x += (target.x - this.camera.x) * lerp;
      this.camera.y += (target.y - this.camera.y) * lerp;
    }

    // Sky / background.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#101626');
    g.addColorStop(1, '#070a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Compute visible tile range from screen corners.
    const corners = [
      this.screenToWorld(0, 0),
      this.screenToWorld(W, 0),
      this.screenToWorld(0, H),
      this.screenToWorld(W, H),
    ];
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    const margin = 2;
    const minX = Math.floor(Math.min(...xs)) - margin;
    const maxX = Math.ceil (Math.max(...xs)) + margin;
    const minY = Math.floor(Math.min(...ys)) - margin;
    const maxY = Math.ceil (Math.max(...ys)) + margin;

    // Build depth-sorted draw list.
    const items = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        items.push({ depth: x + y - 0.1, type: 'tile', x, y });
        // Placed has priority over generated node at same tile.
        const placed = getPlacedAt(world, x, y);
        if (placed) {
          items.push({ depth: x + y + 0.5, type: 'placed', placed });
          continue;
        }
        const node = getNodeAt(world, x, y);
        if (node) items.push({ depth: x + y + 0.5, type: 'node', node });
        const feat = getFeatureAt(world, x, y);
        if (feat) {
          if (feat.kind === 'shrine') {
            const active = !!(world.shrines[`${x},${y}`] && world.shrines[`${x},${y}`].active);
            items.push({ depth: x + y + 0.6, type: 'shrine', x, y, active });
          } else if (feat.kind === 'puzzle') {
            items.push({ depth: x + y + 0.4, type: 'puzzle', x, y, sub: feat.subkind });
          }
        }
      }
    }
    for (const id in players) {
      const p = players[id];
      if (p.x >= minX - 2 && p.x <= maxX + 2 && p.y >= minY - 2 && p.y <= maxY + 2) {
        items.push({ depth: p.x + p.y + 0.7, type: 'player', player: p });
      }
    }
    items.sort((a, b) => a.depth - b.depth);

    for (const it of items) {
      if (it.type === 'tile')   this._drawTile(world, it.x, it.y, z);
      else if (it.type === 'node')   this._drawObject(it.node.x,    it.node.y,    it.node.key, z);
      else if (it.type === 'placed') this._drawObject(it.placed.x,  it.placed.y,  it.placed.key, z);
      else if (it.type === 'shrine') this._drawObject(it.x, it.y, 'shrine', z, it.active);
      else if (it.type === 'puzzle') this._drawObject(it.x, it.y, it.sub, z);
      else if (it.type === 'player') this._drawPlayer(it.player, z);
    }

    // Build cursor (tile highlight).
    if (build && build.cursor) {
      const c = build.cursor;
      const s = this.worldToScreen(c.x + 0.5, c.y + 0.5);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffd479';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - (TILE_H / 2) * z);
      ctx.lineTo(s.x + (TILE_W / 2) * z, s.y);
      ctx.lineTo(s.x, s.y + (TILE_H / 2) * z);
      ctx.lineTo(s.x - (TILE_W / 2) * z, s.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Particles.
    this._stepParticles(dt);
    for (const p of this.particles) {
      const age = (performance.now() - p.born) / p.life;
      const s = this.worldToScreen(p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - age;
      const sz = Math.max(1, Math.round(2 * z));
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  _drawTile(world, gx, gy, z) {
    const kind = getTileKind(world, gx, gy);
    const tile = this.assets.tiles[kind] || this.assets.tiles.grass;
    const s = this.worldToScreen(gx + 0.5, gy + 0.5);
    const dw = TILE_W * z, dh = (TILE_H + TILE_THICK) * z;
    this.ctx.drawImage(tile, Math.round(s.x - dw / 2), Math.round(s.y - (TILE_H / 2) * z), dw, dh);
  }

  _drawObject(gx, gy, key, z, lit) {
    const img = this.assets.objects[key];
    if (!img) return;
    const ctx = this.ctx;
    const s = this.worldToScreen(gx + 0.5, gy + 0.5);
    const dw = img.width * z, dh = img.height * z;
    if (lit) {
      ctx.save();
      const pulse = 0.25 + Math.sin(performance.now() / 400) * 0.08;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd479';
      ctx.beginPath();
      ctx.arc(s.x, s.y - 6 * z, 26 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(img,
      Math.round(s.x - dw / 2),
      Math.round(s.y - dh + (TILE_H / 2) * z),
      dw, dh
    );
  }

  _drawPlayer(p, z) {
    const ctx = this.ctx;
    const av = this.assets.avatar;
    const dirIdx = ['south', 'west', 'north', 'east'].indexOf(p.dir || 'south');
    const row = dirIdx < 0 ? 0 : dirIdx;
    let col = 0;
    if (p.anim === 'walk') col = Math.floor(performance.now() / 110) % 4;
    else if (p.anim === 'interact') col = 2;
    const s = this.worldToScreen(p.x, p.y);
    const fw = av.frameW, fh = av.frameH;
    const dw = fw * z, dh = fh * z;
    ctx.drawImage(av.canvas, col * fw, row * fh, fw, fh,
      Math.round(s.x - dw / 2),
      Math.round(s.y - dh + (TILE_H / 2) * z + 4 * z),
      dw, dh);

    if (p.username) {
      ctx.font = `${Math.max(10, 10 * z)}px PixelMono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(p.username, s.x + 1, s.y - dh + 4 * z + 1);
      ctx.fillStyle = p.local ? '#ffd479' : '#e6ecff';
      ctx.fillText(p.username, s.x, s.y - dh + 4 * z);
    }
  }

  // Renders a small top-down minimap centered on the player.
  drawMinimap(target, world, localPlayer, players) {
    const ctx = target.getContext('2d');
    const W = target.width, H = target.height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    if (!localPlayer) return;
    const radius = 24; // tiles
    const px = Math.floor(localPlayer.x), py = Math.floor(localPlayer.y);
    const cell = Math.floor(Math.min(W, H) / (radius * 2 + 1));
    const ox = Math.floor((W - cell * (radius * 2 + 1)) / 2);
    const oy = Math.floor((H - cell * (radius * 2 + 1)) / 2);

    const COLORS = {
      water: '#1e4783', sand: '#b6a274', grass: '#3e7b2f', dirt: '#5b3f23',
      stone: '#5e6573', cave: '#1c1924', ruin: '#5c5240',
    };
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = px + dx, y = py + dy;
        const t = getTileKind(world, x, y);
        ctx.fillStyle = COLORS[t] || '#222';
        ctx.fillRect(ox + (dx + radius) * cell, oy + (dy + radius) * cell, cell, cell);
        const placed = getPlacedAt(world, x, y);
        if (placed) {
          ctx.fillStyle = '#caa07a';
          ctx.fillRect(ox + (dx + radius) * cell, oy + (dy + radius) * cell, cell, cell);
        } else {
          const f = getFeatureAt(world, x, y);
          if (f && f.kind === 'shrine') {
            ctx.fillStyle = '#ffd479';
            ctx.fillRect(ox + (dx + radius) * cell, oy + (dy + radius) * cell, cell, cell);
          }
        }
      }
    }
    // Player markers
    for (const id in players) {
      const p = players[id];
      const dx = Math.round(p.x) - px;
      const dy = Math.round(p.y) - py;
      if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
      ctx.fillStyle = p.local ? '#ffd479' : '#6ea8ff';
      ctx.fillRect(ox + (dx + radius) * cell - 1, oy + (dy + radius) * cell - 1, cell + 2, cell + 2);
    }
    // Frame
    ctx.strokeStyle = '#3a4366';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }
}
