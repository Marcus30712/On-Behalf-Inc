// Pixel-art data for the office: character grids (one char per pixel, '.' is
// transparent) and the palettes that colour them. Pure data, no drawing.
//
// Every sprite is { w, h, palette, rows }. `palette` names the colour set the
// rows use: 'office' (furniture, tiles, icons), 'person' (any staff member,
// coloured by personLook) or 'miso' (Kim Miso, the mentor). SPRITES.person
// groups the five poses of the default look; PERSON_SPRITES has every look.

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
// Skin runs light to deep; hair and shirts follow the approved reference.
// [skin, shade, glasses frame]: slate frames on lighter skin, pale steel on
// deeper skin, so the lenses always show.
const SKIN = [
  ['#f7d7c4', '#e6b89c', '#5d6680'], ['#f1c7a5', '#d9a47f', '#5d6680'], ['#e0ac85', '#c48a63', '#5d6680'],
  ['#c68e64', '#a8714b', '#4a4f63'], ['#a26c48', '#83533a', '#dfe3ea'], ['#7d4f35', '#623c28', '#dfe3ea'],
  ['#6b4430', '#523222', '#dfe3ea'],
];
const HAIR = [
  ['#2e2530', '#1a1419'], // black
  ['#5a3a2a', '#3f2719'], // dark brown
  ['#8a4b2a', '#6a361d'], // chestnut
  ['#c8642e', '#9e4820'], // ginger
  ['#e2b85e', '#bf9440'], // blonde
  ['#b9b4b0', '#8f8984'], // grey
];
// [shirt, shade, collar]
const SHIRT = [
  ['#6f9fd8', '#4f7db6', '#f4f1ea'], // blue
  ['#7cbf8e', '#5a9a6b', '#f4f1ea'], // green
  ['#a58bd0', '#8167ad', '#f4f1ea'], // purple
  ['#f4f1ea', '#cdc5b6', '#ffffff'], // white
  ['#f19a86', '#cf7663', '#f4f1ea'], // coral
  ['#f2c76a', '#d1a243', '#f4f1ea'], // mustard
  ['#ec9bb6', '#c87592', '#f4f1ea'], // pink
  ['#4f6295', '#3a4a75', '#dfe4ee'], // navy
  ['#d0794b', '#a95b33', '#f4f1ea'], // rust
];
// [pants, shade]
const PANTS = [
  ['#4a4f63', '#363a4a'], ['#3a4a6b', '#2a3650'], ['#a8936f', '#857254'],
  ['#2f2f3a', '#1f1f28'], ['#6b5a4a', '#524436'],
];
const HAIR_STYLES = ['short', 'long', 'curly', 'tied'];

