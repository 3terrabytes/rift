// Shared between server (validation) and frontend (display).
export const RECIPES = [
  { key: 'pickaxe',    name: 'Pickaxe',          inputs: { wood: 2, stone: 3 },   output: { key: 'pickaxe',   qty: 1 } },
  { key: 'axe',        name: 'Axe',              inputs: { wood: 2, stone: 2 },   output: { key: 'axe',       qty: 1 } },
  { key: 'lantern',    name: 'Lantern',          inputs: { wood: 1, crystal: 1 }, output: { key: 'lantern',   qty: 1 } },
  { key: 'planks',     name: 'Planks (x4)',      inputs: { wood: 1 },             output: { key: 'planks',    qty: 4 } },
  { key: 'stone_tile', name: 'Stone Tile (x2)',  inputs: { stone: 2 },            output: { key: 'stone_tile',qty: 2 } },
  { key: 'wood_door',  name: 'Wood Door',        inputs: { planks: 4 },           output: { key: 'wood_door', qty: 1 } },
  { key: 'flower_pot', name: 'Flower Pot',       inputs: { stone: 1, plant: 1 },  output: { key: 'flower_pot',qty: 1 } },
  { key: 'rune_key',   name: 'Rune Key',         inputs: { crystal: 2, stone: 1 },output: { key: 'rune_key',  qty: 1 } },
];

export const ITEM_INFO = {
  wood:       { name: 'Wood',       category: 'resource' },
  stone:      { name: 'Stone',      category: 'resource' },
  crystal:    { name: 'Crystal',    category: 'resource' },
  plant:      { name: 'Plant',      category: 'resource' },
  mineral:    { name: 'Mineral',    category: 'resource' },
  pickaxe:    { name: 'Pickaxe',    category: 'tool' },
  axe:        { name: 'Axe',        category: 'tool' },
  lantern:    { name: 'Lantern',    category: 'tool' },
  planks:     { name: 'Planks',     category: 'build' },
  stone_tile: { name: 'Stone Tile', category: 'build' },
  wood_door:  { name: 'Wood Door',  category: 'build' },
  flower_pot: { name: 'Flower Pot', category: 'decor' },
  rune_key:   { name: 'Rune Key',   category: 'puzzle' },
};
