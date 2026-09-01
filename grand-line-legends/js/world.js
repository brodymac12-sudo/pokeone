/* ============================================================
   GRAND LINE LEGENDS — Uncharted Waters (open-world voyages)

   Story Mode is a corridor of fourteen islands. This is the open sea
   between them: you pick a sea, pick a landing party, and sail east
   across a chart of islands nobody has mapped, one encounter per island.

   The rule that makes it a voyage rather than a menu: NOTHING HEALS
   BETWEEN ISLANDS and nothing is yours until you make port. Damage and
   status carry from fight to fight, a fighter who goes down stays down,
   and everything you win rides in the hold unbanked. Dock at the far
   edge and it is all yours; turn back early and you keep half; get
   wiped and the sea takes the coin.

   Everything here is DOM-free and deterministic given a seed, so the
   test suite can generate a thousand charts and sail whole voyages
   headlessly. Rewards flow through story.js's grantXp / recruit /
   berries, so there is exactly one progression in the game.
   ============================================================ */

const VOYAGE_PARTY_MAX = 4;
const VOYAGE_RATIONS = 2;          // supplies you sail with
const RATION_HEAL = 0.35;          // a ration restores this much max HP
const ANCHORAGE_HEAL = 0.55;
const CUT_AND_RUN_COST = 0.15;     // HP forfeited to break off a fight

/* The four seas. Each is gated on a Story chapter, so the campaign is the
   key to the ocean and the ocean is what makes the campaign's berries
   worth anything — the 14 chapters pay ~10,300 berries against a 32,000
   sink to max a single fighter, so the tavern has never been affordable.
   A voyage is a berry faucet first and an XP source second. */
const SEAS = [
  {
    id: 'east-blue', name: 'East Blue', flag: '🌊', gate: null,
    blurb: 'The weakest sea, and the one every legend starts in. Calm water, small fry, and just enough coin to buy a first round at the tavern.',
    lo: 6, hi: 14, cols: 6, portBerries: 260, portName: 'Loguetown', patrolSize: 2,
    pool: ['buggy', 'usopp', 'nami', 'chopper', 'robin', 'brook'],
    marines: [], crews: ['sunnycrew'],
  },
  {
    id: 'paradise', name: 'Paradise', flag: '🧭', gate: 'baratie',
    blurb: 'The first half of the Grand Line. Warlords, poison wardens and a log pose that spins wherever it likes.',
    lo: 15, hi: 26, cols: 7, portBerries: 520, portName: 'Water Seven', patrolSize: 3,
    pool: ['crocodile', 'robin', 'franky', 'law', 'brook', 'chopper', 'hancock', 'magellan'],
    marines: ['magellan'], crews: ['sunnycrew', 'outlaws'],
  },
  {
    id: 'sky', name: 'The Sky Belt', flag: '⛅', gate: 'skypiea',
    blurb: 'Ten thousand metres up, where the clouds carry current and the squalls have teeth. Nothing up here is survivable at half health.',
    lo: 27, hi: 38, cols: 8, portBerries: 760, portName: 'Angel Beach', patrolSize: 3,
    pool: ['enel', 'hancock', 'law', 'ace', 'marco', 'doflamingo', 'magellan', 'kizaru'],
    marines: ['kizaru'], crews: ['warlords', 'outlaws'],
  },
  {
    id: 'new-world', name: 'The New World', flag: '🔥', gate: 'marineford',
    blurb: 'Past the Red Line. Emperors, admirals and the men who fought at the summit. Bring everyone; expect to lose some of them.',
    lo: 44, hi: 56, cols: 8, portBerries: 1200, portName: 'Wano Harbour', patrolSize: 2,
    // deliberately mixed: if every drifter were an Emperor the sea would be a
    // wall rather than a voyage. The monsters are what the bounty picks.
    pool: ['kaido', 'bigmom', 'shanks', 'whitebeard', 'blackbeard', 'mihawk', 'akainu', 'aokiji', 'garp', 'loki',
           'marco', 'ace', 'law', 'doflamingo', 'crocodile', 'jinbe', 'magellan'],
    marines: ['akainu', 'aokiji', 'kizaru', 'garp'], crews: ['marines', 'whitebeard', 'warlords', 'emperors'],
  },
];

const SEA_BY_ID = {};
for (const s of SEAS) SEA_BY_ID[s.id] = s;

