// Canvas 2D drawing of the office, its people and their status bubbles.
// Sprites are painted once per palette onto small offscreen canvases (made by
// the factory passed to createDrawer, so tests need no DOM) and then copied at
// 3x scale with smoothing off. No randomness: per-person visual offsets come
// from the person's id.

import { MAP, tileAt } from './map.js';
import { SPRITES, PALETTES, FACILITY_TILES, personPalette, personPhase } from './sprites.js';

export const SCALE = 3;
export const TILE_PX = 16 * SCALE;
export const CANVAS_W = MAP.width * TILE_PX; // 960
export const CANVAS_H = MAP.height * TILE_PX; // 576

const U = SCALE; // one sprite pixel on screen
const OUTLINE = PALETTES.office.O;
const WALK_FRAME_MS = 160;
const SPARKLE_MS = 3000;
const STRESS_ALERT = 80;
const CHANNEL_MARKS = { chat: '💬', email: '✉️' }; // phone keeps the headset sprite
const MARK_PX = 7 * U;

function defaultMakeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const snap = (v) => Math.round(v / U) * U;

export function createDrawer(makeCanvas = defaultMakeCanvas) {
  const sprites = new Map(); // `${paletteKey}|${name}` -> canvas
  let office = null; // { key, canvas }

  // A sprite painted with a palette at 1x. paletteKey names the palette for
  // caching (a person's id for person palettes).
  function spriteCanvas(name, palette = PALETTES[SPRITES[name].palette], paletteKey = SPRITES[name].palette) {
    const key = `${paletteKey}|${name}`;
    let c = sprites.get(key);
    if (c) return c;
    const s = SPRITES[name];
    c = makeCanvas(s.w, s.h);
    const g = c.getContext('2d');
    s.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        g.fillStyle = palette[ch];
        g.fillRect(x, y, 1, 1);
      }
    });
    sprites.set(key, c);
    return c;
  }

  function blit(ctx, name, px, py, palette, paletteKey) {
    const c = spriteCanvas(name, palette, paletteKey);
    const s = SPRITES[name];
    ctx.drawImage(c, px, py, s.w * U, s.h * U);
  }

  // ---- office ---------------------------------------------------------------

  function facilityState(research) {
    const done = new Set(research?.done ?? []);
    const building = research?.build?.researchId ?? null;
    return { done, building };
  }

  function underConstruction(ch, building) {
    return building != null && (FACILITY_TILES[building] ?? []).includes(ch);
  }

  // Dark edge lines where a run of furniture (desks, tables) ends.
  function runEdges(g, map, x, y, ch, px, py, { top, bottom, from = 0, to = 16 }) {
    g.fillStyle = OUTLINE;
    if (tileAt(map, x - 1, y) !== ch) g.fillRect(px, py + from * U, U, (to - from) * U);
    if (tileAt(map, x + 1, y) !== ch) g.fillRect(px + TILE_PX - U, py + from * U, U, (to - from) * U);
    if (top && tileAt(map, x, y - 1) !== ch) g.fillRect(px, py, TILE_PX, U);
    if (bottom && tileAt(map, x, y + 1) !== ch) g.fillRect(px, py + TILE_PX - U, TILE_PX, U);
  }

  // Expansion areas not built yet: Map 'x,y' -> 'empty' | 'building'.
  function unbuiltTiles(map, office) {
    const level = office?.level ?? 0;
    const building = office?.build?.level ?? null;
    const tiles = new Map();
    for (const e of map.expansions ?? []) {
      if (e.level <= level) continue;
      const mode = e.level === building ? 'building' : 'empty';
      for (const [x, y] of e.tiles) tiles.set(`${x},${y}`, mode);
    }
    return tiles;
  }

  // A low rug edge around an unbuilt area, two sprite pixels inside its tiles.
  function areaOutline(g, area) {
    const xs = area.tiles.map((t) => t[0]);
    const ys = area.tiles.map((t) => t[1]);
    const x0 = Math.min(...xs) * TILE_PX + 2 * U;
    const y0 = Math.min(...ys) * TILE_PX + 2 * U;
    const w = (Math.max(...xs) + 1) * TILE_PX - 2 * U - x0;
    const h = (Math.max(...ys) + 1) * TILE_PX - 2 * U - y0;
    g.fillStyle = PALETTES.office.c;
    g.fillRect(x0, y0, w, U);
    g.fillRect(x0, y0 + h - U, w, U);
    g.fillRect(x0, y0, U, h);
    g.fillRect(x0 + w - U, y0, U, h);
  }

  function drawTile(g, map, x, y, fac, unbuilt) {
    const ch = tileAt(map, x, y);
    const px = x * TILE_PX;
    const py = y * TILE_PX;
    const put = (name) => blit(g, name, px, py);
    const area = unbuilt.get(`${x},${y}`);
    if (area) {
      put('floor');
      if (area === 'building' && ch === 'D') put('construction');
      return;
    }
    if (ch === '#') {
      const below = tileAt(map, x, y + 1);
      const face = y + 1 < map.height && below !== '#';
      put(face ? (x % 5 === 2 ? 'wallWindow' : 'wallFace') : 'wall');
      return;
    }
    put('floor');
    switch (ch) {
      case 'E': put('door'); break;
      case 'P': put('plant'); break;
      case 'C': put(tileAt(map, x, y - 1) === 'D' ? 'chairBack' : 'chair'); break;
      case 'D': {
        put('desk');
        runEdges(g, map, x, y, 'D', px, py, { top: true, bottom: true });
        if (tileAt(map, x, y - 1) === 'C') put('monitorBack');
        else if (tileAt(map, x, y + 1) === 'C') put('monitorFront');
        else if (x % 3 === 0) put('papers');
        break;
      }
      case 'S': {
        const left = tileAt(map, x - 1, y) === 'S';
        const right = tileAt(map, x + 1, y) === 'S';
        put(!left ? 'sofaL' : !right ? 'sofaR' : 'sofa');
        if (fac.done.has('rest-room')) put(!left ? 'pillowL' : !right ? 'pillowR' : 'throw');
        break;
      }
      case 'K': put(fac.done.has('rest-room') ? 'coffeePlus' : 'coffee'); break;
      case 'T': {
        put('table');
        runEdges(g, map, x, y, 'T', px, py, { from: 2, to: 14 });
        if (fac.done.has('stress-training')) {
          const middle = tileAt(map, x - 1, y) === 'T' && tileAt(map, x + 1, y) === 'T';
          put(middle ? 'whiteboard' : 'papers');
        }
        break;
      }
      case 'B': {
        if (fac.done.has('clinic')) put('bed');
        else if (!underConstruction('B', fac.building)) put('placeholder');
        break;
      }
      default: break;
    }
    if (!fac.done.has(fac.building) && underConstruction(ch, fac.building)) put('construction');
  }

  // officeState: view.office ({ level, build }); expansion areas above the
  // level draw as empty floor, or under construction while their level builds.
  function drawOffice(ctx, map = MAP, research = null, officeState = null) {
    const fac = facilityState(research);
    const level = officeState?.level ?? 0;
    const buildLevel = officeState?.build?.level ?? '';
    const key = `${map.tiles.join('/')}|${[...fac.done].sort().join(',')}|${fac.building ?? ''}|${level}|${buildLevel}`;
    if (!office || office.key !== key) {
      const canvas = makeCanvas(map.width * TILE_PX, map.height * TILE_PX);
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      const unbuilt = unbuiltTiles(map, officeState);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) drawTile(g, map, x, y, fac, unbuilt);
      }
      for (const e of map.expansions ?? []) if (e.level > level) areaOutline(g, e);
      office = { key, canvas };
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(office.canvas, 0, 0);
  }

  // ---- people ---------------------------------------------------------------

  function visible(actors, peopleView) {
    const byId = new Map(peopleView.map((p) => [p.id, p]));
    return actors
      .filter((a) => !a.gone && byId.has(a.id))
      .map((a) => ({ a, p: byId.get(a.id) }))
      .sort((l, r) => l.a.y - r.a.y || (l.a.id < r.a.id ? -1 : 1));
  }

  // Top-left screen position of a person's 16x16 sprite.
  const spot = (a) => [snap(a.x * TILE_PX), snap(a.y * TILE_PX) - 3 * U];

  function pose(a, p, timeMs) {
    const moving = a.path.length > 0;
    const tx = Math.round(a.x);
    const ty = Math.round(a.y);
    if (moving) {
      const frame = Math.floor((timeMs + personPhase(p.id)) / WALK_FRAME_MS) % 2;
      return { name: frame ? 'walkB' : 'walkA', back: false };
    }
    if (tileAt(MAP, tx, ty) === 'C') {
      if (tileAt(MAP, tx, ty - 1) === 'D') return { name: 'sitBack', back: true };
      if (tileAt(MAP, tx, ty + 1) === 'D') return { name: 'sit', back: false };
    }
    return { name: 'stand', back: false };
  }

  // A chat or email agent at work: a small 💬 or ✉️ by the head in place of
  // the headset (no art of its own).
  function channelMark(ctx, mark, px, py) {
    ctx.font = `${MARK_PX}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mark, px + 14 * U, py + 2 * U);
  }

  // clients: view.clients; an agent answering a chat or email client gets
  // that channel's mark instead of the headset. The client answered now
  // (p.answering) decides, so an email agent covering a phone client wears the
  // headset.
  function drawActors(ctx, actors, peopleView, timeMs = 0, clients = []) {
    ctx.imageSmoothingEnabled = false;
    const channelOf = new Map(clients.map((c) => [c.id, c.channel]));
    for (const { a, p } of visible(actors, peopleView)) {
      const [px, py] = spot(a);
      const { name, back } = pose(a, p, timeMs);
      blit(ctx, name, px, py, personPalette(p), `person:${p.id}`);
      if (p.role !== 'agent' || p.activity !== 'phone') continue;
      const mark = CHANNEL_MARKS[channelOf.get(p.answering ?? p.task?.clientId)];
      if (mark) channelMark(ctx, mark, px, py);
      else blit(ctx, back ? 'headsetBack' : 'headset', px, py);
    }
  }

  // ---- bubbles --------------------------------------------------------------

  function statusIcon(p) {
    const kind = p.health?.kind;
    if (kind === 'sick') return 'iconSick';
    if (kind === 'leave') return 'iconLeave';
    if (kind === 'burnout' || p.stress >= STRESS_ALERT) return 'iconStress';
    return null;
  }

  // A speech bubble 11x11 sprite pixels with a tail, holding a 9x9 icon.
  function bubble(ctx, px, py, icon) {
    const bx = px + 2 * U;
    const by = py - 11 * U;
    const W = 11 * U;
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(bx + U, by, W - 2 * U, W);
    ctx.fillRect(bx, by + U, W, W - 2 * U);
    ctx.fillRect(bx + 5 * U, by + W, U, U);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx + U, by + U, W - 2 * U, W - 2 * U);
    blit(ctx, icon, bx + U, by + U);
  }

  // sparkles: Map (or object) person id -> timeMs when their facility was
  // finished; a sparkle twinkles over them for 3 seconds from then.
  function drawBubbles(ctx, actors, peopleView, { sparkles = new Map(), timeMs = 0 } = {}) {
    ctx.imageSmoothingEnabled = false;
    const startOf = (id) => (sparkles instanceof Map ? sparkles.get(id) : sparkles[id]);
    for (const { a, p } of visible(actors, peopleView)) {
      const [px, py] = spot(a);
      const icon = statusIcon(p);
      if (icon) bubble(ctx, px, py, icon);
      const start = startOf(p.id);
      if (start != null && timeMs >= start && timeMs - start < SPARKLE_MS) {
        const twinkle = Math.floor((timeMs - start) / 250) % 2;
        const sx = px + (twinkle ? 9 : -2) * U;
        const sy = py + (icon ? -4 : twinkle ? -6 : -2) * U;
        blit(ctx, 'sparkle', sx, sy);
      }
    }
  }

  return { drawOffice, drawActors, drawBubbles, spriteCanvas };
}
