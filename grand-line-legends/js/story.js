/* ============================================================
   GRAND LINE LEGENDS — Story Mode
   A voyage from the East Blue to Laugh Tale. Win a chapter to earn
   XP (which levels your crew), berries (which buy training) and new
   recruits. Everything here is DOM-free so a whole campaign can be
   simulated headlessly in the test suite.
   ============================================================ */

const STORY_START_CREW = ['luffy'];
const STORY_START_LEVEL = 6;
const STORY_MAX_LEVEL = 70;

/* Each chapter: the island, how many fighters you may bring (`size`),
   the foes and the level they fight at, and the spoils. */
const STORY = [
  {
    id: 'shells', sea: 'East Blue', name: 'Shells Town', flag: '⚓', level: 6, size: 1, mode: 'single',
    blurb: 'A clown pirate is shaking down the harbour town. Cut him down to size — and free the swordsman rotting in the marine yard.',
    foes: ['buggy'], unlock: ['zoro'], berries: 250,
  },
  {
    id: 'orange', sea: 'East Blue', name: 'Orange Town', flag: '🍊', level: 9, size: 2, mode: 'single',
    blurb: 'A cat burglar robs you blind before the smoke clears. Beat her and she just might chart your course.',
    foes: ['nami', 'buggy'], unlock: ['nami'], berries: 300,
  },
  {
    id: 'syrup', sea: 'East Blue', name: 'Syrup Village', flag: '🎯', level: 12, size: 2, mode: 'single',
    blurb: 'A liar with a slingshot claims to captain 8,000 men. He has exactly zero — but his aim is real.',
    foes: ['usopp', 'buggy'], unlock: ['usopp'], berries: 350,
  },
  {
    id: 'baratie', sea: 'East Blue', name: 'Baratie', flag: '🍳', level: 16, size: 3, mode: 'single',
    blurb: 'The sea-going restaurant does not take kindly to dine-and-dashers. Its cook kicks harder than most swordsmen swing.',
    foes: ['sanji', 'brook', 'buggy'], unlock: ['sanji'], berries: 400,
  },
  {
    id: 'drum', sea: 'Grand Line', name: 'Drum Island', flag: '❄️', level: 20, size: 3, mode: 'single',
    blurb: 'A snow country with no doctor — save one little reindeer who turns into a monster, and the archaeologist hunting its secrets.',
    foes: ['chopper', 'robin', 'usopp'], unlock: ['chopper'], berries: 450,
  },
  {
    id: 'alabasta', sea: 'Grand Line', name: 'Alabasta', flag: '🏜️', level: 24, size: 2, mode: 'doubles',
    blurb: 'The desert king has starved a kingdom to steal it. Two of you against two of his — and sand drinks blood.',
    foes: ['crocodile', 'robin'], unlock: ['crocodile', 'robin'], berries: 500,
  },
  {
    id: 'skypiea', sea: 'Sky Islands', name: 'Skypiea', flag: '⛅', level: 29, size: 4, mode: 'single',
    blurb: 'Ten thousand metres up, a self-styled god rules with lightning. Rubber has never been so useful.',
    foes: ['enel', 'nami', 'usopp', 'buggy'], unlock: ['enel', 'buggy'], berries: 600,
  },
  {
    id: 'water7', sea: 'Grand Line', name: 'Water Seven', flag: '🚢', level: 33, size: 4, mode: 'single',
    blurb: 'A shipwright with a cola habit, a surgeon with a grudge, and a crew that wants your archaeologist back.',
    foes: ['franky', 'law', 'robin', 'brook'], unlock: ['franky', 'law'], berries: 650,
  },
  {
    id: 'thriller', sea: 'Grand Line', name: 'Thriller Bark', flag: '👻', level: 37, size: 4, mode: 'single',
    blurb: 'A fog-bound island of stolen shadows. Somewhere in it, a skeleton has been waiting fifty years for a crew.',
    foes: ['brook', 'hancock', 'crocodile', 'magellan'], unlock: ['brook'], berries: 700,
  },
  {
    id: 'sabaody', sea: 'Grand Line', name: 'Sabaody Archipelago', flag: '🫧', level: 39, size: 4, mode: 'doubles',
    blurb: 'The last stop before the New World, and an admiral of light is already here. Pair up — nobody survives this alone.',
    foes: ['kizaru', 'doflamingo', 'hancock', 'law'], unlock: ['hancock', 'kizaru', 'doflamingo'], berries: 800,
  },
  {
    id: 'impel', sea: 'Grand Line', name: 'Impel Down', flag: '⛓️', level: 44, size: 4, mode: 'single',
    blurb: 'Six levels down, past the poison warden, the knight of the sea is waiting in a cell. Break him out.',
    foes: ['magellan', 'crocodile', 'buggy', 'jinbe'], unlock: ['magellan', 'jinbe'], berries: 900,
  },
  {
    id: 'marineford', sea: 'Grand Line', name: 'Marineford', flag: '🔥', level: 47, size: 4, mode: 'single',
    blurb: 'The whole of Navy HQ between you and your brother. Three admirals. The Hero of the Marines. No second chances.',
    foes: ['akainu', 'aokiji', 'kizaru', 'garp'], unlock: ['ace', 'marco', 'akainu', 'aokiji', 'garp'], berries: 1100,
  },
  {
    id: 'wano', sea: 'New World', name: 'Wano Country', flag: '🌸', level: 50, size: 4, mode: 'single',
    blurb: 'The Strongest Creature and the Queen of the New World, allied on one island. Onigashima falls tonight or you do.',
    foes: ['kaido', 'bigmom', 'doflamingo', 'blackbeard'], unlock: ['kaido', 'bigmom', 'blackbeard', 'mihawk'], berries: 1300,
  },
  {
    id: 'laughtale', sea: 'New World', name: 'Laugh Tale', flag: '👑', level: 52, size: 4, mode: 'single',
    blurb: 'The final island. The Pirate King, the demon of God Valley, the ruler of the empty throne — and a red-haired friend barring the way.',
    foes: ['roger', 'rocks', 'imu', 'shanks'],
    unlock: ['roger', 'rocks', 'imu', 'shanks', 'whitebeard', 'loki'], berries: 2000,
  },
];

