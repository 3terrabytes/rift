// Procedural pixel-art generator. All sprites/tiles are drawn into offscreen
// canvases on load. This avoids shipping binary art assets and keeps the
// game self-contained.

const PALETTE = {
  grass1: '#4f9c3b',
  grass2: '#3e7b2f',
  grass3: '#62b94a',
  dirt1:  '#6b4a2b',
  dirt2:  '#4d3520',
  stone1: '#7b8290',
  stone2: '#5e6573',
  stone3: '#a1a8b6',
  water1: '#2b5fa6',
  water2: '#1e4783',
  water3: '#4080c4',
  sand1:  '#d6c290',
  sand2:  '#b6a274',
  ruin1:  '#8a7e6a',
  ruin2:  '#5c5240',
  cave1:  '#2d2937',
  cave2:  '#1c1924',
  wood1:  '#6e4321',
  wood2:  '#4c2d16',
  leaf1:  '#3f7a2c',
  leaf2:  '#5ea142',
  crystal1: '#8ed8ff',
  crystal2: '#3ea7e0',
  crystal3: '#caf0ff',
  flower1: '#ff7aa8',
  flower2: '#ffd47a',
  shrine1: '#c4a04a',
  shrine2: '#6b5520',
  plate1: '#b3b8c5',
  plate2: '#7d8497',
  shadow: 'rgba(0,0,0,0.35)',
  outline: '#0d111a',
  skin: '#caa07a',
  skinDark: '#9b7553',
  eye:  '#3a82ff',
  hair: '#3a2916',
  shirt: '#3a64a0',
  shirtDark: '#284874',
  pants: '#4a3a2a',
};

export const TILE_W = 64;
export const TILE_H = 32;
export const TILE_THICK = 16;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

// Draw an isometric diamond top with three-tone shading.
function drawDiamondTop(ctx, x, y, w, h, fill, edge) {
  ctx.fillStyle = fill;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);            // top
  ctx.lineTo(x + w, cy);        // right
  ctx.lineTo(cx, y + h);        // bottom
  ctx.lineTo(x, cy);            // left
  ctx.closePath();
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawTileBlock(ctx, x, y, w, h, thick, top, side1, side2) {
  // Sides (front-left and front-right).
  ctx.fillStyle = side1;
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x + w / 2, y + h + thick);
  ctx.lineTo(x, y + h / 2 + thick);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = side2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w, y + h / 2 + thick);
  ctx.lineTo(x + w / 2, y + h + thick);
  ctx.closePath();
  ctx.fill();

  drawDiamondTop(ctx, x, y, w, h, top);
}

function noiseDots(ctx, x, y, w, h, color, count) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = x + 4 + Math.floor(Math.random() * (w - 8));
    const py = y + 4 + Math.floor(Math.random() * (h - 8));
    // keep inside diamond
    const dx = Math.abs((px - (x + w / 2)) / (w / 2));
    const dy = Math.abs((py - (y + h / 2)) / (h / 2));
    if (dx + dy > 0.9) continue;
    ctx.fillRect(px, py, 2, 2);
  }
}

export function makeTile(kind) {
  const c = makeCanvas(TILE_W, TILE_H + TILE_THICK);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  switch (kind) {
    case 'grass':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.grass1, PALETTE.dirt1, PALETTE.dirt2);
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, PALETTE.grass3, 18);
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, PALETTE.grass2, 10);
      break;
    case 'dirt':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.dirt1, PALETTE.dirt2, '#3a281a');
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, PALETTE.dirt2, 14);
      break;
    case 'stone':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.stone1, PALETTE.stone2, '#4a525e');
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, PALETTE.stone3, 12);
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, PALETTE.stone2, 10);
      break;
    case 'sand':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.sand1, PALETTE.sand2, '#8b7a52');
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, '#e9d8a0', 12);
      break;
    case 'water':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.water1, PALETTE.water2, '#14315c');
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, PALETTE.water3, 18);
      break;
    case 'ruin':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.ruin1, PALETTE.ruin2, '#3c3424');
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, '#a89a82', 10);
      // engraved lines
      ctx.fillStyle = PALETTE.ruin2;
      ctx.fillRect(20, 14, 24, 2);
      ctx.fillRect(28, 8,  8, 2);
      break;
    case 'cave':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.cave1, PALETTE.cave2, '#0e0c14');
      noiseDots(ctx, 0, 0, TILE_W, TILE_H, '#3d3848', 14);
      break;
    case 'planks':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.wood1, PALETTE.wood2, '#2e1a08');
      // plank lines
      ctx.fillStyle = PALETTE.wood2;
      ctx.fillRect(8, 10, 48, 2);
      ctx.fillRect(8, 20, 48, 2);
      break;
    case 'stone_tile':
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.stone3, PALETTE.stone1, PALETTE.stone2);
      ctx.fillStyle = PALETTE.stone2;
      ctx.fillRect(16, 12, 32, 2);
      ctx.fillRect(30, 4,  2, 24);
      break;
    default:
      drawTileBlock(ctx, 0, 0, TILE_W, TILE_H, TILE_THICK,
        PALETTE.grass1, PALETTE.dirt1, PALETTE.dirt2);
  }
  return c;
}

