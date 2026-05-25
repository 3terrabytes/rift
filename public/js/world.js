// Infinite, deterministic world. Terrain, gather nodes, and special features
// are computed from (seed, x, y) on demand. Only overlays (placed objects,
// gathered nodes, activated shrines, solved puzzles) are persisted.

function hash32(seed, x, y, salt = 0) {
  let h = (seed >>> 0) ^ (salt | 0);
  h = Math.imul(h ^ (x | 0), 0x85EBCA6B);
  h ^= h >>> 13;
  h = Math.imul(h ^ (y | 0), 0xC2B2AE35);
  h ^= h >>> 16;
  return h >>> 0;
}

function unit(seed, x, y, salt) {
  return hash32(seed, x, y, salt) / 4294967295;
}

// Bilinear-interpolated value noise.
function valueNoise(seed, x, y, salt) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const sx = x - x0, sy = y - y0;
  const n00 = unit(seed, x0,     y0,     salt);
  const n10 = unit(seed, x0 + 1, y0,     salt);
  const n01 = unit(seed, x0,     y0 + 1, salt);
  const n11 = unit(seed, x0 + 1, y0 + 1, salt);
  // Smoothstep
  const tx = sx * sx * (3 - 2 * sx);
  const ty = sy * sy * (3 - 2 * sy);
  return (n00 * (1 - tx) + n10 * tx) * (1 - ty)
       + (n01 * (1 - tx) + n11 * tx) * ty;
}

function fractalNoise(seed, x, y, salt) {
  const scale = 1 / 12;
  let v = 0, amp = 1, total = 0;
  for (let o = 0; o < 4; o++) {
    const s = scale * (1 << o);
    v += valueNoise(seed, x * s, y * s, salt + o * 1009) * amp;
    total += amp;
    amp *= 0.55;
  }
  return v / total;
}

// Create a world handle. Holds the seed and any persisted overlays.
export function createWorld(seed, overlays = {}) {
  return {
    seed: seed >>> 0,
    // Overlays loaded from world_state:
    placed:        Array.isArray(overlays.placed)  ? overlays.placed  : [],
    shrines:       (overlays.shrines  && typeof overlays.shrines  === 'object') ? overlays.shrines  : {},
    puzzles:       (overlays.puzzles  && typeof overlays.puzzles  === 'object') ? overlays.puzzles  : {},
    unlocks:       Array.isArray(overlays.unlocks) ? overlays.unlocks : [],
    // Gathered node positions (Set of "x,y"). Stored as array in world_state.removed_nodes.
    removed:       new Set(Array.isArray(overlays.removed_nodes) ? overlays.removed_nodes : []),
  };
}

// Lookup overlay for placed/removed at a tile (fast index for hot paths).
function rebuildPlacedIndex(world) {
  world._placedIdx = new Map();
  for (const p of world.placed) world._placedIdx.set(`${p.x},${p.y}`, p);
}
export function getPlacedAt(world, x, y) {
  if (!world._placedIdx) rebuildPlacedIndex(world);
  return world._placedIdx.get(`${x},${y}`) || null;
}
export function addPlaced(world, tile) {
  removePlacedAt(world, tile.x, tile.y);
  world.placed.push(tile);
  if (!world._placedIdx) rebuildPlacedIndex(world);
  else world._placedIdx.set(`${tile.x},${tile.y}`, tile);
}
export function removePlacedAt(world, x, y) {
  world.placed = world.placed.filter(p => !(p.x === x && p.y === y));
  if (world._placedIdx) world._placedIdx.delete(`${x},${y}`);
}

// --- terrain ---

const BIOMES = ['water', 'sand', 'grass', 'dirt', 'stone', 'cave', 'ruin'];

export function getTileKind(world, x, y) {
  const e = fractalNoise(world.seed, x, y, 1);
  const m = fractalNoise(world.seed, x, y, 7777);
  const c = fractalNoise(world.seed, x, y, 9999); // cave/ruin overlay

  // Cave patches in low-cave-noise zones with non-water elevation.
  if (e > 0.38 && c < 0.28) return 'cave';
  if (e > 0.38 && c > 0.72) return 'ruin';

  if (e < 0.30) return 'water';
  if (e < 0.36) return 'sand';
  if (e > 0.74) return 'stone';
  if (e > 0.66) return m > 0.5 ? 'stone' : 'dirt';
  return m > 0.4 ? 'grass' : 'dirt';
}

// --- gather nodes (deterministic + overlay for removed) ---

export function getNodeAt(world, x, y) {
  if (world.removed.has(`${x},${y}`)) return null;
  if (getPlacedAt(world, x, y)) return null; // built object takes priority
  const t = getTileKind(world, x, y);
  const h = unit(world.seed, x, y, 31337);
  if (t === 'grass' && h < 0.05) return { x, y, key: 'tree',     resource: 'wood' };
  if (t === 'grass' && h < 0.10) return { x, y, key: 'plant',    resource: 'plant' };
  if (t === 'dirt'  && h < 0.04) return { x, y, key: 'plant',    resource: 'plant' };
  if (t === 'stone' && h < 0.14) return { x, y, key: 'rock',     resource: 'stone' };
  if (t === 'stone' && h < 0.18) return { x, y, key: 'mineral',  resource: 'mineral' };
  if (t === 'cave'  && h < 0.18) return { x, y, key: 'crystal',  resource: 'crystal' };
  if (t === 'ruin'  && h < 0.08) return { x, y, key: 'mineral',  resource: 'mineral' };
  return null;
}

// --- special features (shrines + puzzles), sparse, deterministic ---

export function getFeatureAt(world, x, y) {
  const t = getTileKind(world, x, y);
  if (t === 'water') return null;
  if (getPlacedAt(world, x, y)) return null;
  const h = unit(world.seed, x, y, 8675309);
  // Shrines: ~1 per 1500 tiles, prefer ruins + grass.
  if (h < 0.00065 && (t === 'ruin' || t === 'grass')) {
    return { kind: 'shrine', x, y };
  }
  // Puzzles: ~1 per 1000 tiles, mostly in caves.
  if (h > 0.997 && (t === 'cave' || t === 'ruin')) {
    const sub = unit(world.seed, x, y, 100001) < 0.5 ? 'switch' : 'pressure_plate';
    return { kind: 'puzzle', subkind: sub, x, y };
  }
  return null;
}

export function isWalkable(world, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (getTileKind(world, ix, iy) === 'water') return false;
  const p = getPlacedAt(world, ix, iy);
  if (p && (p.key === 'wood_door' || p.key === 'tree' || p.key === 'rock')) return false;
  const n = getNodeAt(world, ix, iy);
  if (n && (n.key === 'tree' || n.key === 'rock')) return false;
  return true;
}

// Find a safe spawn near (cx, cy). Walks outward until a walkable tile is found.
export function findSpawn(world, cx = 0, cy = 0) {
  for (let r = 0; r < 200; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx, y = cy + dy;
        const t = getTileKind(world, x, y);
        if (t === 'grass' || t === 'dirt' || t === 'sand') {
          if (!getNodeAt(world, x, y)) return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
  }
  return { x: cx + 0.5, y: cy + 0.5 };
}

// Snapshot the small mutable parts of the world for save/export.
export function snapshotState(world) {
  return {
    placed:        world.placed,
    shrines:       world.shrines,
    puzzles:       world.puzzles,
    unlocks:       world.unlocks,
    removed_nodes: [...world.removed],
  };
}
