/* ============================================================
   GRAND LINE LEGENDS — Pixel Sprites (24x24)
   Sprites are generated from per-character descriptors by a shared
   chibi-pirate renderer: it paints body, head, hair, hat, facial
   hair and accessories from each fighter's palette + feature flags,
   then traces a clean 1px outline. This keeps all 33 sprites a
   cohesive, detailed 24x24 set while staying easy to tweak.
   The output is still {pal, rows} so the rest of the game (and the
   validator) treats them exactly like the old hand-drawn 16x16 art.
   ============================================================ */

const SPRITE_SIZE = 24;

/* ---------- tiny pixel canvas helpers ---------- */
function blankGrid(n) {
  const g = [];
  for (let y = 0; y < n; y++) g.push(new Array(n).fill('.'));
  return g;
}
function px(g, x, y, ch) {
  if (x >= 0 && x < g.length && y >= 0 && y < g.length) g[y][x] = ch;
}
function rect(g, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(g, x, y, ch);
}
/* Trace a 1px outline (ch) into empty cells touching any drawn cell. */
function outline(g, ch) {
  const n = g.length, add = [];
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (g[y][x] !== '.') continue;
    if (nb.some(([dx, dy]) => {
      const xx = x + dx, yy = y + dy;
      return xx >= 0 && xx < n && yy >= 0 && yy < n && g[yy][xx] !== '.' && g[yy][xx] !== ch;
    })) add.push([x, y]);
  }
  for (const [x, y] of add) g[y][x] = ch;
}
function rowsToStrings(g) { return g.map(r => r.join('')); }

/* Darken a #rrggbb hex by `amt` (0..1). */
function shade(hex, amt = 0.26) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#888888');
  if (!m) return '#555555';
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amt)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amt)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amt)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function palette(d) {
  const skin = d.skin || '#f2c79b';
  const coat = d.coat || '#3a5fa8';
  const hair = d.hair || '#2a1a12';
  return {
    s: skin,
    d: d.skinShade || shade(skin),
    e: d.eye || '#1a1a1a',
    h: hair,
    H: d.hair2 || d.beard || shade(hair, 0.18),
    c: coat,
    C: d.coat2 || shade(coat),
    a: d.accent || '#e8b84a',
    t: d.hatCol || '#c8281e',
    T: d.hatCol2 || '#e8b84a',
    w: d.white || '#f0ead8',
    k: '#15151b',
    m: d.metal || '#9aa8b4',
    r: d.red || '#c83030',
  };
}