/* Encounter kinds. `w` is the base weight per sea (east-blue → new-world);
   `depth` scales that weight from the first leg to the last, so bounties are
   almost absent when you set out and thick on the approach to port, while
   quiet anchorages are plentiful early and scarce exactly when you are
   bleeding. `lv` bumps the foe level, `xp`/`berries` are multipliers on the
   level-neutral bases below. */
const VOYAGE_KINDS = [
  {
    id: 'duel', name: 'Drifting Fighter', flag: '⚔️', fight: 'duel',
    w: [34, 26, 24, 18], depth: [1.3, 0.7], lv: 2, xp: 0.45, berries: 0.12,
    blurb: 'A lone fighter on the wreckage of their own ship, spoiling for someone to blame.',
  },
  {
    id: 'patrol', name: 'Marine Patrol', flag: '⚓', fight: 'single',
    w: [20, 22, 16, 18], depth: [0.9, 1.1], lv: 0, xp: 0.70, berries: 0.40,
    blurb: 'Colours sighted off the bow. They boarded before you could come about.',
  },
  {
    id: 'rival', name: 'Rival Crew', flag: '🏴‍☠️', fight: 'doubles',
    w: [6, 12, 12, 16], depth: [0.5, 1.5], lv: 1, xp: 0.85, berries: 0.55,
    blurb: 'Another crew wants this stretch of water, and only one of you is leaving with it.',
  },
  {
    id: 'bounty', name: 'Bounty on the Water', flag: '💀', fight: 'single',
    w: [4, 8, 10, 10], depth: [0.2, 1.6], lv: 4, xp: 1.40, berries: 1.20,
    blurb: 'Someone with a poster of your face and the strength to collect on it.',
  },
  {
    id: 'treasure', name: 'Drifting Cache', flag: '💰', fight: null,
    w: [14, 12, 14, 10], depth: [1.2, 0.9], lv: 0, xp: 0, berries: 0.90,
    blurb: 'A sealed cache riding the swell, its owners long since drowned.',
  },
  {
    id: 'storm', name: 'Squall Line', flag: '🌩️', fight: null,
    w: [6, 10, 16, 12], depth: [0.7, 1.4], lv: 0, xp: 0.15, berries: 0,
    blurb: 'Black water and no way around it. Lash everything down and hold on.',
  },
  {
    id: 'castaway', name: 'Castaway', flag: '🪵', fight: null,
    w: [6, 4, 4, 4], depth: [1.0, 1.0], lv: 0, xp: 0, berries: 0.90,
    blurb: 'Someone clinging to a barrel, hoarse from shouting at empty water.',
  },
  {
    id: 'anchorage', name: 'Quiet Anchorage', flag: '🏝️', fight: null,
    w: [10, 6, 6, 8], depth: [1.4, 0.7], lv: 0, xp: 0, berries: 0,
    blurb: 'Sheltered water, fresh fruit and a night nobody has to keep watch.',
  },
];

const VOYAGE_KIND_BY_ID = {};
for (const k of VOYAGE_KINDS) VOYAGE_KIND_BY_ID[k.id] = k;

/* The first island of any voyage is never allowed to be a death sentence. */
const VOYAGE_OPENERS = ['duel', 'treasure', 'anchorage'];

/* How much of the hold survives each way a voyage can end. */
const VOYAGE_PAYOUT = {
  port: { xp: 1, berries: 1, title: 'MADE PORT!' },
  turnback: { xp: 0.5, berries: 0.5, title: 'TURNED BACK' },
  wipe: { xp: 0.25, berries: 0, title: 'LOST AT SEA' },
};

/* ---------------- deterministic randomness ---------------- */

/* mulberry32 — a seeded generator so a chart is a pure function of its seed.
   The engine's own combat RNG still uses Math.random; only the world is
   reproducible, which is exactly what the test suite needs. */
function worldRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function worldPick(rng, list) { return list[Math.floor(rng() * list.length)]; }
function worldInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

/* ---------------- gating ---------------- */

function seaIndex(id) { return SEAS.findIndex(s => s.id === id); }
/* A sea opens when its Story chapter is cleared — read-only against the
   campaign's own ledger, so the two modes can never corrupt each other. */
function seaUnlocked(state, sea) {
  return !sea.gate || isChapterCleared(state, sea.gate);
}

/* ---------------- chart generation ---------------- */

/* Weight of a kind in this sea at this depth (0 at the first island, 1 at
   the last), as an absolute number — the caller normalises. */