function hashId(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  // full fmix32 finalizer: sequential ids (p0.., h1..) spread evenly
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// A person's look: palette for the 'person' sprites, hair style and glasses.
export function personLook(person) {
  let n = hashId(person.id);
  const pick = (list) => {
    const v = list[n % list.length];
    n = Math.floor(n / list.length);
    return v;
  };
  // Pick order keeps the fixed id windows players see (p0..p9, h1..h14)
  // varied: no hair colour, style, skin or shirt on more than 5 of 14.
  const [skin, skinShade, frame] = pick(SKIN);
  const style = pick(HAIR_STYLES);
  const [shirt, shirtDark, collar] = pick(SHIRT);
  const [hair, hairDark] = pick(HAIR);
  const [pants, pantsDark] = pick(PANTS);
  const glasses = pick([false, false, false, true]);
  return Object.freeze({
    palette: Object.freeze({
      O: '#3b2a2e', s: skin, S: skinShade, h: hair, H: hairDark,
      e: '#2e2530', b: '#f2a6a0', m: '#b4584f', g: frame,
      c: shirt, C: shirtDark, w: collar, p: pants, P: pantsDark,
      t: '#5a3c2c', y: '#e8c46a', k: '#6a4a3a',
    }),
    hair: style,
    glasses,
  });
}

// Same per-person value for purely visual offsets (walk phase).
export const personPhase = (id) => hashId(id) % 1000;

// ---- People (16x24) ----------------------------------------------------------
// Rows 0-11 are the head (one per hair style, front and back), rows 12-23 the
// body (one per pose). Long hair drapes over the shoulders; glasses sit on
// the eyes of front views. Every pose shares the same head rows, so walking
// frames never flicker the hair.

// Paints `top` over `base` from row `at`; '.' in `top` keeps the base pixel.
const overlay = (base, top, at = 0) => base.map((row, y) => {
  const t = top[y - at];
  if (!t) return row;
  return [...row].map((ch, x) => (t[x] !== '.' ? t[x] : ch)).join('');
});

// Lower face shared by every front head: eyes, blush, mouth, chin. `side` is
// what frames the cheeks (hair or skin).
const face = (side) => [
  `..O${side}ssssssss${side}O..`,
  '..OssessssessO..',
  '..OssessssessO..',
  '..OsbssmmssbsO..',
  '...OSssssssSO...',
];

const HEADS = {
  short: {
    front: [
      '................',
      '.....OOOOOO.....',
      '...OOhhhhhhOO...',
      '..OhhhhhhhhhhO..',
      '..OhhhhhhhhhHO..',
      '..OhhhhhhhHhhO..',
      '..OhhssssHhhhO..',
      ...face('h'),
    ],
    back: [
      '................',
      '.....OOOOOO.....',
      '...OOhhhhhhOO...',
      '..OhhhhhhhhhhO..',
      '..OhhhhhhhhhhO..',
      '..OhhHhhhhHhhO..',
      '..OhhhhhhhhhhO..',
      '..OhhhhhhhhhhO..',
      '..OHhhhhhhhhHO..',
      '..OsHhhhhhhHsO..',
      '..OssHHHHHHssO..',
      '...OSssssssSO...',
    ],
  },
  long: {
    front: [
      '................',
      '.....OOOOOO.....',
      '...OOhhhhhhOO...',
      '..OhhhhhhhhhhO..',
      '..OhhhhhHhhhhO..',
      '..OhhhhHhHhhhO..',
      '..OhhhssssHhhO..',
      '..OhhssssssshO..',
      '..OhsessssesHO..',
      '..OhsessssesHO..',
      '..OhbssmmssbHO..',
      '..OhhSssssShHO..',
    ],
    back: [
      '................',
      '.....OOOOOO.....',
      '...OOhhhhhhOO...',
      '..OhhhhhHhhhhO..',
      '..OhhhhHHhhhhO..',
      '..OhhhHhhHhhhO..',
      '..OhhHhhhhHhhO..',
      '..OhhhhhhhhhhO..',
      '..OhHhhhhhhHhO..',
      '..OhhhhhhhhhhO..',
      '..OhhHhhhhHhhO..',
      '..OhhhhhhhhhhO..',
    ],
    drapeFront: [
      '..OhhO....OhHO..',
      '..OhHO....OHhO..',
      '...OO......OO...',
    ],
    drapeBack: [
      '..OHhhhhhhhhHO..',
      '...OhHhhhhHhO...',
      '....OOOOOOOO....',
    ],
  },
  curly: {
    front: [
      '....OOO..OOO....',
      '...OhhhOOhhhO...',
      '..OhhHhhhhHhhO..',
      '.OhhhhhHhhhhhhO.',
      '.OhHhhhhhhhhHhO.',
      '.OhhhhHhhHhhhhO.',
      '.OhHhsssssshHhO.',
      '.OhhssssssssHhO.',
      '.OhssessssessHO.',
      '.OhssessssesshO.',
      '.OhsbssmmssbshO.',
      '.OhOSssssssSOhO.',
    ],
    back: [
      '....OOO..OOO....',
      '...OhhhOOhhhO...',
      '..OhhHhhhhHhhO..',
      '.OhhhhhHhhhhhhO.',
      '.OhHhhhhhhhhHhO.',
      '.OhhhhHhhHhhhhO.',
      '.OhHhhhhhhhhHhO.',
      '.OhhhHhhhhHhhhO.',
      '.OhHhhhhHhhhHhO.',
      '.OhhhhhhhhhhhhO.',
      '.OhhHhhhhhhHhhO.',
      '..OOhhHhhHhhOO..',
    ],
  },
  tied: {
    front: [
      '......OOOO......',
      '.....OhHhhO.....',
      '....OOOccOOO....',
      '...OhhhHHhhhO...',
      '..OhhhHhhHhhhO..',
      '..OhhHhhhhHhhO..',
      '..OhHssssssHhO..',
      ...face('h'),
    ],
    back: [
      '......OOOO......',
      '.....OhHhhO.....',
      '....OOOccOOO....',
      '...OhhhHHhhhO...',
      '..OhhhHhhHhhhO..',
      '..OhhHhhhhHhhO..',
      '..OhHhhhhhhHhO..',
      '..OhhhhhhhhhhO..',
      '..OhhhhhhhhhhO..',
      '..OsHhhhhhhHsO..',
      '..OssHHHHHHssO..',
      '...OSssssssSO...',
    ],
  },
};

// Two small lens rings, each holding an eye and a skin pixel, joined by a
// bridge; they stop short of the cheeks so they never meet the headset cups.
const GLASSES = [
  ...Array(7).fill('................'),
  '.....gg..gg.....',
  '....g..gg..g....',
  '....g......g....',
  '.....gg..gg.....',
];

// Shirt with a collar, belt, trousers, shoes.
const TORSO = [
  '......OssO......',
  '....OwwsswwO....',
  '...OcccwwcccO...',
  '..OcCccccccCcO..',
  '..OcCccccccCcO..',
  '..OcCccccccCcO..',
  '..OsOccccccOsO..',
  '...OtttyytttO...',
];
const TORSO_BACK = [
  '......OssO......',
  '....OwwwwwwO....',
  '...OccccccccO...',
  '..OcCccccccCcO..',
  '..OcCccccccCcO..',
  '..OcCccccccCcO..',
  '..OsOccccccOsO..',
  '...OttttttttO...',
];
const LEGS_STAND = [
  '...OppppppppO...',
  '...OpppOOpppO...',
  '...OppPOOPppO...',
  '..OkkkkOOkkkkO..',
];
const LEGS_WALK = [
  '...OppppppppO...',
  '...OpppOOpppO...',
  '..OppPO..OPpO...',
  '..OkkkO...OkkO..',
];
const LEGS_SIT = [
  '..OppppppppppO..',
  '..OpPppOOppPpO..',
  '..OkkkO..OkkkO..',
  '................',
];
const LEGS_SIT_BACK = [
  '..OppppppppppO..',
  '..OOOOOOOOOOOO..',
  '................',
  '................',
];

// Walking frames mirror only the legs; the back view is for sitting at a desk
// that faces away from the viewer.
const BODIES = {
  stand: [...TORSO, ...LEGS_STAND],
  walkA: [...TORSO, ...LEGS_WALK],
  walkB: [...TORSO, ...mirror(LEGS_WALK)],
  sit: [...TORSO, ...LEGS_SIT],
  sitBack: [...TORSO_BACK, ...LEGS_SIT_BACK],
};

function personRows(pose, hair, glasses) {
  const head = HEADS[hair];
  const back = pose === 'sitBack';
  let rows = [...(back ? head.back : head.front), ...BODIES[pose]];
  const drape = back ? head.drapeBack : head.drapeFront;
  if (drape) rows = overlay(rows, drape, 12);
  if (glasses && !back) rows = overlay(rows, GLASSES);
  return rows;
}

const POSES = ['stand', 'walkA', 'walkB', 'sit', 'sitBack'];

// `${hair}` or `${hair}+glasses` -> { stand, walkA, walkB, sit, sitBack }.
export const PERSON_SPRITES = Object.freeze(Object.fromEntries(
  HAIR_STYLES.flatMap((hair) => [false, true].map((glasses) => [
    `${hair}${glasses ? '+glasses' : ''}`,
    Object.freeze(Object.fromEntries(POSES.map((pose) => [pose, sprite('person', personRows(pose, hair, glasses))]))),
  ])),
));

// The sprite for a pose in a person's look (from personLook).
export const personSprite = (pose, look) => PERSON_SPRITES[`${look.hair}${look.glasses ? '+glasses' : ''}`][pose];

// Kim Miso: chestnut bob with straight bangs, round glasses, mustard
// cardigan over a cream blouse, green skirt.
const MISO_STAND = [
  '................',
  '.....OOOOOO.....',
  '...OOhhhhhhOO...',
  '..OhhhhhhhhhhO..',
  '..OhhhhhhhhhhO..',
  '..OhhhhhhhhhhO..',
  '..OhHHHHHHHHhO..',
  '..OhsqqssqqshO..',
  '..OhqesqqseqhO..',
  '..OhbqqssqqbhO..',
  '..OhSssmmssShO..',
  '..OHhSssssShHO..',
  '..OHHOOssOOHHO..',
  '...OOyyyyyyOO...',
  '..OcccyyyycccO..',
  '..OcCccyyccCcO..',
  '..OcCccyyccCcO..',
  '..OsOccyyccOsO..',
  '...OppppppppO...',
  '..OppppppppppO..',
  '..OPppppppppPO..',
  '....OsO..OsO....',
  '....OsO..OsO....',
  '...OkkO..OkkO...',
];

// Headset (agents on the phone): band over the head, ear cups, a mic boom.
const HEADSET = [
  '................',
  '.....mmmmmm.....',
  '...mm......mm...',
  '..m..........m..',
  '..m..........m..',
  '..m..........m..',
  '..m..........m..',
  '.Okk........kkO.',
  '.Okg........gkO.',
  '.Okg........gkO.',
  '.Okk........kkO.',
  '..Okkkkg........',
  ...Array(12).fill('................'),
];
const HEADSET_BACK = HEADSET.map((r, y) => (y >= 11 ? '................' : r));

// Lanyard and badge (QA).
const LANYARD = [
  ...Array(13).fill('................'),
  '.....j....j.....',
  '......j..j......',
  '.......jj.......',
  '......OiiO......',
  '......OBBO......',
  '......OOOO......',
  ...Array(5).fill('................'),
];

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
  // people (16x24): the default look; every look is in PERSON_SPRITES
  person: PERSON_SPRITES.short,
  miso: sprite('miso', MISO_STAND),
  headset: sprite('office', HEADSET),
  headsetBack: sprite('office', HEADSET_BACK),
  lanyard: sprite('office', LANYARD),
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
