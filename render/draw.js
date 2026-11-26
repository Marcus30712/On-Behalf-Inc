// Canvas 2D drawing of the office, its people and their status bubbles.
// Sprites are painted once per palette onto small offscreen canvases (made by
// the factory passed to createDrawer, so tests need no DOM) and then copied at
// 3x scale with smoothing off. No randomness: per-person visual offsets come
// from the person's id.

import { MAP, tileAt } from './map.js';
import { SPRITES, PALETTES, FACILITY_TILES, personLook, personSprite, personPhase } from './sprites.js';
import { UI_TEXT } from '../ui/text.js';

export const SCALE = 3;
export const TILE_PX = 16 * SCALE;
export const CANVAS_W = MAP.width * TILE_PX; // 960
export const CANVAS_H = MAP.height * TILE_PX; // 576

const U = SCALE; // one sprite pixel on screen
const OUTLINE = PALETTES.office.O;
const SPARKLE_MS = 3000;
const STRESS_ALERT = 80;
const CHANNEL_MARKS = { chat: '💬', email: '✉️' }; // phone keeps the headset sprite
const MARK_PX = 7 * U;
// People are 16x24: they stand on their tile's bottom edge and reach 8 sprite
// pixels into the tile above.
const PERSON_W = 16 * U;
const PERSON_H = 24 * U;
const PERSON_LIFT = PERSON_H - TILE_PX;
// v1.6 role tag: the role's name (UI_TEXT.role) on a small dark plate, one
// sprite pixel above the sprite's top (the tallest hair, the tied topknot, is
// on row 0). Painted once per role at screen size and copied 1:1, so the
// text stays crisp. Every role's plate is as wide as the widest name, so a
// tag drawn over another hides it whole. Bubbles, channel marks and sparkles
// stack above the tag, one sprite pixel clear of it; where the canvas top
// leaves no room for the tallest of them (people in row 1, under the wall)
// they go beside the tag instead: the mark on its left, the bubble and the
// sparkle on its right.
const TAG_FONT_PX = 13; // still legible where the page shows the canvas at 0.8x
const TAG_FONT = `bold ${TAG_FONT_PX}px system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;
const TAG_H = 5 * U;
const TAG_PAD = 2;
const TAG_GAP = U;
const STACK_GAP = U;
const TAG_TEXT = '#ffffff';
const TAG_PLATES = { agent: '#33415c', lead: '#9a5b13', qa: '#2e6b5e' };
const BUBBLE_W = 11 * U; // the box; its tail hangs one sprite pixel below
const BUBBLE_H = 12 * U;
const SPARKLE_PX = 9 * U;
const TAG_ROLES = ['agent', 'lead', 'qa'];
const STACK_H = Math.max(BUBBLE_H, MARK_PX, SPARKLE_PX + 4 * U); // the sparkle twinkles 4 higher

function defaultMakeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const snap = (v) => Math.round(v / U) * U;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createDrawer(makeCanvas = defaultMakeCanvas) {
  const sprites = new Map(); // cache key (palette or person, sprite name) -> canvas
  let office = null; // { key, canvas }

  // A sprite painted with a palette at 1x, cached under key.
  function paint(s, palette, key) {
    let c = sprites.get(key);
    if (c) return c;
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

  // A named office, icon or Miso sprite in its own palette.
  function spriteCanvas(name) {
    const s = SPRITES[name];
    return paint(s, PALETTES[s.palette], `${s.palette}|${name}`);
  }

  // A person in a pose, in their own look (hair, glasses, colours from their
  // id), so one cache entry per person and pose.
  function personCanvas(p, poseName) {
    const look = personLook(p);
    return paint(personSprite(poseName, look), look.palette, `person:${p.id}|${poseName}`);
  }

  // v1.6: the role tag of `role`, cached per role (never per person or frame).
  let measurer = null;
  function textWidth(text) {
    measurer ??= makeCanvas(1, 1).getContext('2d');
    measurer.font = TAG_FONT;
    const w = measurer.measureText?.(text)?.width;
    return Number.isFinite(w) ? w : [...text].length * TAG_FONT_PX;
  }

  function roleTag(role) {
    const key = `tag:${role}`;
    let c = sprites.get(key);
    if (c) return c;
    const text = UI_TEXT.role[role] ?? String(role);
    // As wide as the widest role name, an even number of pixels, so it
    // centres on the sprite exactly and covers any tag under it.
    const widest = Math.max(...[...TAG_ROLES, role].map((r) => textWidth(UI_TEXT.role[r] ?? String(r))));
    const w = Math.ceil((widest + 2 * TAG_PAD) / 2) * 2;
    c = makeCanvas(w, TAG_H);
    const g = c.getContext('2d');
    g.fillStyle = TAG_PLATES[role] ?? OUTLINE;
    g.fillRect(U, 0, w - 2 * U, TAG_H); // corners cut by one sprite pixel
    g.fillRect(0, U, w, TAG_H - 2 * U);
    g.font = TAG_FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = TAG_TEXT;
    g.fillText(text, w / 2, TAG_H / 2 + 1);
    sprites.set(key, c);
    return c;
  }

  // The tag's place over a person whose sprite's top-left is (px, py), and
  // the line things above it stand on. Kept inside the canvas.
  function headStack(role, px, py) {
    const w = roleTag(role).width;
    const x = clamp(px + PERSON_W / 2 - w / 2, 0, CANVAS_W - w);
    const y = Math.max(0, py - TAG_GAP - TAG_H);
    const above = y - STACK_GAP;
    return { x, y, w, above, beside: above < STACK_H };
  }

  // Top-left of a w x h box standing on the stack line at x; with no room
  // above the tag (row 1), beside it at the canvas top on `side` (the other
  // side only where the canvas ends).
  function overTag(st, x, w, h, side = 'right') {
    if (!st.beside) return [x, st.above - h];
    const right = st.x + st.w + U;
    const left = st.x - U - w;
    if (side === 'left') return [left >= 0 ? left : right, 0];
    return [right + w <= CANVAS_W ? right : left, 0];
  }

  function blit(ctx, name, px, py) {
    const s = SPRITES[name];
    ctx.drawImage(spriteCanvas(name), px, py, s.w * U, s.h * U);
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

  // A prop stands on the bottom edge of its cell and may reach up over the
  // cell above (a wall or desk: nobody stands there).
  function drawProp(g, p) {
    const s = SPRITES[p.id];
    g.drawImage(spriteCanvas(p.id), p.x * TILE_PX, (p.y + 1) * TILE_PX - s.h * U, s.w * U, s.h * U);
  }

  function drawTile(g, map, x, y, fac, unbuilt, propCells) {
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
      case 'P': if (!propCells.has(`${x},${y}`)) put('plant'); break;
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
          put(middle ? 'tableBoard' : 'papers');
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
      const props = [...(map.props ?? [])].sort((l, r) => l.y - r.y || l.x - r.x);
      const propCells = new Set(props.flatMap((p) => Array.from({ length: SPRITES[p.id].w / 16 }, (_, i) => `${p.x + i},${p.y}`)));
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) drawTile(g, map, x, y, fac, unbuilt, propCells);
      }
      for (const p of props) drawProp(g, p);
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

  // Top-left screen position of a person's 16x24 sprite: its bottom edge on
  // the bottom edge of the tile the person stands on. Drawn in order of y
  // (the feet), so a person in a lower row covers the head of one above.
  const spot = (a) => [snap(a.x * TILE_PX), snap(a.y * TILE_PX) - PERSON_LIFT];

  function pose(a, p, timeMs) {
    const moving = a.path.length > 0;
    const tx = Math.round(a.x);
    const ty = Math.round(a.y);
    if (moving) {
      // One leg swap per tile walked (not per clock tick): fast walks do not slide.
      const frame = (Math.floor(a.x + a.y) + personPhase(p.id)) % 2;
      return { name: frame ? 'walkB' : 'walkA', back: false };
    }
    if (tileAt(MAP, tx, ty) === 'C') {
      if (tileAt(MAP, tx, ty - 1) === 'D') return { name: 'sitBack', back: true };
      if (tileAt(MAP, tx, ty + 1) === 'D') return { name: 'sit', back: false };
    }
    return { name: 'stand', back: false };
  }

  // A chat or email agent at work: a small 💬 or ✉️ above the tag, right of
  // where the status bubble goes, in place of the headset (no art of its own).
  function channelMark(ctx, mark, st, px) {
    const [x, y] = overTag(st, px + 12.5 * U, MARK_PX, MARK_PX, 'left');
    ctx.save();
    ctx.font = `${MARK_PX}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mark, x + MARK_PX / 2, y + MARK_PX / 2);
    ctx.restore();
  }

  // clients: view.clients; an agent answering a chat or email client gets
  // that channel's mark instead of the headset. The client answered now
  // (p.answering) decides, so an email agent covering a phone client wears the
  // headset.
  // Role tags and channel marks go on after every person, so someone walking
  // in a lower row never covers them. People on one tile (arriving at the
  // door) show one tag: the person drawn last's.
  function drawActors(ctx, actors, peopleView, timeMs = 0, clients = []) {
    ctx.imageSmoothingEnabled = false;
    const channelOf = new Map(clients.map((c) => [c.id, c.channel]));
    const shown = visible(actors, peopleView);
    const marks = new Map(); // person id -> 💬 / ✉️
    for (const { a, p } of shown) {
      const [px, py] = spot(a);
      const { name, back } = pose(a, p, timeMs);
      ctx.drawImage(personCanvas(p, name), px, py, PERSON_W, PERSON_H);
      if (name === 'sitBack') blit(ctx, 'chairRest', px, py + PERSON_LIFT); // the chair back is nearer than they are
      if (p.role === 'qa' && !back) blit(ctx, 'lanyard', px, py);
      if (p.role !== 'agent' || p.activity !== 'phone') continue;
      const mark = CHANNEL_MARKS[channelOf.get(p.answering ?? p.task?.clientId)];
      if (mark) marks.set(p.id, mark);
      else blit(ctx, back ? 'headsetBack' : 'headset', px, py);
    }
    const tileOf = (a) => `${Math.round(a.x)},${Math.round(a.y)}`;
    const tagged = new Map(shown.map(({ a }) => [tileOf(a), a.id])); // the last one per tile wins
    for (const { a, p } of shown) {
      const [px, py] = spot(a);
      const st = headStack(p.role, px, py);
      const tag = roleTag(p.role);
      if (tagged.get(tileOf(a)) === a.id) ctx.drawImage(tag, st.x, st.y, tag.width, tag.height);
      if (marks.has(p.id)) channelMark(ctx, marks.get(p.id), st, px);
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

  // A speech bubble 11x11 sprite pixels with a tail, holding a 9x9 icon,
  // above the role tag (beside it in row 1); never above the canvas.
  // Returns its top-left.
  function bubble(ctx, st, px, icon) {
    const [bx, by] = overTag(st, px + U, BUBBLE_W, BUBBLE_H);
    const W = BUBBLE_W;
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(bx + U, by, W - 2 * U, W);
    ctx.fillRect(bx, by + U, W, W - 2 * U);
    ctx.fillRect(bx + 5 * U, by + W, U, U);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx + U, by + U, W - 2 * U, W - 2 * U);
    blit(ctx, icon, bx + U, by + U);
    return [bx, by];
  }

  // sparkles: Map (or object) person id -> timeMs when their facility was
  // finished; a sparkle twinkles over them for 3 seconds from then.
  function drawBubbles(ctx, actors, peopleView, { sparkles = new Map(), timeMs = 0 } = {}) {
    ctx.imageSmoothingEnabled = false;
    const startOf = (id) => (sparkles instanceof Map ? sparkles.get(id) : sparkles[id]);
    for (const { a, p } of visible(actors, peopleView)) {
      const [px, py] = spot(a);
      const st = headStack(p.role, px, py);
      const icon = statusIcon(p);
      const at = icon ? bubble(ctx, st, px, icon) : null;
      const start = startOf(p.id);
      if (start != null && timeMs >= start && timeMs - start < SPARKLE_MS) {
        // Twinkles at the bubble's corners, or over the tag without one.
        const twinkle = Math.floor((timeMs - start) / 250) % 2;
        const [sx, sy] = at
          ? [at[0] + (twinkle ? 7 : -4) * U, at[1] + 3 * U]
          : overTag(st, px + (twinkle ? 9 : -2) * U, SPARKLE_PX, SPARKLE_PX + (twinkle ? 4 * U : 0));
        blit(ctx, 'sparkle', sx, sy);
      }
    }
  }

  return { drawOffice, drawActors, drawBubbles, spriteCanvas, personCanvas, roleTag };
}

// The person under a canvas point (canvas pixels), or null: the whole 16x24
// sprite counts, and where two overlap the lower one (drawn on top) wins.
export function personAt(actors, x, y) {
  const hit = actors
    .filter((a) => !a.gone)
    .filter((a) => {
      const left = a.x * TILE_PX;
      const bottom = (a.y + 1) * TILE_PX;
      return x >= left && x < left + PERSON_W && y >= bottom - PERSON_H && y < bottom;
    })
    .sort((l, r) => r.y - l.y)[0];
  return hit ? hit.id : null;
}