/* ---------- the chibi pirate renderer ---------- */
function buildSprite(d) {
  const g = blankGrid(SPRITE_SIZE);
  const ex = d.extras || [];
  const has = f => ex.includes(f);

  /* legs + boots */
  rect(g, 8, 20, 10, 22, 'C');
  rect(g, 13, 20, 15, 22, 'C');
  rect(g, 8, 23, 10, 23, 'k');
  rect(g, 13, 23, 15, 23, 'k');

  /* torso */
  if (d.bare) {                      // open coat over a bare chest
    rect(g, 8, 14, 15, 19, 's');
    rect(g, 6, 13, 8, 19, 'c');
    rect(g, 15, 13, 17, 19, 'c');
    rect(g, 6, 13, 17, 13, 'c');
  } else {
    rect(g, 7, 14, 16, 19, 'c');
    rect(g, 6, 13, 17, 13, 'c');
  }
  /* arms + hands */
  rect(g, 5, 14, 6, 18, has('cyborg') ? 'm' : 'c');
  rect(g, 17, 14, 18, 18, has('cyborg') ? 'm' : 'c');
  rect(g, 5, 18, 6, 19, has('cyborg') ? 'm' : 's');
  rect(g, 17, 18, 18, 19, has('cyborg') ? 'm' : 's');
  /* collar + sash */
  rect(g, 10, 13, 13, 13, 'a');
  rect(g, 11, 14, 12, 18, 'a');
  if (has('cyborg')) { px(g, 11, 16, 'a'); px(g, 12, 15, 'a'); px(g, 12, 17, 'a'); px(g, 10, 16, 'a'); }

  /* neck + head */
  rect(g, 11, 12, 12, 12, 's');
  rect(g, 8, 5, 15, 12, 's');
  rect(g, 9, 4, 14, 4, 's');
  px(g, 8, 5, '.'); px(g, 15, 5, '.');
  px(g, 8, 12, '.'); px(g, 15, 12, '.');
  /* cheek shading */
  px(g, 8, 10, 'd'); px(g, 15, 10, 'd');

  /* eyes */
  px(g, 10, 9, 'e'); px(g, 13, 9, 'e');

  /* ---- hair ---- */
  switch (d.hairStyle) {
    case 'short':
      rect(g, 9, 3, 14, 3, 'h'); rect(g, 8, 4, 15, 5, 'h');
      px(g, 8, 6, 'h'); px(g, 15, 6, 'h'); break;
    case 'slick':
      rect(g, 9, 3, 14, 3, 'h'); rect(g, 8, 4, 15, 4, 'h');
      rect(g, 8, 5, 11, 5, 'h'); px(g, 8, 6, 'h'); break;
    case 'long':
      rect(g, 9, 3, 14, 3, 'h'); rect(g, 8, 4, 15, 5, 'h');
      rect(g, 6, 5, 7, 16, 'h'); rect(g, 16, 5, 17, 16, 'h');
      px(g, 8, 6, 'h'); px(g, 15, 6, 'h'); break;
    case 'ponytail':
      rect(g, 9, 3, 14, 3, 'h'); rect(g, 8, 4, 15, 5, 'h');
      rect(g, 16, 4, 17, 11, 'h'); px(g, 8, 6, 'h'); break;
    case 'spiky':
      for (let x = 8; x <= 15; x += 2) { px(g, x, 2, 'h'); px(g, x, 3, 'h'); px(g, x + 1, 3, 'h'); }
      rect(g, 8, 4, 15, 4, 'h'); break;
    case 'afro':
      rect(g, 6, 1, 17, 5, 'h'); rect(g, 5, 2, 5, 4, 'h'); rect(g, 18, 2, 18, 4, 'h');
      px(g, 7, 0, 'h'); px(g, 16, 0, 'h'); break;
    case 'bald':
      break;
    default:
      rect(g, 9, 3, 14, 3, 'h'); rect(g, 8, 4, 15, 5, 'h');
  }
  if (has('hair_over_eye')) { rect(g, 12, 4, 14, 9, 'h'); px(g, 13, 9, 'e'); }  // covers one eye

  /* ---- facial hair ---- */
  switch (d.facial) {
    case 'beard':
      rect(g, 8, 10, 15, 12, 'H'); rect(g, 9, 13, 14, 13, 'H'); px(g, 11, 9, 'H'); px(g, 12, 9, 'H'); break;
    case 'mustache':
      rect(g, 9, 10, 14, 10, 'H'); px(g, 8, 11, 'H'); px(g, 15, 11, 'H'); break;
    case 'goatee':
      rect(g, 10, 10, 13, 10, 'H'); rect(g, 11, 11, 12, 13, 'H'); break;
    case 'stubble':
      px(g, 9, 11, 'd'); px(g, 11, 11, 'd'); px(g, 13, 11, 'd'); px(g, 14, 11, 'd'); break;
  }

  /* ---- hat ---- */
  switch (d.hat) {
    case 'straw':
      rect(g, 8, 2, 15, 4, 't'); rect(g, 4, 5, 19, 5, 't');
      rect(g, 5, 6, 18, 6, 't'); rect(g, 8, 4, 15, 4, 'a'); break;
    case 'marine':
      rect(g, 8, 2, 15, 4, 't'); rect(g, 6, 5, 17, 5, 'T');
      px(g, 11, 3, 'a'); px(g, 12, 3, 'a'); break;
    case 'bandana':
      rect(g, 8, 4, 15, 5, 'a'); px(g, 15, 5, 'a'); px(g, 16, 6, 'a'); px(g, 16, 7, 'a'); break;
    case 'crown':
      rect(g, 8, 3, 15, 4, 'T'); px(g, 8, 2, 'T'); px(g, 9, 2, 'T'); px(g, 11, 1, 'T');
      px(g, 12, 1, 'T'); px(g, 14, 2, 'T'); px(g, 15, 2, 'T'); px(g, 11, 3, 'a'); break;
    case 'tophat':
      rect(g, 8, 0, 15, 2, 't'); rect(g, 6, 3, 17, 3, 't'); rect(g, 8, 2, 15, 2, 'a'); break;
    case 'horns':
      px(g, 8, 3, 'T'); px(g, 7, 2, 'T'); px(g, 7, 1, 'T');
      px(g, 15, 3, 'T'); px(g, 16, 2, 'T'); px(g, 16, 1, 'T'); break;
    case 'feather':
      rect(g, 8, 3, 15, 4, 't'); rect(g, 7, 4, 16, 4, 't');
      px(g, 15, 2, 'r'); px(g, 16, 1, 'r'); px(g, 17, 0, 'r'); break;
    case 'spotted':
      rect(g, 7, 2, 16, 4, 't'); px(g, 9, 3, 'a'); px(g, 12, 2, 'a'); px(g, 14, 4, 'a');
      rect(g, 7, 4, 16, 4, 'T'); break;
  }

  /* ---- accessories ---- */
  if (has('sunglasses')) { rect(g, 9, 9, 14, 9, 'k'); px(g, 11, 9, 'k'); px(g, 12, 9, 'k'); }
  if (has('scar')) { px(g, 10, 7, 'r'); px(g, 10, 8, 'r'); px(g, 10, 10, 'r'); }
  if (has('halo')) { rect(g, 7, 1, 16, 1, 'T'); px(g, 6, 2, 'T'); px(g, 17, 2, 'T'); }
  if (has('antlers')) { px(g, 7, 2, 'h'); px(g, 6, 1, 'h'); px(g, 16, 2, 'h'); px(g, 17, 1, 'h'); }
  if (has('longnose')) { px(g, 7, 10, 's'); px(g, 6, 10, 's'); px(g, 5, 11, 's'); }
  if (has('clownnose')) { px(g, 11, 10, 'r'); px(g, 12, 10, 'r'); }
  if (has('snake')) { px(g, 17, 6, 'a'); px(g, 18, 7, 'a'); px(g, 18, 8, 'a'); }
  if (has('skull')) {                       // Brook: hollow sockets + nose
    rect(g, 9, 8, 10, 10, 'e'); rect(g, 13, 8, 14, 10, 'e'); px(g, 11, 11, 'e'); px(g, 12, 11, 'e');
  }
  if (has('swords')) { px(g, 4, 13, 'a'); px(g, 4, 14, 'a'); px(g, 4, 15, 'a'); rect(g, 3, 16, 3, 21, 'm'); }
  if (has('freckles')) { px(g, 9, 10, 'd'); px(g, 14, 10, 'd'); }

  outline(g, 'k');
  return { pal: palette(d), rows: rowsToStrings(g) };
}

