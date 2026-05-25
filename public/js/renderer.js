import { TILE_W, TILE_H, TILE_THICK, buildAssets } from './art.js';

// Isometric coordinate conversion (orthogonal grid -> screen).
export function gridToScreen(gx, gy) {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

export function screenToGrid(sx, sy) {
  // Inverse transform.
  const gx = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const gy = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return { x: gx, y: gy };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.assets = buildAssets();
    this.camera = { x: 0, y: 0, zoom: 2 };
    this._resize();
    window.addEventListener('resize', () => this._resize());
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
    return {
      x: (s.x - this.camera.x) * z + cx,
      y: (s.y - this.camera.y) * z + cy,
    };
  }

  screenToWorld(px, py) {
    const z = this.camera.zoom;
    const cx = this.canvas.width / 2 / this.dpr;
    const cy = this.canvas.height / 2 / this.dpr;
    const sx = (px - cx) / z + this.camera.x;
    const sy = (py - cy) / z + this.camera.y;
    return screenToGrid(sx, sy);
  }

  pickTile(px, py) {
    const g = this.screenToWorld(px, py);
    return { x: Math.floor(g.x + 0.5), y: Math.floor(g.y + 0.5) };
  }

  draw(world, players, localPlayer, build) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);

    // Sky / background gradient
    const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height / this.dpr);
    g.addColorStop(0, '#101626');
    g.addColorStop(1, '#070a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);

    const z = this.camera.zoom;

    // Center camera on local player smoothly.
    if (localPlayer) {
      const target = gridToScreen(localPlayer.x, localPlayer.y);
      this.camera.x += (target.x - this.camera.x) * 0.18;
      this.camera.y += (target.y - this.camera.y) * 0.18;
    }

    // Build draw list of (gx, gy, type, payload) for depth sorting.
    const items = [];
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        items.push({ depth: x + y, type: 'tile', x, y });
      }
    }
    for (const n of world.nodes)   items.push({ depth: n.x + n.y + 0.5, type: 'node', node: n });
    for (const p of world.placed)  items.push({ depth: p.x + p.y + 0.5, type: 'placed', placed: p });
    for (const key in world.shrines) {
      const [x, y] = key.split(',').map(Number);
      items.push({ depth: x + y + 0.5, type: 'shrine', x, y, data: world.shrines[key] });
    }
    for (const key in world.puzzles) {
      const [x, y] = key.split(',').map(Number);
      items.push({ depth: x + y + 0.4, type: 'puzzle', x, y, data: world.puzzles[key] });
    }
    for (const id in players) {
      const p = players[id];
      items.push({ depth: p.x + p.y + 0.6, type: 'player', player: p });
    }

    items.sort((a, b) => a.depth - b.depth);

    for (const it of items) {
      if (it.type === 'tile') this._drawTile(world, it.x, it.y, z);
      else if (it.type === 'node')   this._drawObject(it.node.x, it.node.y, it.node.key, z);
      else if (it.type === 'placed') this._drawObject(it.placed.x, it.placed.y, it.placed.key, z);
      else if (it.type === 'shrine') this._drawObject(it.x, it.y, 'shrine', z, it.data.active);
      else if (it.type === 'puzzle') this._drawObject(it.x, it.y, it.data.kind, z);
      else if (it.type === 'player') this._drawPlayer(it.player, z);
    }

    // Build cursor highlight
    if (build && build.cursor) {
      const c = build.cursor;
      const s = this.worldToScreen(c.x, c.y);
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

    ctx.restore();
  }

  _drawTile(world, gx, gy, z) {
    const ctx = this.ctx;
    const kind = world.terrain[`${gx},${gy}`] || 'grass';
    const tile = this.assets.tiles[kind];
    if (!tile) return;
    const s = this.worldToScreen(gx, gy);
    const dw = TILE_W * z, dh = (TILE_H + TILE_THICK) * z;
    ctx.drawImage(tile, Math.round(s.x - dw / 2), Math.round(s.y - (TILE_H / 2) * z), dw, dh);
  }

  _drawObject(gx, gy, key, z, lit) {
    const ctx = this.ctx;
    const img = this.assets.objects[key];
    if (!img) return;
    const s = this.worldToScreen(gx, gy);
    const dw = img.width * z, dh = img.height * z;
    // Glow if shrine active
    if (lit) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffd479';
      ctx.beginPath();
      ctx.arc(s.x, s.y - 6 * z, 24 * z, 0, Math.PI * 2);
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
    const dirIdx = ['south','west','north','east'].indexOf(p.dir || 'south');
    const row = dirIdx < 0 ? 0 : dirIdx;
    let col = 0;
    if (p.anim === 'walk') {
      col = Math.floor(performance.now() / 120) % 4;
    } else if (p.anim === 'interact') {
      col = 2;
    }
    const s = this.worldToScreen(p.x, p.y);
    const fw = av.frameW, fh = av.frameH;
    const dw = fw * z, dh = fh * z;
    ctx.drawImage(av.canvas, col * fw, row * fh, fw, fh,
      Math.round(s.x - dw / 2),
      Math.round(s.y - dh + (TILE_H / 2) * z + 4 * z),
      dw, dh);

    // Username
    if (p.username) {
      ctx.font = `${10 * z}px PixelMono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(p.username, s.x + 1, s.y - dh + 4 * z + 1);
      ctx.fillStyle = p.local ? '#ffd479' : '#e6ecff';
      ctx.fillText(p.username, s.x, s.y - dh + 4 * z);
    }
  }
}