const STORY_BY_ID = {};
for (const ch of STORY) STORY_BY_ID[ch.id] = ch;

/* ---------------- progression maths ---------------- */

/* XP required to climb from `level` to the next one. */
function xpToNext(level) { return 60 + 26 * level; }
/* XP a chapter pays each crew member who fought. Tuned so a clean win is
   worth roughly two-and-a-half levels, keeping you a step ahead of the
   islands ahead; a loss still pays a consolation share so you can grind. */
function chapterXp(chapter, won) {
  const base = 180 + chapter.level * 78;
  return Math.round(won ? base : base * 0.35);
}
/* Berries cost to buy a fighter one level at the tavern. */
function trainCost(level) { return 50 + 12 * level; }

function newStoryState() {
  const st = { v: 1, cleared: [], roster: [...STORY_START_CREW], level: {}, xp: {}, berries: 0, party: [...STORY_START_CREW] };
  for (const id of st.roster) { st.level[id] = STORY_START_LEVEL; st.xp[id] = 0; }
  return st;
}

function storyIndexOf(id) { return STORY.findIndex(c => c.id === id); }
function isChapterCleared(state, id) { return state.cleared.indexOf(id) >= 0; }
/* Chapters open in order: the first is always available, the rest need the
   previous island cleared. */
function isChapterUnlocked(state, idx) {
  if (idx <= 0) return true;
  return isChapterCleared(state, STORY[idx - 1].id);
}
function nextChapterIndex(state) {
  for (let i = 0; i < STORY.length; i++) if (!isChapterCleared(state, STORY[i].id)) return i;
  return STORY.length - 1;   // campaign complete — replay the finale
}

function levelOf(state, id) { return state.level[id] || STORY_START_LEVEL; }

