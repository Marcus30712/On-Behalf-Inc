// Pixel-art data for the office: character grids (one char per pixel, '.' is
// transparent) and the palettes that colour them. Pure data, no drawing.
//
// Every sprite is { w, h, palette, rows }. `palette` names the colour set the
// rows use: 'office' (furniture, tiles, icons), 'person' (any staff member,
// coloured by personPalette) or 'miso' (Kim Miso, the mentor).

const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));
const flip = (rows) => [...rows].reverse();
const sprite = (palette, rows) => Object.freeze({
  w: rows[0].length, h: rows.length, palette, rows: Object.freeze(rows),
});

// ---- Palettes -------------------------------------------------------------

const OFFICE = {
  O: '#3b2a2e', // outline
  a: '#f6e9d4', b: '#ecdabc', c: '#dcc59f', // floor, seam, knot
  W: '#6f5d7c', V: '#9a87a8', w: '#f1e6d6', x: '#d9c8b3', // wall cap, cap light, face, face shade
  d: '#c98d5c', e: '#a46a42', r: '#e4b07f', // wood, dark, light
  m: '#4a4f63', g: '#8a90a3', G: '#c9ced9', // dark grey, grey, steel
  n: '#9fdcef', N: '#5fb0cc', // screen
  t: '#6aa89f', T: '#4b807a', // chair teal
  q: '#e07f6f', Q: '#b75e53', u: '#f4a898', y: '#f7efe0', // sofa coral, cream cushion
  Y: '#f2c14e', k: '#2f2a2a', h: '#f08a3c', H: '#c9642a', // tape, cone
  i: '#ffffff', s: '#e3eaf1', B: '#84bde3', j: '#5d95c0', R: '#e05a5a', // sheet, blanket, red
  z: '#7a4a2f', // coffee
  L: '#79b96f', l: '#4f8c55', p: '#cf7650', P: '#a8573b', // leaf, pot
};

const MISO = {
  O: '#3b2a2e',
  s: '#f6d2b8', S: '#e3b394', // skin
  h: '#6b3b2a', H: '#4e2a1e', // chestnut bob
  e: '#3b2a2e', b: '#f29c94', m: '#c8645c', // eyes, blush, smile
  q: '#b07a4a', // round glasses frame
  c: '#e2a440', C: '#b97f2a', y: '#fbf3e2', // mustard cardigan, cream blouse
  p: '#5c9a8b', P: '#3f7468', // green skirt
  k: '#6a4130', // shoes
};

export const PALETTES = Object.freeze({ office: Object.freeze(OFFICE), miso: Object.freeze(MISO) });

// Person colours: chosen from the person's id only (never the nation), so the
// same person always looks the same and different people look different.
const SKIN = [
  ['#f7d7c4', '#e6b89c'], ['#f1c7a5', '#d9a47f'], ['#e0ac85', '#c48a63'],
  ['#c68e64', '#a8714b'], ['#a26c48', '#83533a'], ['#7d4f35', '#623c28'],
];
const HAIR = [
  ['#2e2530', '#1e1820'], ['#5a3a2a', '#3f2719'], ['#e8c46a', '#c9a24a'], ['#9c4a2e', '#7a3620'],
  ['#b9b4b0', '#918b86'], ['#4f8f8f', '#3a6c6c'], ['#7a4a7e', '#5a3460'], ['#2f3a55', '#222a40'],
];
const SHIRT = [
  ['#7fb2e5', '#5b8fc4'], ['#f19a86', '#cf7663'], ['#8fd1b0', '#68ab8b'], ['#b6a3e0', '#8f7cc0'],
  ['#f2c76a', '#d1a243'], ['#ec9bb6', '#c87592'], ['#a8c290', '#86a06f'], ['#4f6295', '#3a4a75'],
  ['#eeeae2', '#c9c3b7'], ['#d0794b', '#a95b33'],
];
const PANTS = ['#4a4f63', '#6b5a4a', '#3a4a6b', '#8a7d6b', '#2f2f3a'];