/* ---------- per-character descriptors ---------- */
const SPRITE_DESCRIPTORS = {
  /* Straw Hats */
  luffy:   { skin: '#f2c79b', hair: '#2a1a12', hairStyle: 'short', hat: 'straw', hatCol: '#e8c95a', accent: '#c8281e', coat: '#c8281e', coat2: '#8a1a14', extras: ['scar'] },
  zoro:    { skin: '#e8b88a', hair: '#4a9a5a', hairStyle: 'short', hat: 'bandana', accent: '#1f6a45', coat: '#23232b', coat2: '#15151b', extras: ['swords'] },
  nami:    { skin: '#f5d0a8', hair: '#e8833a', hairStyle: 'long', coat: '#3a6ab4', coat2: '#274a86', accent: '#f5f5f5' },
  usopp:   { skin: '#c8956a', hair: '#1a1a1a', hairStyle: 'short', hat: 'bandana', accent: '#d4b03a', coat: '#7a8a3a', coat2: '#566327', extras: ['longnose'] },
  sanji:   { skin: '#f2c79b', hair: '#e8c95a', hairStyle: 'short', coat: '#26262e', coat2: '#15151b', accent: '#2a3a6a', extras: ['hair_over_eye'] },
  chopper: { skin: '#d4a878', skinShade: '#a4703a', hair: '#7a4a24', hairStyle: 'bald', hat: 'straw', hatCol: '#e87aa4', accent: '#8a3a4a', coat: '#4a8ad4', coat2: '#2f5e9a', extras: ['antlers'] },
  robin:   { skin: '#d9a878', hair: '#1f1a2e', hairStyle: 'long', coat: '#6a3a8a', coat2: '#47265e', accent: '#e87aa4' },
  franky:  { skin: '#e8a878', hair: '#5ad4e8', hairStyle: 'spiky', coat: '#2a7ad4', coat2: '#1c5598', accent: '#d43a3a', metal: '#9aa8b4', extras: ['sunglasses', 'cyborg'] },
  brook:   { skin: '#f0ead8', skinShade: '#cfc9b8', hair: '#1a1a22', hairStyle: 'afro', hat: 'tophat', hatCol: '#1a1a22', coat: '#2a2230', coat2: '#15151b', accent: '#e8833a', eye: '#0a0a0a', extras: ['skull'] },
  jinbe:   { skin: '#5a9ad4', skinShade: '#3a72a8', hair: '#1a1a22', hairStyle: 'ponytail', coat: '#e8b83a', coat2: '#b88a1c', accent: '#1a1a22' },

  /* Marines & World Government */
  garp:    { skin: '#e8b890', hair: '#cfd8e0', hairStyle: 'short', facial: 'goatee', hair2: '#cfd8e0', coat: '#1f3a5a', coat2: '#142840', accent: '#e8b84a', extras: ['scar'] },
  akainu:  { skin: '#caa078', hair: '#1a1a1a', hairStyle: 'short', facial: 'stubble', hat: 'marine', hatCol: '#7a1a14', coat: '#b03020', coat2: '#7a1c12', accent: '#e8b84a' },
  aokiji:  { skin: '#d8b48c', hair: '#1a1a22', hairStyle: 'short', coat: '#3a6ab4', coat2: '#274a86', accent: '#9fc4e8', extras: ['sunglasses'] },
  kizaru:  { skin: '#e8c098', hair: '#1a1a1a', hairStyle: 'slick', coat: '#c0a020', coat2: '#8a7314', accent: '#403005', extras: ['sunglasses'] },
  magellan:{ skin: '#cfae8a', hair: '#2a1a3a', hairStyle: 'short', hat: 'horns', hatCol2: '#2a1a3a', facial: 'beard', hair2: '#2a1a3a', coat: '#6a3a8a', coat2: '#47265e', accent: '#9a4ad4' },

  /* Warlords */
  mihawk:    { skin: '#dcb892', hair: '#1a1a1a', hairStyle: 'short', facial: 'goatee', hat: 'feather', hatCol: '#1a1a22', coat: '#1a1a22', coat2: '#15151b', accent: '#b03030', red: '#b03030' },
  crocodile: { skin: '#c8a070', hair: '#1a1a22', hairStyle: 'slick', facial: 'stubble', coat: '#cfae62', coat2: '#9a7d3a', accent: '#5a3a2a', extras: ['scar'] },
  doflamingo:{ skin: '#e8c098', hair: '#e8c95a', hairStyle: 'slick', coat: '#e85a8a', coat2: '#b83a66', accent: '#f5b0cc', extras: ['sunglasses'] },
  hancock:   { skin: '#f0c8a0', hair: '#1f1a2e', hairStyle: 'long', coat: '#c83040', coat2: '#8a1e2c', accent: '#e8b84a', extras: ['snake'] },
  law:       { skin: '#dcb892', hair: '#1a1a22', hairStyle: 'short', facial: 'goatee', hat: 'spotted', hatCol: '#2a3a44', hatCol2: '#37505e', coat: '#2a4a5a', coat2: '#1c3540', accent: '#e8b84a' },

  /* Emperors & Legends */
  shanks:    { skin: '#e8b890', hair: '#c83020', hairStyle: 'short', facial: 'stubble', coat: '#1a1a22', coat2: '#15151b', accent: '#c83020', bare: true, extras: ['scar'] },
  whitebeard:{ skin: '#e8b890', hair: '#e8d8a8', hairStyle: 'bald', hat: 'bandana', facial: 'mustache', hair2: '#f0ead8', coat: '#3a5a8a', coat2: '#26405e', accent: '#e8b84a', bare: true },
  ace:       { skin: '#e8b488', hair: '#1a1a1a', hairStyle: 'short', hat: 'straw', hatCol: '#e8833a', accent: '#c8541e', coat: '#e8833a', coat2: '#b8601c', bare: true, extras: ['freckles'] },
  marco:     { skin: '#e8c098', hair: '#e8d05a', hairStyle: 'spiky', coat: '#3a5a7a', coat2: '#264056', accent: '#5ab8d4', bare: true },
  blackbeard:{ skin: '#caa078', hair: '#1a1a22', hairStyle: 'short', facial: 'beard', hair2: '#1a1a22', coat: '#2a2a32', coat2: '#15151b', accent: '#7a3a8a' },
  kaido:     { skin: '#c89a70', hair: '#1a1a22', hairStyle: 'long', hat: 'horns', hatCol2: '#9c4a38', facial: 'mustache', hair2: '#1a1a22', coat: '#9c4a38', coat2: '#6e3326', accent: '#3a7bd4' },
  bigmom:    { skin: '#e8b890', hair: '#e85a8a', hairStyle: 'afro', hat: 'crown', hatCol2: '#e8b84a', coat: '#c83040', coat2: '#8a1e2c', accent: '#b09ae8' },
  enel:      { skin: '#e8c098', hair: '#e8d8a8', hairStyle: 'short', coat: '#f0ead8', coat2: '#cfc9b8', accent: '#f0c93a', extras: ['halo'] },
  buggy:     { skin: '#e8c098', hair: '#3a6ab4', hairStyle: 'short', hat: 'bandana', accent: '#e8833a', coat: '#3a8ad4', coat2: '#2660a0', extras: ['clownnose'] },

  /* Gods of the Final Saga */
  roger:     { skin: '#e8b890', hair: '#1a1a1a', hairStyle: 'short', facial: 'mustache', hair2: '#1a1a1a', coat: '#b03020', coat2: '#7a1c12', accent: '#e8b84a', bare: true },
  rocks:     { skin: '#cfb8b0', hair: '#1a1a22', hairStyle: 'spiky', facial: 'beard', hair2: '#1a1a22', coat: '#2a2438', coat2: '#15151b', accent: '#9a4ad4', eye: '#c83030' },
  imu:       { skin: '#cfc0d4', skinShade: '#a890b4', hair: '#1f1a2e', hairStyle: 'long', hat: 'crown', hatCol2: '#4a2d6e', coat: '#2e2438', coat2: '#1a1320', accent: '#b09ae8', eye: '#c83030' },
  loki:      { skin: '#e8c098', hair: '#e8d8a8', hairStyle: 'long', facial: 'beard', hair2: '#d8c088', coat: '#a4703a', coat2: '#6e4a24', accent: '#f0c93a', extras: ['scar'] },
};