/* Grant XP to one fighter, rolling over level-ups. Returns levels gained. */
function grantXp(state, id, amount) {
  let lvl = levelOf(state, id);
  let xp = (state.xp[id] || 0) + amount;
  let gained = 0;
  while (lvl < STORY_MAX_LEVEL && xp >= xpToNext(lvl)) { xp -= xpToNext(lvl); lvl++; gained++; }
  if (lvl >= STORY_MAX_LEVEL) { lvl = STORY_MAX_LEVEL; xp = Math.min(xp, xpToNext(lvl) - 1); }
  state.level[id] = lvl;
  state.xp[id] = xp;
  return gained;
}

function recruit(state, id, atLevel) {
  if (state.roster.indexOf(id) >= 0) return false;
  state.roster.push(id);
  state.level[id] = Math.max(atLevel || STORY_START_LEVEL, STORY_START_LEVEL);
  state.xp[id] = 0;
  return true;
}

/* Resolve a finished chapter: XP for the party, berries and recruits on a
   win. Mutates `state` and returns a summary for the rewards screen. */
function resolveChapter(state, chapter, won, partyIds) {
  const first = won && !isChapterCleared(state, chapter.id);
  const xpEach = chapterXp(chapter, won);
  const levelUps = [];
  for (const id of partyIds) {
    const before = levelOf(state, id);
    const gained = grantXp(state, id, xpEach);
    if (gained > 0) levelUps.push({ id, from: before, to: levelOf(state, id) });
  }
  const recruited = [];
  let berries = 0;
  if (won) {
    berries = first ? chapter.berries : Math.round(chapter.berries * 0.25);
    state.berries += berries;
    for (const id of (chapter.unlock || [])) if (recruit(state, id, chapter.level + 2)) recruited.push(id);
    if (first) state.cleared.push(chapter.id);
  }
  return { won, first, xpEach, levelUps, recruited, berries };
}

/* Spend berries at the tavern for one level. */
function trainFighter(state, id) {
  const lvl = levelOf(state, id);
  if (lvl >= STORY_MAX_LEVEL) return { ok: false, reason: 'maxed' };
  const cost = trainCost(lvl);
  if (state.berries < cost) return { ok: false, reason: 'berries', cost };
  state.berries -= cost;
  state.level[id] = lvl + 1;
  state.xp[id] = 0;
  return { ok: true, cost, level: lvl + 1 };
}

/* ---------------- persistence ---------------- */
const STORY_KEY = 'gll-story';
function saveStory(state) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORY_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
}
function loadStory() {
  try {
    if (typeof localStorage === 'undefined') return newStoryState();
    const raw = localStorage.getItem(STORY_KEY);
    if (!raw) return newStoryState();
    const st = JSON.parse(raw);
    if (!st || !Array.isArray(st.roster) || !st.roster.length) return newStoryState();
    st.cleared = Array.isArray(st.cleared) ? st.cleared : [];
    st.level = st.level || {}; st.xp = st.xp || {};
    st.berries = st.berries || 0;
    st.party = Array.isArray(st.party) ? st.party : [...st.roster].slice(0, 1);
    return st;
  } catch (e) { return newStoryState(); }
}
function resetStory() {
  const st = newStoryState();
  saveStory(st);
  return st;
}

if (typeof module !== 'undefined') {
  module.exports.STORY = STORY;
  module.exports.STORY_BY_ID = STORY_BY_ID;
  module.exports.STORY_START_CREW = STORY_START_CREW;
  module.exports.STORY_START_LEVEL = STORY_START_LEVEL;
  module.exports.STORY_MAX_LEVEL = STORY_MAX_LEVEL;
  module.exports.newStoryState = newStoryState;
  module.exports.isChapterUnlocked = isChapterUnlocked;
  module.exports.isChapterCleared = isChapterCleared;
  module.exports.nextChapterIndex = nextChapterIndex;
  module.exports.resolveChapter = resolveChapter;
  module.exports.recruit = recruit;
  module.exports.trainFighter = trainFighter;
  module.exports.trainCost = trainCost;
  module.exports.xpToNext = xpToNext;
  module.exports.chapterXp = chapterXp;
  module.exports.levelOf = levelOf;
  module.exports.grantXp = grantXp;
  module.exports.storyIndexOf = storyIndexOf;
}