function kindWeight(kind, seaIdx, depth) {
  const base = kind.w[seaIdx] || 0;
  const [early, late] = kind.depth;
  return base * (early + (late - early) * depth);
}

function rollKind(seaIdx, depth, rng, allowed) {
  const pool = VOYAGE_KINDS.filter(k => !allowed || allowed.indexOf(k.id) >= 0);
  let total = 0;
  const weights = pool.map(k => { const w = kindWeight(k, seaIdx, depth); total += w; return w; });
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) { roll -= weights[i]; if (roll <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/* Rivalry lore makes a bounty personal when the target has a famous one. */
function bountyTitle(foeId) {
  const r = RIVALRIES.find(x => x.a === foeId || x.b === foeId);
  return r ? r.label : 'Bounty on the Water';
}

/* Pick the foes for one island. Difficulty in this engine is driven far more
   by the raw quality of the opposition than by level or headcount, so each
   sea carries its own tier of fighters and the deep seas field FEWER of them,
   not more. */
function pickFoes(sea, kind, rng) {
  const pool = sea.pool;
  if (kind.id === 'duel') return [worldPick(rng, pool)];
  if (kind.id === 'bounty') {
    const heavy = pool.slice().sort((a, b) => worldBst(b) - worldBst(a)).slice(0, 6);
    return [worldPick(rng, heavy)];
  }
  if (kind.id === 'rival') {
    const crewId = worldPick(rng, sea.crews);
    const crew = PRESET_CREWS.find(c => c.id === crewId);
    const members = (crew ? crew.members : pool).slice();
    const foes = [];
    while (foes.length < 2 && members.length) foes.push(members.splice(Math.floor(rng() * members.length), 1)[0]);
    while (foes.length < 2) foes.push(worldPick(rng, pool));
    return foes;
  }
  if (kind.id === 'patrol') {
    const src = sea.marines.length ? pool.concat(sea.marines.filter(m => pool.indexOf(m) < 0)) : pool.slice();
    const foes = [];
    const bag = src.slice();
    while (foes.length < sea.patrolSize && bag.length) foes.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
    return foes;
  }
  return [];
}

function worldBst(id) {
  const c = CHAR_BY_ID[id];
  if (!c) return 0;
  const s = c.stats;
  return s.hp + s.atk + s.def + s.satk + s.sdef + s.spd;
}

/* Level-neutral reward bases: every payout is a multiple of the XP needed for
   the next level, so an encounter is worth the same fraction of a level at 6
   as it is at 62. A Story chapter pays 3.0x; the sea tops out at 1.4x. */
function nodeXp(node, level) { return Math.round(node.xpMul * xpToNext(level)); }
function nodeBerries(node, level) { return Math.round(node.berryMul * (40 + 9 * level)); }

function buildEncounter(sea, seaIdx, node, depth, rng, allowed) {
  const kind = rollKind(seaIdx, depth, rng, allowed);
  node.kind = kind.id;
  node.fight = kind.fight;
  node.depth = depth;
  node.flag = kind.flag;
  node.blurb = kind.blurb;
  node.foes = pickFoes(sea, kind, rng);
  node.level = Math.max(1, sea.lo + Math.round((sea.hi - sea.lo) * depth) + kind.lv);
  node.xpMul = kind.xp;
  node.berryMul = kind.berries;
  node.title = kind.id === 'bounty' ? bountyTitle(node.foes[0]) : kind.name;
  if (kind.id === 'castaway') {
    // ordered candidates; who actually climbs aboard depends on your roster
    // at the moment you arrive, so the chart stays pure in (sea, seed)
    node.castaways = sea.pool.slice().sort(() => rng() - 0.5);
  }
}

/* A chart is a scatter of islands in columns running west to east, with
   routes that only ever lead east. That guarantees every voyage terminates
   and nothing can be farmed by circling back, while still letting you pick
   your own way across an open spread of water. Pure in (seaId, seed): the
   save stores the seed, never the chart. */
function generateChart(seaId, seed) {
  const sea = SEA_BY_ID[seaId];
  if (!sea) return null;
  const seaIdx = seaIndex(seaId);
  const rng = worldRng(seed);
  const cols = sea.cols;
  const grid = [];
  const nodes = [];

  const start = { id: 'start', col: -1, row: 0, x: 0.045, y: 0.5, kind: 'start', fight: null, to: [], title: 'Weigh Anchor', flag: '⚓', foes: [] };
  nodes.push(start);

  for (let c = 0; c < cols; c++) {
    const rows = worldInt(rng, 2, 4);
    const depth = cols > 1 ? c / (cols - 1) : 1;
    const list = [];
    for (let r = 0; r < rows; r++) {
      const node = {
        id: 'n' + c + '_' + r, col: c, row: r,
        x: 0.09 + 0.82 * ((c + 1) / (cols + 1)) + (rng() - 0.5) * 0.02,
        y: (r + 0.5) / rows + (rng() - 0.5) * 0.10,
        to: [],
      };
      buildEncounter(sea, seaIdx, node, depth, rng, c === 0 ? VOYAGE_OPENERS : null);
      list.push(node);
      nodes.push(node);
    }
    grid.push(list);
  }

  const port = {
    id: 'port', col: cols, row: 0, x: 0.955, y: 0.5, kind: 'port', fight: null, to: [],
    title: sea.portName, flag: '🏮', foes: [], level: sea.hi, xpMul: 0, berryMul: 0, depth: 1,
    blurb: 'Lamps on the water and a harbourmaster who does not ask questions.',
  };
  nodes.push(port);

  /* Routes: each island charts one or two courses to the next column,
     preferring the islands it lies nearest to; then a repair pass so no
     island is unreachable and none is a dead end. */
  const nearest = (from, list) => list.slice().sort((p, q) => Math.abs(p.y - from.y) - Math.abs(q.y - from.y));
  for (let c = 0; c < cols - 1; c++) {
    for (const n of grid[c]) {
      const cand = nearest(n, grid[c + 1]);
      const k = Math.min(cand.length, worldInt(rng, 1, 2));
      n.to = cand.slice(0, k).map(m => m.id);
    }
    for (const m of grid[c + 1]) {
      if (!grid[c].some(n => n.to.indexOf(m.id) >= 0)) nearest(m, grid[c])[0].to.push(m.id);
    }
  }
  start.to = grid[0].map(n => n.id);
  for (const n of grid[cols - 1]) n.to = ['port'];

  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  return { seaId, seed, cols, nodes, byId, startId: 'start', portId: 'port' };
}

function chartNode(chart, id) { return chart ? chart.byId[id] : null; }
/* The islands you may sail to from where you are. */
function chartRoutes(chart, nodeId) {
  const n = chartNode(chart, nodeId);
  return n ? n.to.map(id => chart.byId[id]).filter(Boolean) : [];
}

/* ---------------- a voyage in progress ---------------- */

function newVoyage(state, seaId, partyIds, seed) {
  const party = partyIds.slice(0, VOYAGE_PARTY_MAX);
  const run = {
    seaId, seed: seed >>> 0, at: 'start', legs: 0, visited: ['start'],
    party, hp: {}, status: {}, rations: VOYAGE_RATIONS,
    hold: { xp: 0, berries: 0, recruits: [] },
    over: null, duelist: null,
  };
  for (const id of party) { run.hp[id] = 1; run.status[id] = null; }
  return run;
}

function voyageStanding(run) { return run.party.filter(id => run.hp[id] > 0); }
function voyageDown(run) { return run.party.filter(id => run.hp[id] <= 0); }
function voyageLevels(state, run) { return run.party.map(id => levelOf(state, id)); }
function voyageAvgLevel(state, run) {
  const l = voyageLevels(state, run);
  return l.length ? l.reduce((a, b) => a + b, 0) / l.length : STORY_START_LEVEL;
}

/* Party size is the counterweight to a shared hold: sail with four and the
   whole sea fights you three levels higher. A duel is one-on-one either way,
   so it never takes the bump. */
function voyageFoeLevel(run, node) {
  const bump = node.kind === 'duel' ? 0 : Math.max(0, run.party.length - 2);
  return Math.max(1, Math.min(STORY_MAX_LEVEL + 10, (node.level || 1) + bump));
}

/* calm / choppy / rough / deadly — what the route badge reads before you
   commit to it. Reads the fight's shape AND how battered you already are,
   because the same patrol is a different question at 40% health. */
function voyageThreat(state, run, node) {
  const base = { treasure: 0, anchorage: 0, castaway: 0, start: 0, port: 0, storm: 1, duel: 1, patrol: 2, rival: 2, bounty: 3 };
  let t = base[node.kind] !== undefined ? base[node.kind] : 1;
  if (node.fight) {
    const gap = voyageFoeLevel(run, node) - voyageAvgLevel(state, run);
    if (gap >= 6) t += 1; else if (gap <= -4) t -= 1;
    const health = voyageStanding(run).reduce((a, id) => a + run.hp[id], 0) / Math.max(1, run.party.length);
    if (health < 0.5) t += 1;
  }
  return Math.max(0, Math.min(3, t));
}

/* Sail to one of the charted routes. Returns the island you arrive at. */
function voyageSail(chart, run, nodeId) {
  if (run.over) return null;
  const routes = chartRoutes(chart, run.at);
  const target = routes.find(n => n.id === nodeId);
  if (!target) return null;
  run.at = target.id;
  run.visited.push(target.id);
  run.legs++;
  run.duelist = null;
  return target;
}

function voyageHeal(run, ids, frac) {
  for (const id of ids) if (run.hp[id] > 0) run.hp[id] = Math.min(1, run.hp[id] + frac);
}

/* Burn a ration: heals everyone still standing and clears their status. */
function useRation(run) {
  if (run.rations <= 0) return false;
  const standing = voyageStanding(run);
  if (!standing.length) return false;
  run.rations--;
  voyageHeal(run, standing, RATION_HEAL);
  for (const id of standing) run.status[id] = null;
  return true;
}

/* Copy the state of the crew back out of a finished battle, so the next
   island starts exactly as beaten-up as this one ended. */
function voyageSync(run, entries) {
  for (const e of entries || []) {
    if (!(e.id in run.hp)) continue;
    run.hp[e.id] = Math.max(0, Math.min(1, e.hp));
    run.status[e.id] = e.status || null;
  }
  if (!voyageStanding(run).length) run.over = 'wipe';
}

/* The islands with no fight on them resolve here, in full. */
function voyageResolveEvent(state, run, node, rnd) {
  const rng = rnd || Math.random;
  const lv = voyageFoeLevel(run, node);
  const out = { kind: node.kind, xp: 0, berries: 0, recruit: null, healed: [], hurt: [], rations: 0, ko: [] };

  if (node.kind === 'treasure') {
    out.berries = nodeBerries(node, lv);
    if (rng() < 0.25) out.rations = 1;
  } else if (node.kind === 'storm') {
    const frac = 0.12 + 0.06 * (node.depth || 0);
    for (const id of voyageStanding(run)) {
      run.hp[id] = Math.max(0, run.hp[id] - frac);
      out.hurt.push(id);
      if (run.hp[id] <= 0) out.ko.push(id);
    }
    out.xp = nodeXp(node, lv);
  } else if (node.kind === 'castaway') {
    const taken = run.hold.recruits.map(r => r.id);
    const id = (node.castaways || []).find(c => state.roster.indexOf(c) < 0 && taken.indexOf(c) < 0);
    if (id) { out.recruit = { id, level: lv }; run.hold.recruits.push({ id, level: lv }); }
    else out.berries = nodeBerries(node, lv);   // already crewed — they would rather have the beri
  } else if (node.kind === 'anchorage') {
    const standing = voyageStanding(run);
    voyageHeal(run, standing, ANCHORAGE_HEAL);
    for (const id of standing) run.status[id] = null;
    out.healed = standing;
    out.rations = 1;
  }

  run.hold.xp += out.xp;
  run.hold.berries += out.berries;
  run.rations += out.rations;
  if (!voyageStanding(run).length) run.over = 'wipe';
  return out;
}

/* A fight is over. `entries` carries each participant's surviving HP fraction
   and status; a loss still pays a consolation share of the XP so a bad island
   is never a total write-off. */
function voyageResolveBattle(state, run, node, won, entries) {
  voyageSync(run, entries);
  const lv = voyageFoeLevel(run, node);
  const out = {
    kind: node.kind, won,
    xp: Math.round(nodeXp(node, lv) * (won ? 1 : 0.3)),
    berries: won ? nodeBerries(node, lv) : 0,
    ko: voyageDown(run),
  };
  run.hold.xp += out.xp;
  run.hold.berries += out.berries;
  if (!voyageStanding(run).length) run.over = 'wipe';
  return out;
}

/* Break off mid-fight: costs a ration and blood, but the voyage continues. */
function voyageCutAndRun(run) {
  if (run.rations <= 0) return false;
  run.rations--;
  for (const id of voyageStanding(run)) run.hp[id] = Math.max(0.01, run.hp[id] - CUT_AND_RUN_COST);
  return true;
}

function voyageAtPort(chart, run) { return run.at === chart.portId; }

/* Cash in. `how` is 'port' (everything, plus a harbour bonus), 'turnback'
   (half) or 'wipe' (a quarter of the XP and none of the coin). Recruits are
   the one thing the sea never takes back. */
function voyageBank(state, run, how) {
  const rule = VOYAGE_PAYOUT[how] || VOYAGE_PAYOUT.wipe;
  const sea = SEA_BY_ID[run.seaId];
  const xpEach = Math.round(run.hold.xp * rule.xp);
  const bonus = how === 'port' ? Math.round(sea.portBerries * (0.6 + 0.1 * run.legs)) : 0;
  const berries = Math.round(run.hold.berries * rule.berries) + bonus;

  const levelUps = [];
  for (const id of run.party) {
    const before = levelOf(state, id);
    if (grantXp(state, id, xpEach) > 0) levelUps.push({ id, from: before, to: levelOf(state, id) });
  }
  state.berries += berries;

  const recruited = [];
  for (const r of run.hold.recruits) if (recruit(state, r.id, r.level)) recruited.push(r.id);

  const w = worldEnsure(state);
  w.voyages++;
  if (how === 'port') {
    w.made[run.seaId] = (w.made[run.seaId] || 0) + 1;
    w.seed = (w.seed + 1) >>> 0;   // a fresh chart next time out
  }
  w.best[run.seaId] = Math.max(w.best[run.seaId] || 0, run.legs);
  w.run = null;
  run.over = how;

  return { how, title: rule.title, xpEach, berries, bonus, levelUps, recruited, legs: run.legs, down: voyageDown(run) };
}

/* ---------------- persistence ---------------- */

/* The world rides inside the existing 'gll-story' save, so one voyage state,
   one roster, one purse — and "Scuttle this voyage" scuttles the chart too.
   Total by construction: never throws, always hands back something usable,
   because loadStory wipes the whole save on any exception. */
function worldEnsure(state) {
  if (!state) return null;
  const w = state.world && typeof state.world === 'object' ? state.world : {};
  if (typeof w.seed !== 'number') w.seed = 1;
  if (!w.best || typeof w.best !== 'object') w.best = {};
  if (!w.made || typeof w.made !== 'object') w.made = {};
  if (typeof w.voyages !== 'number') w.voyages = 0;
  if (!w.run || typeof w.run !== 'object' || !Array.isArray(w.run.party) || !w.run.party.length || w.run.over) w.run = null;
  state.world = w;
  return w;
}

if (typeof module !== 'undefined') {
  module.exports.SEAS = SEAS;
  module.exports.SEA_BY_ID = SEA_BY_ID;
  module.exports.VOYAGE_KINDS = VOYAGE_KINDS;
  module.exports.VOYAGE_KIND_BY_ID = VOYAGE_KIND_BY_ID;
  module.exports.VOYAGE_PARTY_MAX = VOYAGE_PARTY_MAX;
  module.exports.VOYAGE_PAYOUT = VOYAGE_PAYOUT;
  module.exports.worldRng = worldRng;
  module.exports.seaUnlocked = seaUnlocked;
  module.exports.seaIndex = seaIndex;
  module.exports.generateChart = generateChart;
  module.exports.chartNode = chartNode;
  module.exports.chartRoutes = chartRoutes;
  module.exports.newVoyage = newVoyage;
  module.exports.voyageSail = voyageSail;
  module.exports.voyageStanding = voyageStanding;
  module.exports.voyageDown = voyageDown;
  module.exports.voyageFoeLevel = voyageFoeLevel;
  module.exports.voyageThreat = voyageThreat;
  module.exports.voyageSync = voyageSync;
  module.exports.voyageResolveEvent = voyageResolveEvent;
  module.exports.voyageResolveBattle = voyageResolveBattle;
  module.exports.voyageCutAndRun = voyageCutAndRun;
  module.exports.voyageAtPort = voyageAtPort;
  module.exports.voyageBank = voyageBank;
  module.exports.voyageAvgLevel = voyageAvgLevel;
  module.exports.useRation = useRation;
  module.exports.nodeXp = nodeXp;
  module.exports.nodeBerries = nodeBerries;
  module.exports.worldEnsure = worldEnsure;
  module.exports.worldBst = worldBst;
}
