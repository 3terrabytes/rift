// Deterministic procedural world generation from a seed.
// World is a 32x32 tile grid of biomes with scattered objects, puzzles, shrines.

export const WORLD_SIZE = 32;

// Mulberry32 PRNG
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise2(rnd, size) {
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  // smooth
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            sum += grid[ny * size + nx]; n++;
          }
        }
      }
      out[y * size + x] = sum / n;
    }
  }
  return out;
}

export function generateWorld(seed) {
  const rnd = rng(seed || 1);
  const size = WORLD_SIZE;
  const elev = valueNoise2(rnd, size);
  const moist = valueNoise2(rnd, size);

  const terrain = {}; // key "x,y" -> tile kind
  const nodes = [];   // gatherable nodes
  const puzzles = {};
  const shrines = {};

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const e = elev[i], m = moist[i];
      let kind;
      if (e < 0.32) kind = 'water';
      else if (e < 0.38) kind = 'sand';
      else if (e > 0.78) kind = 'stone';
      else if (e > 0.7)  kind = m > 0.5 ? 'stone' : 'dirt';
      else kind = m > 0.4 ? 'grass' : 'dirt';
      terrain[`${x},${y}`] = kind;
    }
  }

  // Cave / ruin patches
  for (let i = 0; i < 8; i++) {
    const cx = Math.floor(rnd() * size);
    const cy = Math.floor(rnd() * size);
    const kind = rnd() < 0.5 ? 'cave' : 'ruin';
    const r = 2 + Math.floor(rnd() * 3);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r && rnd() < 0.7) terrain[`${x},${y}`] = kind;
      }
    }
  }

  // Scatter gather nodes
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = terrain[`${x},${y}`];
      const r = rnd();
      if (t === 'grass' && r < 0.06) nodes.push({ x, y, key: 'tree', resource: 'wood' });
      else if (t === 'grass' && r < 0.12) nodes.push({ x, y, key: 'plant', resource: 'plant' });
      else if (t === 'stone' && r < 0.18) nodes.push({ x, y, key: 'rock', resource: 'stone' });
      else if (t === 'stone' && r < 0.23) nodes.push({ x, y, key: 'mineral', resource: 'mineral' });
      else if (t === 'cave' && r < 0.18) nodes.push({ x, y, key: 'crystal', resource: 'crystal' });
      else if (t === 'ruin' && r < 0.08) nodes.push({ x, y, key: 'mineral', resource: 'mineral' });
    }
  }

  // Shrines (3)
  for (let i = 0; i < 3; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const x = Math.floor(rnd() * size);
      const y = Math.floor(rnd() * size);
      const t = terrain[`${x},${y}`];
      if (t === 'ruin' || t === 'grass') {
        shrines[`${x},${y}`] = { active: false, needs: 'rune_key' };
        placed = true;
      }
    }
  }

  // Puzzles: a pressure plate + a switch in caves
  for (let i = 0; i < 2; i++) {
    let placed = 0;
    for (let attempt = 0; attempt < 60 && placed < 2; attempt++) {
      const x = Math.floor(rnd() * size);
      const y = Math.floor(rnd() * size);
      if (terrain[`${x},${y}`] === 'cave') {
        puzzles[`${x},${y}`] = { kind: placed === 0 ? 'pressure_plate' : 'switch', solved: false };
        placed++;
      }
    }
  }

  return { size, terrain, nodes, puzzles, shrines, placed: [], unlocks: [], seed };
}

// Find a safe spawn (grass tile near center).
export function findSpawn(world) {
  const s = world.size;
  const cx = Math.floor(s / 2), cy = Math.floor(s / 2);
  for (let r = 0; r < s; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= s || y < 0 || y >= s) continue;
        const t = world.terrain[`${x},${y}`];
        if (t === 'grass' || t === 'dirt' || t === 'sand') return { x, y };
      }
    }
  }
  return { x: cx, y: cy };
}

export function isWalkable(world, x, y) {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false;
  const t = world.terrain[`${x},${y}`];
  if (t === 'water') return false;
  // Solid objects (trees, rocks, doors) block movement.
  for (const p of world.placed) {
    if (p.x === x && p.y === y && (p.key === 'wood_door' || p.key === 'tree' || p.key === 'rock')) return false;
  }
  return true;
}