/* Build the SPRITES table the rest of the game consumes. */
const SPRITES = {};
for (const id in SPRITE_DESCRIPTORS) SPRITES[id] = buildSprite(SPRITE_DESCRIPTORS[id]);

/* ---------- shared API (size-agnostic) ---------- */
function spriteSize(sp) { return sp.rows.length; }

function validateSprites() {
  const errors = [];
  for (const c of CHARACTERS) {
    const sp = SPRITES[c.id];
    if (!sp) { errors.push(`${c.id}: missing sprite`); continue; }
    const size = spriteSize(sp);
    if (size !== 16 && size !== 24) errors.push(`${c.id}: unexpected grid size ${size}`);
    sp.rows.forEach((row, i) => {
      if (row.length !== size) errors.push(`${c.id} row ${i}: length ${row.length} (expected ${size})`);
      for (const ch of row) {
        if (ch !== '.' && !sp.pal[ch]) errors.push(`${c.id} row ${i}: unknown '${ch}'`);
      }
    });
  }
  return errors;
}

/* Draw a sprite onto a canvas. flip=true mirrors horizontally. */
function drawSprite(charId, canvas, scale, flip) {
  const sp = SPRITES[charId];
  if (!sp || !canvas) return;
  const size = spriteSize(sp);
  const ctx = canvas.getContext('2d');
  canvas.width = size * scale;
  canvas.height = size * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  sp.rows.forEach((row, y) => {
    for (let x = 0; x < size; x++) {
      const ch = row[x];
      if (ch === '.' || !sp.pal[ch]) continue;
      ctx.fillStyle = sp.pal[ch];
      const dx = flip ? (size - 1 - x) : x;
      ctx.fillRect(dx * scale, y * scale, scale, scale);
    }
  });
}

/* Build a fresh canvas element with the sprite drawn. Callers pass a
   scale tuned for a 16-grid; we rescale so any grid size keeps roughly
   the same on-screen footprint (24x24 art just packs in more detail). */
function makeSpriteCanvas(charId, scale, flip) {
  const sp = SPRITES[charId];
  const size = sp ? spriteSize(sp) : 16;
  const eff = Math.max(1, Math.round(scale * 16 / size));
  const c = document.createElement('canvas');
  c.className = 'sprite-canvas';
  drawSprite(charId, c, eff, flip);
  return c;
}

if (typeof module !== 'undefined') {
  module.exports.SPRITES = SPRITES;
  module.exports.validateSprites = validateSprites;
  module.exports.buildSprite = buildSprite;
}