function hashId(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

export function personPalette(person) {
  let n = hashId(person.id);
  const pick = (list) => {
    const v = list[n % list.length];
    n = Math.floor(n / list.length);
    return v;
  };
  const [shirt, shirtDark] = pick(SHIRT);
  const [hair, hairDark] = pick(HAIR);
  const [skin, skinShade] = pick(SKIN);
  const pants = pick(PANTS);
  return Object.freeze({
    O: '#3b2a2e', s: skin, S: skinShade, h: hair, H: hairDark,
    c: shirt, C: shirtDark, p: pants, k: '#3b2a26', e: '#2e2530', b: '#f2a6a0',
  });
}

// Same per-person value for purely visual offsets (walk phase).
export const personPhase = (id) => hashId(id) % 1000;

// ---- People (16x16, front view unless noted) -------------------------------

const HEAD = [
  '................',
  '.....OOOOOO.....',
  '...OOhhhhhhOO...',
  '..OhhhhhhhhhhO..',
  '..OhhHhhhhHhhO..',
  '..OhssssssssHO..',
  '..OhsessssesHO..',
  '..OhsbssssbshO..',
  '...OSssssssSO...',
  '....OOssssOO....',
];
const BODY = [
  '...OcccsscccO...',
  '..OCccccccccCO..',
  '..OsCccccccCsO..',
];
const HEAD_BACK = [
  '................',
  '.....OOOOOO.....',
  '...OOhhhhhhOO...',
  '..OhhhhhhhhhhO..',
  '..OhhhhhhhhhhO..',
  '..OhhHhhhhHhhO..',
  '..OhhhhhhhhhhO..',
  '..OHhhhhhhhhHO..',
  '...OHhhhhhhHO...',
  '....OOssssOO....',
];
const BODY_BACK = [
  '...OccccccccO...',
  '..OCccccccccCO..',
  '..OsCccccccCsO..',
];
const STAND = [...HEAD, ...BODY,
  '...OppppppppO...',
  '....OppOOppO....',
  '....OkkO.OkkO...',
];
const WALK = [...HEAD, ...BODY,
  '...OppppppppO...',
  '...OppO..OppO...',
  '..OkkO.....OkO..',
];
const SIT = [...HEAD, ...BODY,
  '...OppppppppO...',
  '...OkkO..OkkO...',
  '................',
];
const SIT_BACK = [...HEAD_BACK, ...BODY_BACK,
  '...OppppppppO...',
  '...OkkO..OkkO...',
  '................',
];

// Kim Miso: chestnut bob with straight bangs, round glasses, mustard
// cardigan over a cream blouse, green skirt.
const MISO_STAND = [
  '................',
  '.....OOOOOO.....',
  '...OOhhhhhhOO...',
  '..OhhhhhhhhhhO..',
  '..OhhhhhhhhhhO..',
  '..OhHHHHHHHHhO..',
  '..OhqeqqqqeqhO..',
  '..OhbqqssqqbhO..',
  '..OhSssmmssShO..',
  '..OHHOssssOHHO..',
  '...OcccyycccO...',
  '..OccCcyycCccO..',
  '..OscCcyycCcsO..',
  '...OppppppppO...',
  '..OPppppppppPO..',
  '....OkO..OkO....',
];

// Headset overlays, aligned with the head rows of the person sprites.
const HEADSET = [
  '................',
  '....kkkkkkkk....',
  '...k........k...',
  '..k..........k..',
  '.k............k.',
  '.gk..........kg.',
  '.gk..........kg.',
  '.gk..........kg.',
  '..k.......mmmk..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const HEADSET_BACK = HEADSET.map((r, y) => (y === 8 ? '................' : r));

// ---- Office tiles and furniture (16x16) -------------------------------------

const FLOOR = [
  'aaaaaaaaaaaaaaba',
  'aaaaaaaaaaaacaba',
  'aaaaaaaaaaaaaaba',
  'bbbbbbbbbbbbbbbb',
  'aaaabaaaaaaaaaaa',
  'aaaabaaaaaaaaaaa',
  'aaaabaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
  'aaaaaaaaaaabaaaa',
  'aacaaaaaaaabaaaa',
  'aaaaaaaaaaabaaaa',
  'bbbbbbbbbbbbbbbb',
  'aaaaaaabaaaaaaaa',
  'aaaaaaabaaaaaaaa',
  'aaaaaaabaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
];
const WALL = [
  'VVVVVVVVVVVVVVVV',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWVWWWWWWWVWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWVWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWVW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
];
const WALL_FACE = [
  'VVVVVVVVVVVVVVVV',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'OOOOOOOOOOOOOOOO',
  'wwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwww',
  'wwwwwxwwwwwwwxww',
  'wwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwww',
  'xxxxxxxxxxxxxxxx',
  'eeeeeeeeeeeeeeee',
  'eeeeeeeeeeeeeeee',
  'OOOOOOOOOOOOOOOO',
];
const WALL_WINDOW = [
  'VVVVVVVVVVVVVVVV',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'OOOOOOOOOOOOOOOO',
  'wwOOOOOOOOOOOOww',
  'wwOiiiiiOiiiiiOw',
  'wwOnnNnnOnnnNnOw',
  'wwOnNnnnOnnNnnOw',
  'wwOnnnnnOnnnnnOw',
  'wwOOOOOOOOOOOOww',
  'xxxxxxxxxxxxxxxx',
  'eeeeeeeeeeeeeeee',
  'eeeeeeeeeeeeeeee',
  'OOOOOOOOOOOOOOOO',
];
const DOOR = [
  'eeaaaaaaaaaaaaee',
  'eeaaaaaaaaaaaaee',
  'eeaOOOOOOOOOOaee',
  'eeaOQqQqQqQqOaee',
  'eeaOqQqQqQqQOaee',
  'eeaOQqQqQqQqOaee',
  'eeaOqQqQqQqQOaee',
  'eeaOQqQqQqQqOaee',
  'eeaOqQqQqQqQOaee',
  'eeaOOOOOOOOOOaee',
  'eeaaaaaaaaaaaaee',
  'eeaaaaaaaaaaaaee',
  'eeddddddddddddee',
  'eerrrrrrrrrrrree',
  'eeddddddddddddee',
  'eeeeeeeeeeeeeeee',
];
const DESK = [
  'rrrrrrrrrrrrrrrr',
  'dddddddddddddddd',
  'ddddeddddddddddd',
  'dddddddddddedddd',
  'dddddddddddddddd',
  'ddedddddddddddde',
  'dddddddddddddddd',
  'dddddddedddddddd',
  'dddddddddddddddd',
  'dddddddddddddedd',
  'dedddddddddddddd',
  'dddddddddddddddd',
  'ddddddddeddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'eeeeeeeeeeeeeeee',
];
// Screen side, for a desk whose chair is below it (the viewer sees the screen).
const MONITOR_FRONT = [
  '................',
  '................',
  '................',
  '...OOOOOOOOOO...',
  '...OnnnnnnnnO...',
  '...OnNnnnnnnO...',
  '...OnnnNNnnnO...',
  '...OnnnnnnnnO...',
  '...OOOOOOOOOO...',
  '.......OO.......',
  '.....OmmmmO.....',
  '.....OOOOOO.....',
  '................',
  '....OgggggggO...',
  '....OOOOOOOOO...',
  '................',
];
// Back side, for a desk whose chair is above it (the sitter faces the viewer).
const MONITOR_BACK = [
  '................',
  '....OgggggggO...',
  '....OOOOOOOOO...',
  '................',
  '................',
  '....OOOOOOOO....',
  '....OmmmmmmO....',
  '....OmggggmO....',
  '....OmmmmmmO....',
  '....OOOOOOOO....',
  '......OmmO......',
  '.....OmmmmO.....',
  '.....OOOOOO.....',
  '................',
  '................',
  '................',
];
const PAPERS = [
  '................',
  '................',
  '................',
  '................',
  '...OOOOO........',
  '...OiiiO..OOOO..',
  '...OiNiO..OBBO..',
  '...OiiiO..OBBO..',
  '...OOOOO..OOOO..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const CHAIR = [
  '................',
  '....OOOOOOOO....',
  '...OTTTTTTTTO...',
  '...OTttttttTO...',
  '...OTTTTTTTTO...',
  '....OOOOOOOO....',
  '...OOOOOOOOOO...',
  '...OttttttttO...',
  '...OttttttttO...',
  '...OttttttttO...',
  '...OTTTTTTTTO...',
  '...OOOOOOOOOO...',
  '.......OO.......',
  '....OOOOOOOO....',
  '................',
  '................',
];
const SOFA_L = [
  '................',
  '................',
  '.OOOOOOOOOOOOOOO',
  '.OuuOuuuuuuuuuuO',
  '.OqQOqqqqqqqqqqO',
  '.OqQOqqqqqqqqqqO',
  '.OqQOqqqqqqqqqqO',
  '.OqQOqqqqqqqqqqO',
  '.OQQOQQQQQQQQQQO',
  '.OQQOOOOOOOOOOOO',
  '.Ouuuuuuuuuuuuuu',
  '.Oqqqqqqqqqqqqqq',
  '.Oqqqqqqqqqqqqqq',
  '.OQQQQQQQQQQQQQQ',
  '.OOOOOOOOOOOOOOO',
  '................',
];
const SOFA_M = [
  '................',
  '................',
  'OOOOOOOOOOOOOOOO',
  'uuuuuuuuuuuuuuuu',
  'qqqqqqqqqqqqqqqq',
  'qqqqqqqqqqqqqqqq',
  'qqqqqqqqqqqqqqqq',
  'qqqqqqqqqqqqqqqq',
  'QQQQQQQQQQQQQQQQ',
  'OOOOOOOOOOOOOOOO',
  'uuuuuuuuuuuuuuuu',
  'qqqqqqqqqqqqqqqq',
  'qqqqqqqqqqqqqqqq',
  'QQQQQQQQQQQQQQQQ',
  'OOOOOOOOOOOOOOOO',
  '................',
];
const PILLOW_L = [
  '................',
  '................',
  '................',
  '.....OOOOO......',
  '....OyyyyyO.....',
  '....OyyiyyO.....',
  '....OyyyyyO.....',
  '.....OOOOO......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const THROW = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...OOOOOOOOOO...',
  '...OBjBjBjBjO...',
  '...OjBjBjBjBO...',
  '...OBjBjBjBjO...',
  '...OjBjBjBjBO...',
  '...OyOyOyOyOO...',
  '................',
  '................',
];
const COFFEE = [
  '................',
  '................',
  '...OOOOOOOOOO...',
  '...OggggggggO...',
  '...OgmmmmmmgO...',
  '...OgmRmmmmgO...',
  '...OgmmmmmmgO...',
  '...OggggggggO...',
  '...OgOOOOOOgO...',
  '...OgOmmmmOgO...',
  '...OgOmiimOgO...',
  '...OgOmiimOgO...',
  '...OggggggggO...',
  '...OOOOOOOOOO...',
  '................',
  '................',
];
const COFFEE_PLUS = [
  '.....i..i.......',
  '......i..i......',
  '..OOOOOOOOOOOO..',
  '..OppppppppppO..',
  '..OPGGGGGGGGPO..',
  '..OPGmmmmmmGPO..',
  '..OPGmRmmYmGPO..',
  '..OPGGGGGGGGPO..',
  '..OPGOmmmmOGPO..',
  '..OPGOmmmmOGPO..',
  '..OPGOiOOiOGPO..',
  '..OPGOiOOiOGPO..',
  '..OPPPPPPPPPPO..',
  '..OOOOOOOOOOOO..',
  '................',
  '................',
];
const TABLE = [
  '................',
  '................',
  'OOOOOOOOOOOOOOOO',
  'rrrrrrrrrrrrrrrr',
  'dddddddddddddddd',
  'dddeddddddddeddd',
  'dddddddddddddddd',
  'dddddddedddddddd',
  'dddddddddddddddd',
  'ddddddddddddeddd',
  'ddeddddddddddddd',
  'dddddddddddddddd',
  'eeeeeeeeeeeeeeee',
  'OOOOOOOOOOOOOOOO',
  '................',
  '................',
];
const WHITEBOARD = [
  '.OOOOOOOOOOOOOO.',
  '.OiiiiiiiiiiiiO.',
  '.OiNNNiiiRRiiiO.',
  '.OiiiiiNNiiiiiO.',
  '.OiRRiiiiiNNNiO.',
  '.OiiiiiiiiiiiiO.',
  '.OOOOOOOOOOOOOO.',
  '.......OO.......',
  '......OggO......',
  '.....OOOOOO.....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const BED = [
  '................',
  '.OOOOOOOOOOOOOO.',
  '.OGGGGGGGGGGGGO.',
  '.OOOOOOOOOOOOOO.',
  '.OsiiiiiiiiiisO.',
  '.OsiiiiiiiiiisO.',
  '.OssssssssssssO.',
  '.OBBBBBBBBBBBBO.',
  '.OBjBBBBBBBBjBO.',
  '.OBBBBBRRBBBBBO.',
  '.OBBBBRRRRBBBBO.',
  '.OBBBBBRRBBBBBO.',
  '.OjjjjjjjjjjjjO.',
  '.OOOOOOOOOOOOOO.',
  '..O..........O..',
  '................',
];
// An empty spot marked out with floor tape, waiting for a facility.
const PLACEHOLDER = [
  '................',
  '.cc..cc..cc..cc.',
  '.c............c.',
  '................',
  '................',
  '.c............c.',
  '.c............c.',
  '................',
  '................',
  '.c............c.',
  '.c............c.',
  '................',
  '................',
  '.c............c.',
  '.cc..cc..cc..cc.',
  '................',
];
const CONSTRUCTION = [
  '................',
  '................',
  'YYkkYYkkYYkkYYkk',
  'YkkYYkkYYkkYYkkY',
  '................',
  '................',
  '....O......O....',
  '...OhO....OhO...',
  '...OiO....OiO...',
  '..OhhhO..OhhhO..',
  '..OiiiO..OiiiO..',
  '.OhhhhhO.OhhhhhO',
  '.OHHHHHO.OHHHHHO',
  '.OOOOOOO.OOOOOOO',
  'YYkkYYkkYYkkYYkk',
  'kYYkkYYkkYYkkYYk',
];
const PLANT = [
  '................',
  '......OOO.......',
  '...OO.OLLO.OO...',
  '..OLLOOLlLOLLO..',
  '..OLlLLLlLLlLO..',
  '.OLLLlLLLLlLLLO.',
  '.OlLLLLlLLLLLlO.',
  '..OlLlLLLlLlLO..',
  '...OOllllllOO...',
  '....OOOOOOOO....',
  '....OppppppO....',
  '....OppppPpO....',
  '.....OpppPO.....',
  '.....OPPPPO.....',
  '.....OOOOOO.....',
  '................',
];

// ---- Status icons (9x9, drawn inside a speech bubble) ----------------------

const ICON_SICK = [
  '..OOOOO..',
  '.OLLLLLO.',
  'OLkLLLkLO',
  'OLLLLLLLO',
  'OLkLkLkLO',
  'OLLLLLLLO',
  '.OLLLLLO.',
  '..OOOOO..',
  '.........',
];
const ICON_STRESS = [
  '...OOO...',
  '.OOgggOO.',
  'OgggggggO',
  'OgggggggO',
  '.OOOYOOO.',
  '...YY....',
  '....YY...',
  '....Y....',
  '.........',
];
const ICON_LEAVE = [
  '...OOO...',
  '...O.O...',
  'OOOOOOOOO',
  'OdddddddO',
  'OdedddedO',
  'OdedddedO',
  'OdddddddO',
  'OOOOOOOOO',
  '.........',
];
const SPARKLE = [
  '....Y....',
  '....Y....',
  '...YiY...',
  'YYYiiiYYY',
  '...YiY...',
  '....Y....',
  '....Y....',
  '.........',
  '.........',
];

export const SPRITES = Object.freeze({
  // people
  stand: sprite('person', STAND),
  walkA: sprite('person', WALK),
  walkB: sprite('person', mirror(WALK)),
  sit: sprite('person', SIT),
  sitBack: sprite('person', SIT_BACK),
  miso: sprite('miso', MISO_STAND),
  headset: sprite('office', HEADSET),
  headsetBack: sprite('office', HEADSET_BACK),
  // tiles and furniture
  floor: sprite('office', FLOOR),
  wall: sprite('office', WALL),
  wallFace: sprite('office', WALL_FACE),
  wallWindow: sprite('office', WALL_WINDOW),
  door: sprite('office', DOOR),
  desk: sprite('office', DESK),
  monitorFront: sprite('office', MONITOR_FRONT),
  monitorBack: sprite('office', MONITOR_BACK),
  papers: sprite('office', PAPERS),
  chair: sprite('office', CHAIR),
  chairBack: sprite('office', flip(CHAIR)),
  sofa: sprite('office', SOFA_M),
  sofaL: sprite('office', SOFA_L),
  sofaR: sprite('office', mirror(SOFA_L)),
  pillowL: sprite('office', PILLOW_L),
  pillowR: sprite('office', mirror(PILLOW_L)),
  throw: sprite('office', THROW),
  coffee: sprite('office', COFFEE),
  coffeePlus: sprite('office', COFFEE_PLUS),
  table: sprite('office', TABLE),
  whiteboard: sprite('office', WHITEBOARD),
  bed: sprite('office', BED),
  placeholder: sprite('office', PLACEHOLDER),
  construction: sprite('office', CONSTRUCTION),
  plant: sprite('office', PLANT),
  // icons
  iconSick: sprite('office', ICON_SICK),
  iconStress: sprite('office', ICON_STRESS),
  iconLeave: sprite('office', ICON_LEAVE),
  sparkle: sprite('office', SPARKLE),
});

// Base sprite for each map tile character (see render/map.js legend). The
// drawer picks variants (wall face, sofa ends, monitors, upgrades) around it.
export const TILE_SPRITES = Object.freeze({
  '#': 'wall', '.': 'floor', D: 'desk', C: 'chair', S: 'sofa', K: 'coffee',
  T: 'table', B: 'bed', P: 'plant', E: 'door',
});

// Which tiles each research's build occupies.
export const FACILITY_TILES = Object.freeze({
  'rest-room': Object.freeze(['S', 'K']),
  'stress-training': Object.freeze(['T']),
  clinic: Object.freeze(['B']),
});