// World objects sit on top of tiles.
export function makeObject(kind) {
  const c = makeCanvas(48, 64);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ground shadow
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(24, 60, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (kind) {
    case 'tree': {
      // trunk
      ctx.fillStyle = PALETTE.wood1;
      ctx.fillRect(20, 40, 8, 20);
      ctx.fillStyle = PALETTE.wood2;
      ctx.fillRect(20, 40, 2, 20);
      // leaves
      ctx.fillStyle = PALETTE.leaf2;
      ctx.fillRect(10, 14, 28, 22);
      ctx.fillStyle = PALETTE.leaf1;
      ctx.fillRect(12, 30, 24, 6);
      ctx.fillRect(8,  20, 4, 10);
      ctx.fillRect(36, 20, 4, 10);
      ctx.fillStyle = '#7fc25c';
      ctx.fillRect(14, 16, 4, 4);
      ctx.fillRect(24, 12, 4, 4);
      break;
    }
    case 'rock': {
      ctx.fillStyle = PALETTE.stone2;
      ctx.fillRect(10, 40, 28, 14);
      ctx.fillStyle = PALETTE.stone1;
      ctx.fillRect(12, 36, 24, 14);
      ctx.fillStyle = PALETTE.stone3;
      ctx.fillRect(16, 34, 12, 6);
      ctx.fillStyle = PALETTE.stone2;
      ctx.fillRect(20, 44, 4, 2);
      break;
    }
    case 'crystal': {
      ctx.fillStyle = PALETTE.crystal2;
      ctx.fillRect(18, 50, 12, 10);
      ctx.fillStyle = PALETTE.crystal1;
      ctx.beginPath();
      ctx.moveTo(24, 22);
      ctx.lineTo(34, 50);
      ctx.lineTo(14, 50);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.crystal3;
      ctx.beginPath();
      ctx.moveTo(24, 22);
      ctx.lineTo(20, 50);
      ctx.lineTo(18, 50);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'plant': {
      ctx.fillStyle = PALETTE.leaf1;
      ctx.fillRect(16, 46, 16, 12);
      ctx.fillStyle = PALETTE.leaf2;
      ctx.fillRect(18, 40, 12, 10);
      ctx.fillStyle = PALETTE.flower1;
      ctx.fillRect(22, 36, 4, 4);
      ctx.fillStyle = PALETTE.flower2;
      ctx.fillRect(18, 38, 2, 2);
      ctx.fillRect(28, 38, 2, 2);
      break;
    }
    case 'mineral': {
      ctx.fillStyle = PALETTE.stone2;
      ctx.fillRect(10, 44, 28, 14);
      ctx.fillStyle = PALETTE.stone1;
      ctx.fillRect(12, 40, 24, 12);
      ctx.fillStyle = '#d4b25a';
      ctx.fillRect(16, 44, 6, 4);
      ctx.fillRect(24, 48, 4, 4);
      ctx.fillStyle = '#fff2b2';
      ctx.fillRect(17, 45, 2, 2);
      break;
    }
    case 'shrine': {
      // base
      ctx.fillStyle = PALETTE.shrine2;
      ctx.fillRect(8, 50, 32, 10);
      ctx.fillStyle = PALETTE.shrine1;
      ctx.fillRect(10, 46, 28, 8);
      // pillar
      ctx.fillStyle = PALETTE.ruin1;
      ctx.fillRect(18, 18, 12, 32);
      ctx.fillStyle = PALETTE.ruin2;
      ctx.fillRect(18, 18, 2, 32);
      // top
      ctx.fillStyle = PALETTE.shrine1;
      ctx.fillRect(14, 14, 20, 6);
      // glyph
      ctx.fillStyle = PALETTE.crystal1;
      ctx.fillRect(22, 28, 4, 4);
      ctx.fillRect(20, 32, 8, 2);
      break;
    }
    case 'lantern': {
      ctx.fillStyle = PALETTE.wood2;
      ctx.fillRect(22, 36, 4, 24);
      ctx.fillStyle = PALETTE.shrine1;
      ctx.fillRect(16, 28, 16, 12);
      ctx.fillStyle = '#fff0a0';
      ctx.fillRect(20, 32, 8, 6);
      ctx.fillStyle = PALETTE.shrine2;
      ctx.fillRect(16, 26, 16, 2);
      break;
    }
    case 'wood_door': {
      ctx.fillStyle = PALETTE.wood2;
      ctx.fillRect(14, 16, 20, 44);
      ctx.fillStyle = PALETTE.wood1;
      ctx.fillRect(16, 18, 16, 40);
      ctx.fillStyle = '#3a2810';
      ctx.fillRect(28, 36, 4, 4);
      break;
    }
    case 'flower_pot': {
      ctx.fillStyle = PALETTE.ruin2;
      ctx.fillRect(16, 46, 16, 14);
      ctx.fillStyle = PALETTE.ruin1;
      ctx.fillRect(18, 48, 12, 10);
      ctx.fillStyle = PALETTE.leaf2;
      ctx.fillRect(18, 40, 12, 8);
      ctx.fillStyle = PALETTE.flower1;
      ctx.fillRect(22, 36, 4, 4);
      break;
    }
    case 'pressure_plate': {
      ctx.fillStyle = PALETTE.plate2;
      ctx.fillRect(8, 52, 32, 6);
      ctx.fillStyle = PALETTE.plate1;
      ctx.fillRect(10, 50, 28, 6);
      break;
    }
    case 'switch': {
      ctx.fillStyle = PALETTE.stone2;
      ctx.fillRect(18, 44, 12, 16);
      ctx.fillStyle = PALETTE.stone1;
      ctx.fillRect(20, 40, 8, 8);
      ctx.fillStyle = '#ffd479';
      ctx.fillRect(22, 42, 4, 4);
      break;
    }
    default: {
      ctx.fillStyle = PALETTE.stone1;
      ctx.fillRect(16, 40, 16, 16);
    }
  }
  return c;
}

// Build a 4-direction sprite sheet: rows = south, west, north, east; cols = idle, walk1, walk2, walk3.
// Returns the sheet + frame metadata.
export function makeAvatar() {
  const FRAME_W = 32, FRAME_H = 40;
  const COLS = 4, ROWS = 4;
  const c = makeCanvas(FRAME_W * COLS, FRAME_H * ROWS);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function drawChibi(ctx, x0, y0, dir, frame) {
    // bob offset for walk
    let bob = 0;
    if (frame === 1) bob = -1;
    if (frame === 3) bob = -1;
    const cx = x0 + 16, cy = y0 + 8 + bob;

    // shadow
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(x0 + 10, y0 + 36, 12, 2);

    // legs
    ctx.fillStyle = PALETTE.pants;
    let legOffset = 0;
    if (frame === 1) legOffset = 1;
    if (frame === 3) legOffset = -1;
    ctx.fillRect(x0 + 12, y0 + 28 + bob, 4, 8 + legOffset);
    ctx.fillRect(x0 + 16, y0 + 28 + bob, 4, 8 - legOffset);

    // body
    ctx.fillStyle = PALETTE.shirt;
    ctx.fillRect(x0 + 10, y0 + 18 + bob, 12, 12);
    ctx.fillStyle = PALETTE.shirtDark;
    ctx.fillRect(x0 + 10, y0 + 18 + bob, 2, 12);
    ctx.fillRect(x0 + 20, y0 + 18 + bob, 2, 12);

    // arms
    ctx.fillStyle = PALETTE.skin;
    ctx.fillRect(x0 + 8,  y0 + 20 + bob, 2, 8);
    ctx.fillRect(x0 + 22, y0 + 20 + bob, 2, 8);

    // head
    ctx.fillStyle = PALETTE.skin;
    ctx.fillRect(x0 + 10, y0 + 6 + bob, 12, 14);
    ctx.fillStyle = PALETTE.skinDark;
    ctx.fillRect(x0 + 10, y0 + 18 + bob, 12, 2);

    // hair
    ctx.fillStyle = PALETTE.hair;
    ctx.fillRect(x0 + 10, y0 + 4 + bob, 12, 4);
    if (dir === 'south' || dir === 'east' || dir === 'west') {
      ctx.fillRect(x0 + 10, y0 + 8 + bob, 2, 4);
      ctx.fillRect(x0 + 20, y0 + 8 + bob, 2, 4);
    }

    // eyes / face based on direction
    if (dir === 'south') {
      ctx.fillStyle = PALETTE.eye;
      ctx.fillRect(x0 + 13, y0 + 12 + bob, 2, 2);
      ctx.fillRect(x0 + 17, y0 + 12 + bob, 2, 2);
    } else if (dir === 'east') {
      ctx.fillStyle = PALETTE.eye;
      ctx.fillRect(x0 + 18, y0 + 12 + bob, 2, 2);
    } else if (dir === 'west') {
      ctx.fillStyle = PALETTE.eye;
      ctx.fillRect(x0 + 12, y0 + 12 + bob, 2, 2);
    } else { // north: back of head, no eyes
      ctx.fillStyle = PALETTE.hair;
      ctx.fillRect(x0 + 10, y0 + 10 + bob, 12, 4);
    }
  }

  const dirs = ['south', 'west', 'north', 'east'];
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      drawChibi(ctx, col * FRAME_W, r * FRAME_H, dirs[r], col);
    }
  }
  return { canvas: c, frameW: FRAME_W, frameH: FRAME_H, cols: COLS, dirs };
}

let _assets = null;
export function buildAssets() {
  if (_assets) return _assets;
  const tileKinds = ['grass','dirt','stone','sand','water','ruin','cave','planks','stone_tile'];
  const objKinds  = ['tree','rock','crystal','plant','mineral','shrine','lantern','wood_door','flower_pot','pressure_plate','switch'];
  const tiles = {}; for (const k of tileKinds) tiles[k] = makeTile(k);
  const objects = {}; for (const k of objKinds) objects[k] = makeObject(k);
  const avatar = makeAvatar();
  _assets = { tiles, objects, avatar };
  return _assets;
}
