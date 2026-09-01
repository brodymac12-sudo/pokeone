/* Headless test: validates data, sprites, and battle engine.
   Run: node test/sim.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const code = ['js/data.js', 'js/story.js', 'js/engine.js', 'js/world.js', 'js/sprites.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('\n;\n');

// share the outer Math so tests can make the engine's RNG deterministic
const ctx = { module: { exports: {} }, console, Math };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const sandbox = ctx.module.exports;

const { CHARACTERS, PRESET_CREWS, TYPES, TYPE_CHART } = sandbox;
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
}

/* ---- data integrity ---- */
check(CHARACTERS.length >= 33, `at least 33 characters (got ${CHARACTERS.length})`);
const moveNames = new Set();
const abilityNames = new Set();
let statusMoveCount = 0;
for (const c of CHARACTERS) {
  check(c.types.every(t => TYPES[t]), `${c.id}: valid types`);
  check(c.moves.length >= 6, `${c.id}: has an expanded movepool (got ${c.moves.length})`);
  check(c.moves.some(m => m.fx && m.fx.protect), `${c.id}: pool contains a Protect move`);
  check(c.moves.slice(0, 4).every(m => !m.doubles), `${c.id}: default loadout has no doubles-only moves`);
  abilityNames.add(c.ability.name);
  for (const m of c.moves) {
    check(TYPES[m.type] !== undefined, `${c.id}/${m.name}: valid move type ${m.type}`);
    check(typeof m.pow === 'number' && typeof m.acc === 'number', `${c.id}/${m.name}: pow/acc`);
    moveNames.add(m.name);
    if (m.pow === 0) statusMoveCount++;
  }
}
console.log(`characters: ${CHARACTERS.length}, unique moves: ${moveNames.size}, unique abilities: ${abilityNames.size}, status moves: ${statusMoveCount}`);
check(moveNames.size >= CHARACTERS.length * 4 - 2, 'moves are (nearly all) unique');
check(abilityNames.size === CHARACTERS.length, 'every ability unique');
check(statusMoveCount >= 24, `at least 24 status moves (got ${statusMoveCount})`);
for (const id of ['roger', 'rocks', 'imu', 'loki']) check(sandbox.CHAR_BY_ID[id], `new legend ${id} exists`);

/* ---- loadouts & Protect ---- */
{
  // default loadout = the first 4 (canonical signature) moves of the pool
  const dflt = new sandbox.Battle(['zoro'], ['nami']);
  const zf = dflt.sides.player.crew[0];
  check(zf.moves.length === 4, `default loadout is 4 moves (got ${zf.moves.length})`);
  check(zf.moves.every((m, i) => m === sandbox.CHAR_BY_ID['zoro'].moves[i]), 'default loadout = first 4 of pool');

  // a custom loadout (by index) is honored, including putting Protect first
  const pool = sandbox.CHAR_BY_ID['luffy'].moves;
  const protectIdx = pool.findIndex(m => m.fx && m.fx.protect);
  check(protectIdx >= 0, 'luffy pool contains Protect');
  const b = new sandbox.Battle(['luffy'], ['kaido'], { playerLoadouts: [[protectIdx, 0, 1, 2]] });
  const lf = b.sides.player.crew[0];
  check(lf.moves.length === 4 && lf.moves[0].fx && lf.moves[0].fx.protect, 'custom loadout resolves with Protect first');

  // Protect (high priority) blocks the enemy's attack that turn
  const before = lf.hp;
  b.playTurn({ type: 'move', idx: 0 });
  check(lf.hp === before, `Protect blocked all damage this turn (${before} -> ${lf.hp})`);
  check(lf.protecting === false, 'guard expires at end of turn');

  // consecutive Protect suffers diminishing success and never throws
  let guardOk = true;
  try { for (let k = 0; k < 8; k++) b.playTurn({ type: 'move', idx: 0 }); }
  catch (e) { guardOk = false; }
  check(guardOk, 'repeated Protect runs without error');
}

/* damaging moves should carry secondary effects or priority */
let dmgMoves = 0, dmgWithFx = 0;
for (const c of CHARACTERS) for (const m of c.moves) {
  if (m.pow > 0) {
    dmgMoves++;
    if ((m.fx && Object.keys(m.fx).length) || (m.prio || 0) > 0) dmgWithFx++;
  }
}
console.log(`damaging moves with effects: ${dmgWithFx}/${dmgMoves}`);
check(dmgWithFx / dmgMoves >= 0.9, `90%+ of damaging moves have effects (got ${(dmgWithFx / dmgMoves * 100).toFixed(0)}%)`);

/* ---- power hierarchy: stat totals must follow the manga ---- */
const bst = c => c.stats.hp + c.stats.atk + c.stats.def + c.stats.satk + c.stats.sdef + c.stats.spd;
const T = id => bst(sandbox.CHAR_BY_ID[id]);
// every fighter has the full split stat block
for (const c of CHARACTERS) for (const k of ['hp', 'atk', 'def', 'satk', 'sdef', 'spd'])
  check(typeof c.stats[k] === 'number', `${c.id}: has ${k}`);
check(T('roger') > T('shanks'), 'Roger > Shanks');
check(T('imu') > T('kaido'), 'Imu > Kaido');
check(T('rocks') > T('whitebeard'), 'Rocks > Whitebeard');
check(T('shanks') > T('mihawk'), 'Shanks > Mihawk');
check(T('shanks') - T('usopp') >= 140, 'Shanks dwarfs Usopp by 140+ BST');
check(T('garp') > T('law'), 'Garp > Law');
check(T('luffy') > T('sanji') && T('sanji') > T('nami'), 'Straw Hat internal hierarchy');
check(T('buggy') < 430 && T('usopp') < 440 && T('nami') < 470, 'support tier stays lean');
// weak characters compensate with utility: each sub-500 fighter has a status move
for (const c of CHARACTERS) {
  if (bst(c) < 500) check(c.moves.some(m => m.pow === 0), `${c.id} (BST ${bst(c)}) carries a status move`);
}
/* every damaging move is labelled physical or special */
for (const c of CHARACTERS) for (const m of c.moves) {
  if (m.pow > 0) check(m.cat === 'physical' || m.cat === 'special', `${c.id}/${m.name}: has a damage class`);
}

for (const t of Object.keys(TYPE_CHART)) {
  check(TYPES[t], `chart attacker ${t} is a real type`);
  for (const d of Object.keys(TYPE_CHART[t])) check(TYPES[d], `chart defender ${d} valid`);
}
for (const crew of PRESET_CREWS) {
  check(crew.members.length === sandbox.CREW_SIZE, `${crew.id}: crew size`);
  crew.members.forEach(id => check(sandbox.CHAR_BY_ID[id], `${crew.id}: member ${id} exists`));
}

/* ---- sprites ---- */
const spriteErrors = sandbox.validateSprites();
spriteErrors.forEach(e => { console.error('SPRITE:', e); failures++; });
console.log(`sprites validated: ${CHARACTERS.length - spriteErrors.length ? 'see above' : ''}${spriteErrors.length === 0 ? 'all OK' : spriteErrors.length + ' errors'}`);

/* ---- battle simulation ---- */
function randomCrew() {
  const pool = [...CHARACTERS.map(c => c.id)];
  const crew = [];
  for (let i = 0; i < sandbox.CREW_SIZE; i++) {
    crew.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return crew;
}

let finished = 0, totalTurns = 0, maxTurns = 0;
const eventTypes = new Set();
for (let i = 0; i < 300; i++) {
  const b = new sandbox.Battle(randomCrew(), randomCrew());
  let guard = 0;
  while (!b.over && guard < 500) {
    guard++;
    if (b.awaitingReplace) {
      const idx = b.sides.player.crew.findIndex(f => f.alive);
      b.submitReplace(idx).forEach(e => eventTypes.add(e.t));
      continue;
    }
    // player AI = reuse enemy AI brain
    const action = b.chooseAI('player');
    const evs = b.playTurn(action);
    evs.forEach(e => eventTypes.add(e.t));
    // sanity: hp in range
    for (const sk of ['player', 'enemy']) for (const f of b.sides[sk].crew) {
      check(f.hp >= 0 && f.hp <= f.maxHp, `hp bounds: ${f.name} ${f.hp}/${f.maxHp}`);
    }
  }
  check(b.over, `battle ${i} finished (turns=${b.turn})`);
  if (b.over) { finished++; totalTurns += b.turn; maxTurns = Math.max(maxTurns, b.turn); }
}
console.log(`battles finished: ${finished}/300, avg turns: ${(totalTurns / finished).toFixed(1)}, max: ${maxTurns}`);
console.log('event types seen:', [...eventTypes].sort().join(', '));
check(eventTypes.has('faint') && eventTypes.has('end') && eventTypes.has('damage'), 'core events fired');

/* mirror matches for ability coverage: every char battles every other */
for (let i = 0; i < CHARACTERS.length; i++) {
  const a = CHARACTERS[i].id, c = CHARACTERS[(i + 1) % CHARACTERS.length].id;
  const ids = [a, c, CHARACTERS[(i + 2) % CHARACTERS.length].id, CHARACTERS[(i + 3) % CHARACTERS.length].id];
  const b = new sandbox.Battle(ids, [...ids].reverse());
  let guard = 0;
  while (!b.over && guard < 400) {
    guard++;
    if (b.awaitingReplace) { b.submitReplace(b.sides.player.crew.findIndex(f => f.alive)); continue; }
    b.playTurn(b.chooseAI('player'));
  }
  check(b.over, `mirror battle for ${a} finished`);
}

/* ---- doubles (2v2, pick 4 with bench) engine ---- */
{
  function rcQuad() {
    const pool = CHARACTERS.map(c => c.id), c = [];
    for (let i = 0; i < 4; i++) c.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return c;
  }
  function doublesAI(b, sk) {
    return b.livingPositions(sk).map(pos => ({ pos, ...b.chooseAI(sk, pos) }));
  }
  let dFinished = 0, dTurns = 0, statEvt = false, twoActiveSeen = false, benchUsed = false;
  for (let i = 0; i < 200; i++) {
    const b = new sandbox.DoublesBattle(rcQuad(), rcQuad());
    if (b.livingPositions('player').length === 2 && b.livingPositions('enemy').length === 2) twoActiveSeen = true;
    let g = 0;
    while (!b.over && g < 400) {
      g++;
      if (b.awaiting) {
        // fill every owed player replacement from the bench
        for (const pos of b.awaiting.positions.slice()) {
          if (!b.awaiting) break;
          const bench = b.benchIndices('player');
          if (bench.length) { benchUsed = true; b.submitReplace(pos, bench[0]); }
        }
        if (b.awaiting) break;   // no bench left to satisfy it (shouldn't happen)
        continue;
      }
      const evs = b.playRound(doublesAI(b, 'player'));
      if (evs.some(e => e.t === 'stat')) statEvt = true;
      for (const sk of ['player', 'enemy']) for (const f of b.sides[sk].crew)
        check(f.hp >= 0 && f.hp <= f.maxHp, `doubles hp bounds: ${f.name} ${f.hp}/${f.maxHp}`);
      for (const e of evs) if (['damage', 'heal', 'faint', 'status', 'stat', 'switch'].includes(e.t))
        check(e.slot === 0 || e.slot === 1, `doubles event ${e.t} has a field position`);
    }
    check(b.over, `doubles battle ${i} finished (turns=${b.turn})`);
    if (b.over) { dFinished++; dTurns += b.turn; }
    if (b.over && b.winner !== 'draw') check(b.crewAlive(b.winner), `doubles winner ${b.winner} has a survivor`);
  }
  check(twoActiveSeen, 'doubles starts with two active per side');
  check(statEvt, 'doubles emits stat-stage events');
  check(benchUsed, 'doubles uses the bench (replacements happen)');
  console.log(`\ndoubles: ${dFinished}/200 finished, avg turns ${(dTurns / dFinished).toFixed(1)}`);
}

/* ---- 2v2 move mechanics (deterministic: every roll connects) ---- */
{
  const CB = sandbox.CHAR_BY_ID, DB = sandbox.DoublesBattle;
  const find = (id, pred) => CB[id].moves.find(pred);
  const R = Math.random; Math.random = () => 0;
  try {
    // spread hits BOTH foes
    const sp = find('enel', m => m.fx && m.fx.spread);
    const b = new DB(['enel', 'zoro'], ['nami', 'usopp']);
    const e0 = b.fighterAt('enemy', 0), e1 = b.fighterAt('enemy', 1);
    const h0 = e0.hp, h1 = e1.hp;
    b.resolveMove('player', 0, sp, 'enemy', 0);
    check(e0.hp < h0 && e1.hp < h1, 'spread move damages BOTH foes');

    // team rally raises both allies
    const tw = find('nami', m => m.fx && m.fx.team);
    const b2 = new DB(['nami', 'zoro'], ['usopp', 'buggy']);
    b2.resolveMove('player', 0, tw, 'enemy', 0);
    check(b2.fighterAt('player', 0).stages.spd > 0 && b2.fighterAt('player', 1).stages.spd > 0, 'team buff raises BOTH allies');

    // ally heal restores the partner, not the user
    const ch = find('chopper', m => m.fx && m.fx.allyHeal);
    const b3 = new DB(['chopper', 'zoro'], ['usopp', 'buggy']);
    b3.fighterAt('player', 1).hp = 40;
    b3.resolveMove('player', 0, ch, 'enemy', 0);
    check(b3.fighterAt('player', 1).hp > 40, 'ally heal restores partner HP');

    // redirect marks the redirector as the draw
    const jr = find('jinbe', m => m.fx && m.fx.redirect);
    const b4 = new DB(['jinbe', 'nami'], ['zoro', 'usopp']);
    b4.resolveMove('player', 0, jr, 'enemy', 0);
    check(b4.sides.player.redirect === 0, 'redirect flag set on the redirector');
    // and a single-target enemy attack is pulled onto the redirector in a full round
    const b5 = new DB(['jinbe', 'nami'], ['zoro', 'usopp']);
    const namiHp = b5.fighterAt('player', 1).hp;
    b5.playRound([{ pos: 0, type: 'move', idx: jr === b5.fighterAt('player', 0).moves[0] ? 0 : b5.fighterAt('player', 0).moves.findIndex(m => m.fx && m.fx.redirect), target: null },
                  { pos: 1, type: 'move', idx: 0, target: { side: 'enemy', pos: 0 } }]);
    check(b5.fighterAt('player', 1).hp === namiHp || !b5.fighterAt('player', 1), 'redirect shields the partner from single-target hits');

    // wide guard turns aside a spread attack
    const wg = find('franky', m => m.fx && m.fx.wideGuard);
    const sp2 = find('enel', m => m.fx && m.fx.spread);
    const b6 = new DB(['franky', 'zoro'], ['enel', 'usopp']);
    b6.sides.enemy.wideGuard = true;        // simulate the guard being up
    const fh0 = b6.fighterAt('enemy', 0).hp, fh1 = b6.fighterAt('enemy', 1).hp;
    b6.resolveMove('player', 0, sp2, 'enemy', 0);   // a spread move into a wide guard
    check(b6.fighterAt('enemy', 0).hp === fh0 && b6.fighterAt('enemy', 1).hp === fh1, 'wide guard blocks a spread attack');
    check(wg && wg.fx.wideGuard, 'a fighter owns a wide-guard move');

    // trick room reverses the speed order (slower acts first)
    const tr = find('bigmom', m => m.fx && m.fx.trickRoom);
    check(tr, 'a fighter owns a Trick Room move');
    const b7 = new sandbox.Battle(['bigmom'], ['hancock']);   // Big Mom slow, Hancock fast (no priority moves)
    b7.trickRoom = 5;
    // bigmom (slow) should now out-speed hancock (fast) since neither has move priority
    const order = [];
    const origUse = b7.useMove.bind(b7);
    b7.useMove = (sk, mv) => { order.push(sk); origUse(sk, mv); };
    b7.playTurn({ type: 'move', idx: 0 });
    check(order[0] === 'player', 'Trick Room makes the slower fighter act first');

    // category split: a physical move scales off Defense, a special move off Sp.Def
    const pf = CB['zoro'];   // physical attacker
    check(pf.moves[0].cat === 'physical', 'a Slash move is physical');
    check(CB['ace'].moves[0].cat === 'special', 'a Flame move is special');
  } finally { Math.random = R; }
}

/* ---- Awakenings (Mega-style, once per battle) ---- */
{
  const CB = sandbox.CHAR_BY_ID;
  const ids = ['luffy', 'zoro', 'sanji', 'law', 'doflamingo', 'kaido', 'crocodile', 'shanks', 'roger', 'rocks', 'imu'];
  check(ids.every(id => CB[id].awaken && CB[id].awaken.moves && CB[id].awaken.moves.length === 4), 'eleven fighters have a 4-move Awakening');
  // every awakening is well-formed: valid types, a damage class on each move, sensible stat boosts
  for (const id of ids) {
    const aw = CB[id].awaken;
    check(aw.types.every(t => sandbox.TYPES[t]), `${id} awakening: valid types`);
    check(aw.moves.every(m => m.cat === 'physical' || m.cat === 'special'), `${id} awakening: moves labelled`);
    check(aw.stats && Object.values(aw.stats).reduce((s, v) => s + v, 0) > 0, `${id} awakening: net stat gain`);
  }
  // Roger's awakening keeps his signature pierce ability (no override)
  check(!CB['roger'].awaken.ability, 'Roger awakening keeps Pirate King Haki');

  // single battle: Luffy awakens and changes stats / ability / moveset
  const b = new sandbox.Battle(['luffy', 'zoro'], ['buggy', 'nami']);
  const lf = b.active('player');
  const atk0 = lf.baseAtk, spd0 = lf.baseSpd;
  check(b.canAwaken('player'), 'Luffy can awaken at start');
  const evs = b.playTurn({ type: 'move', idx: 0, awaken: true });
  check(evs.some(e => e.t === 'awaken'), 'an awaken event fires');
  check(lf.awakened && b.sides.player.awakened, 'fighter + side awaken flags set');
  check(lf.baseAtk > atk0 && lf.baseSpd > spd0, 'Awakening boosts stats');
  check(lf.ability === CB['luffy'].awaken.ability, 'Awakening overrides the ability');
  check(lf.moves[0].name === CB['luffy'].awaken.moves[0].name, 'Awakening swaps in the new moveset');
  check(!b.canAwaken('player'), 'a side may only awaken once per battle');

  // a different fighter on the same side cannot awaken after the first
  if (b.sides.player.crew[1].alive) { b.doSwitch('player', 1); check(!b.canAwaken('player'), 'second fighter blocked from awakening same battle'); }

  // type override actually changes effectiveness: Kaido base BEAST/FLAME -> BEAST/TREMOR
  const kb = new sandbox.Battle(['kaido'], ['buggy']);
  const k = kb.active('player');
  const t0 = (k.types || k.def.types).slice();
  kb.applyAwaken('player');
  check((k.types || []).includes('TREMOR'), 'Kaido Awakening adds the Tremor type');
  check(t0.join() !== (k.types || []).join(), 'Awakening changed the type line');

  // doubles: awakening works per fighter and is one-per-side
  const d = new sandbox.DoublesBattle(['sanji', 'zoro'], ['buggy', 'nami']);
  check(d.canAwaken('player', 0), 'doubles fighter can awaken');
  check(d.applyAwaken('player', 0), 'doubles awaken applies');
  check(!d.canAwaken('player', 1), 'doubles side limited to one awakening');
}

/* ---- 2v2 balance audit: no runaway, no dead weight ---- */
{
  const DB = sandbox.DoublesBattle, dids = CHARACTERS.map(c => c.id);
  const dwins = {}, dgames = {}; dids.forEach(id => { dwins[id] = 0; dgames[id] = 0; });
  function dteam() { const p = [...dids], t = []; for (let i = 0; i < 4; i++) t.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]); return t; }
  for (let i = 0; i < 2500; i++) {
    const A = dteam(), Bt = dteam(), b = new DB(A, Bt);
    let g = 0;
    while (!b.over && g < 300) {
      g++;
      if (b.awaiting) { for (const pos of b.awaiting.positions.slice()) { if (!b.awaiting) break; const bn = b.benchIndices('player'); if (bn.length) b.submitReplace(pos, bn[0]); } if (b.awaiting) break; continue; }
      b.playRound(b.livingPositions('player').map(pos => ({ pos, ...b.chooseAI('player', pos) })));
    }
    const w = b.winner === 'player' ? A : b.winner === 'enemy' ? Bt : null;
    for (const id of A) dgames[id]++; for (const id of Bt) dgames[id]++;
    if (w) for (const id of w) dwins[id]++;
  }
  const dwr = dids.map(id => dwins[id] / Math.max(1, dgames[id])).sort((a, b) => b - a);
  console.log(`2v2 meta: top ${(dwr[0] * 100).toFixed(0)}%  bottom ${(dwr[dwr.length - 1] * 100).toFixed(0)}%`);
  check(dwr[0] <= 0.82, `2v2 has no runaway pick (top ${(dwr[0] * 100).toFixed(0)}%)`);
  check(dwr[dwr.length - 1] >= 0.27, `2v2 has no dead weight (bottom ${(dwr[dwr.length - 1] * 100).toFixed(0)}%)`);
}

/* ---- stat stages persist across a switch (single battle) ---- */
{
  const b = new sandbox.Battle(['rocks', 'zoro'], ['buggy', 'nami']);
  b.changeStage('player', 'atk', 2);
  check(b.active('player').stages.atk === 2, 'buff applied');
  b.doSwitch('player', 1);
  b.doSwitch('player', 0);
  check(b.active('player').stages.atk === 2, 'stat buff persists across switch out and back');
}

/* ---- balance audit: 1v1 round-robin win-rate matrix ---- */
function duel(idA, idB) {
  const b = new sandbox.Battle([idA], [idB]);
  let guard = 0;
  while (!b.over && guard < 200) {
    guard++;
    b.playTurn(b.chooseAI('player'));
  }
  return b.winner === 'player' ? 1 : 0;
}
const REPS = 6;
const wins = Object.fromEntries(CHARACTERS.map(c => [c.id, 0]));
const games = Object.fromEntries(CHARACTERS.map(c => [c.id, 0]));
for (let i = 0; i < CHARACTERS.length; i++) {
  for (let j = i + 1; j < CHARACTERS.length; j++) {
    const a = CHARACTERS[i].id, c = CHARACTERS[j].id;
    for (let r = 0; r < REPS; r++) {
      const w = r % 2 === 0 ? duel(a, c) : 1 - duel(c, a);
      wins[a] += w; wins[c] += 1 - w;
      games[a]++; games[c]++;
    }
  }
}
const table = CHARACTERS.map(c => ({ id: c.id, bst: bst(c), wr: wins[c.id] / games[c.id] }))
  .sort((x, y) => y.wr - x.wr);
console.log('\n1v1 win rates (BST | WR):');
table.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.id.padEnd(12)} ${String(r.bst).padStart(3)} | ${(r.wr * 100).toFixed(0)}%`));

const rank = id => table.findIndex(r => r.id === id);
// Awakening boosts seven fighters, so non-awakeners sit a little lower now
check(rank('roger') < 10, `Roger ranks top-10 (got #${rank('roger') + 1})`);
check(rank('rocks') < 13, `Rocks ranks top-13 (got #${rank('rocks') + 1})`);
check(rank('imu') < 12, `Imu ranks top-12 (got #${rank('imu') + 1})`);
check(table.find(r => r.id === 'usopp').wr < 0.5, 'Usopp below 50% in raw 1v1s');
check(table.find(r => r.id === 'buggy').wr < 0.5, 'Buggy below 50% in raw 1v1s');
check(table[0].wr <= 0.97, `no one is unbeatable (top: ${table[0].id} ${(table[0].wr * 100).toFixed(0)}%)`);
check(table[table.length - 1].wr >= 0.03, 'no one is hopeless');

/* ---- tournament mode ---- */
const t0 = Date.now();
const tState = sandbox.createTournament(10);
let tGuard = 0;
while (!sandbox.runTournamentChunk(tState, 50) && tGuard < 200) tGuard++;
const tMs = Date.now() - t0;
check(tState.done, 'tournament completes');
const tStats = sandbox.computeTournamentStats(tState);
check(tStats.table.length === CHARACTERS.length, 'tournament ranks every fighter');
const totalWins = tStats.table.reduce((s, r) => s + r.wins, 0);
check(totalWins === tState.pairs.length * tState.reps, 'every duel produced exactly one winner');
check(tStats.table.every(r => r.wins + r.losses === (CHARACTERS.length - 1) * tState.reps), 'each fighter played a full schedule');
for (const [a, b] of tState.pairs) {
  if (tState.h2h[a][b] + tState.h2h[b][a] !== tState.reps) { check(false, `h2h symmetric ${a}/${b}`); break; }
}
check(tStats.deadlock && tStats.marathon && tStats.blitz, 'highlight matches computed');
check(tStats.rivalries.length === sandbox.RIVALRIES.length && tStats.rivalries.every(r => r.aWins + r.bWins === tState.reps), 'rivalry records resolved');
console.log(`\ntournament: ${tState.pairs.length * tState.reps} duels in ${tMs}ms — champion: ${tStats.table[0].id} (${tStats.table[0].wins}W-${tStats.table[0].losses}L)`);
if (tStats.upset) console.log(`  upset: ${tStats.upset.a} beat ${tStats.upset.b} ${tStats.upset.aWins}-${tStats.upset.bWins} (BST gap ${tStats.upset.gap})`);
console.log(`  deadlock: ${tStats.deadlock.a} vs ${tStats.deadlock.b} ${tStats.deadlock.aWins}-${tStats.deadlock.bWins}`);
console.log(`  marathon: ${tStats.marathon.a} vs ${tStats.marathon.b} avg ${tStats.marathon.avgTurns.toFixed(1)} turns`);

/* ---- level scaling ---- */
{
  const base = sandbox.CHAR_BY_ID['luffy'].stats;
  const at50 = sandbox.realStats(base, 50), plain = sandbox.realStats(base);
  check(JSON.stringify(at50) === JSON.stringify(plain), 'realStats defaults to level 50');
  check(at50.hp === base.hp + 110 && at50.atk === base.atk + 5, 'level 50 reproduces the original stat line');
  const at20 = sandbox.realStats(base, 20);
  check(at20.atk < at50.atk && at20.hp < at50.hp && at20.spd < at50.spd, 'lower level means lower stats');
  const lowF = new sandbox.Fighter(sandbox.CHAR_BY_ID['luffy'], null, 12);
  const hiF = new sandbox.Fighter(sandbox.CHAR_BY_ID['luffy'], null, 50);
  check(lowF.level === 12 && hiF.level === 50, 'fighters carry their level');
  // a level gap should decide fights
  let lowWins = 0;
  for (let i = 0; i < 60; i++) {
    const b = new sandbox.Battle(['luffy'], ['luffy'], { playerLevels: 15, enemyLevels: 30 });
    let g = 0; while (!b.over && g < 200) { g++; b.playTurn(b.chooseAI('player')); }
    if (b.winner === 'player') lowWins++;
  }
  check(lowWins <= 12, `a 15-level deficit usually loses (won ${lowWins}/60)`);
}

/* ---- story data integrity ---- */
{
  const { STORY, STORY_START_CREW } = sandbox;
  check(STORY.length >= 10, `campaign has chapters (got ${STORY.length})`);
  const ids = new Set();
  let prevLevel = 0;
  const owned = new Set(STORY_START_CREW);
  for (const ch of STORY) {
    check(!ids.has(ch.id), `chapter id ${ch.id} unique`); ids.add(ch.id);
    check(ch.name && ch.blurb && ch.flag && ch.sea, `${ch.id}: has presentation copy`);
    check(ch.size >= 1 && ch.size <= sandbox.CREW_SIZE, `${ch.id}: legal party size`);
    check(ch.mode === 'single' || ch.mode === 'doubles', `${ch.id}: valid mode`);
    check(ch.foes.length >= 1 && ch.foes.every(f => sandbox.CHAR_BY_ID[f]), `${ch.id}: foes are real fighters`);
    check((ch.unlock || []).every(u => sandbox.CHAR_BY_ID[u]), `${ch.id}: unlocks are real fighters`);
    check(ch.berries > 0, `${ch.id}: pays berries`);
    check(ch.level > prevLevel, `${ch.id}: difficulty rises (Lv ${ch.level} after ${prevLevel})`);
    prevLevel = ch.level;
    // you can always field a full party from what you own by now
    check(owned.size >= ch.size, `${ch.id}: party of ${ch.size} is fieldable (own ${owned.size})`);
    for (const u of (ch.unlock || [])) owned.add(u);
  }
  check(owned.size === CHARACTERS.length, `every fighter is recruitable (${owned.size}/${CHARACTERS.length})`);
}

/* ---- progression maths ---- */
{
  const st = sandbox.newStoryState();
  check(st.roster.length === 1 && st.berries === 0, 'a new voyage starts with one fighter and no berries');
  check(sandbox.isChapterUnlocked(st, 0) && !sandbox.isChapterUnlocked(st, 1), 'only the first island is open at the start');
  const ch = sandbox.STORY[0];
  const res = sandbox.resolveChapter(st, ch, true, ['luffy']);
  check(res.won && res.first && res.berries === ch.berries, 'first clear pays full berries');
  check(sandbox.levelOf(st, 'luffy') > sandbox.STORY_START_LEVEL, 'winning levels the party');
  check(res.recruited.length > 0 && st.roster.length === 2, 'the island recruit joins the crew');
  check(sandbox.isChapterUnlocked(st, 1), 'clearing an island opens the next');
  const repeat = sandbox.resolveChapter(st, ch, true, ['luffy']);
  check(repeat.berries < ch.berries && !repeat.first, 'replaying an island pays less');
  // losing still pays a consolation share, so a stuck player can grind
  check(sandbox.chapterXp(ch, false) > 0 && sandbox.chapterXp(ch, false) < sandbox.chapterXp(ch, true), 'a loss pays reduced XP');
  // training spends berries for a level
  const before = sandbox.levelOf(st, 'luffy');
  st.berries = 100000;
  check(sandbox.trainFighter(st, 'luffy').ok && sandbox.levelOf(st, 'luffy') === before + 1, 'training buys a level');
  const broke = sandbox.newStoryState();
  check(!sandbox.trainFighter(broke, 'luffy').ok, 'training needs berries');
  // XP is capped at the level ceiling
  sandbox.grantXp(st, 'luffy', 10 ** 7);
  check(sandbox.levelOf(st, 'luffy') === sandbox.STORY_MAX_LEVEL, 'levels stop at the cap');
}

/* ---- the campaign is actually beatable ---- */
{
  const S = sandbox;
  const bstOf = c => c.stats.hp + c.stats.atk + c.stats.def + c.stats.satk + c.stats.sdef + c.stats.spd;
  // model a sensible player: strongest fighters, and an Awakening is worth
  // far more than the raw stat line suggests
  const power = id => bstOf(S.CHAR_BY_ID[id]) + (S.CHAR_BY_ID[id].awaken ? 90 : 0);
  const pickParty = (st, size) => [...st.roster]
    .sort((a, b) => (power(b) - power(a)) || (S.levelOf(st, b) - S.levelOf(st, a)))
    .slice(0, size);
  function fight(ch, party, st) {
    const opts = { playerLevels: party.map(id => S.levelOf(st, id)), enemyLevels: ch.level };
    if (ch.mode === 'doubles') {
      const b = new S.DoublesBattle(party, ch.foes, opts); let g = 0;
      while (!b.over && g < 400) {
        g++;
        if (b.awaiting) { for (const p of b.awaiting.positions.slice()) { if (!b.awaiting) break; const bn = b.benchIndices('player'); if (bn.length) b.submitReplace(p, bn[0]); } if (b.awaiting) break; continue; }
        b.playRound(b.livingPositions('player').map(p => ({ pos: p, ...b.chooseAI('player', p) })));
      }
      return b.winner === 'player';
    }
    const b = new S.Battle(party, ch.foes, opts); let g = 0;
    while (!b.over && g < 400) {
      g++;
      if (b.awaitingReplace) { b.submitReplace(b.sides.player.crew.findIndex(f => f.alive)); continue; }
      b.playTurn(b.chooseAI('player'));
    }
    return b.winner === 'player';
  }
  let completed = 0, totalTries = 0;
  const RUNS = 5, MAX_TRIES = 40;
  for (let r = 0; r < RUNS; r++) {
    const st = S.newStoryState();
    let ok = true;
    for (const ch of S.STORY) {
      let tries = 0, won = false;
      while (!won && tries < MAX_TRIES) {
        tries++;
        // spend berries at the tavern before a hard island, like a real player
        const target = Math.min(S.STORY_MAX_LEVEL, ch.level + 4 + 3 * (tries - 1));
        for (let guard = 0; guard < 200; guard++) {
          const p = pickParty(st, ch.size);
          const weakest = [...p].sort((a, b) => S.levelOf(st, a) - S.levelOf(st, b))[0];
          if (S.levelOf(st, weakest) >= target) break;
          if (!S.trainFighter(st, weakest).ok) break;
        }
        const party = pickParty(st, ch.size);
        won = fight(ch, party, st);
        S.resolveChapter(st, ch, won, party);
      }
      totalTries += tries;
      if (!won) { ok = false; check(false, `campaign stalled at ${ch.name}`); break; }
    }
    if (ok) completed++;
  }
  console.log(`\nstory: ${completed}/${RUNS} campaigns completed, ${(totalTries / RUNS).toFixed(1)} avg attempts across ${sandbox.STORY.length} chapters`);
  check(completed === RUNS, `every simulated campaign is winnable (${completed}/${RUNS})`);
  check(totalTries / RUNS < 70, 'the difficulty curve does not demand excessive grinding');
}

/* ---- uncharted waters: sea + encounter data ---- */
{
  const { SEAS, VOYAGE_KINDS, SEA_BY_ID } = sandbox;
  check(SEAS.length >= 4, `the world has seas (got ${SEAS.length})`);
  const seen = new Set();
  let prevHi = 0;
  SEAS.forEach((sea, i) => {
    check(!seen.has(sea.id), `sea ${sea.id} unique`); seen.add(sea.id);
    check(sea.name && sea.flag && sea.blurb && sea.portName, `${sea.id}: has presentation copy`);
    check(!sea.gate || sandbox.STORY_BY_ID[sea.gate], `${sea.id}: gate is a real chapter`);
    check(sea.lo >= 1 && sea.hi > sea.lo, `${sea.id}: sane level band`);
    check(sea.lo > prevHi - 12, `${sea.id}: bands step up rather than jump`);
    check(sea.hi > prevHi, `${sea.id}: deeper water is deadlier (hi ${sea.hi} after ${prevHi})`);
    prevHi = sea.hi;
    check(sea.cols >= 5, `${sea.id}: enough islands for a voyage`);
    check(sea.portBerries > 0, `${sea.id}: the harbour pays a bonus`);
    check(sea.pool.length >= 5 && sea.pool.every(id => sandbox.CHAR_BY_ID[id]), `${sea.id}: spawn pool is real fighters`);
    check(sea.marines.every(id => sandbox.CHAR_BY_ID[id]), `${sea.id}: marines are real fighters`);
    check(sea.crews.length && sea.crews.every(c => PRESET_CREWS.some(p => p.id === c)), `${sea.id}: rival crews exist`);
    check(sea.patrolSize >= 2, `${sea.id}: a patrol is more than one`);
    // the sea a chapter opens must not be wildly beyond the crew that opened it
    if (sea.gate) check(sea.lo <= sandbox.STORY_BY_ID[sea.gate].level + 2, `${sea.id}: opens at a level the gating island prepares you for`);
  });
  check(SEAS[0].gate === null, 'the first sea needs no key');

  const kinds = new Set();
  for (const k of VOYAGE_KINDS) {
    check(!kinds.has(k.id), `kind ${k.id} unique`); kinds.add(k.id);
    check(k.name && k.flag && k.blurb, `${k.id}: has presentation copy`);
    check(k.w.length === SEAS.length, `${k.id}: a weight for every sea`);
    check(k.w.some(w => w > 0), `${k.id}: is reachable somewhere`);
    check(k.depth.length === 2 && k.depth.every(d => d > 0), `${k.id}: has a depth curve`);
    check(k.fight === null || ['duel', 'single', 'doubles'].indexOf(k.fight) >= 0, `${k.id}: valid fight shape`);
  }
  check(VOYAGE_KINDS.some(k => k.fight === 'doubles'), 'the sea can throw a 2v2 at you');
  check(VOYAGE_KINDS.some(k => k.fight === null), 'not every island is a fight');
  check(!!SEA_BY_ID['east-blue'], 'seas are indexed by id');
}

/* ---- chart generation is pure, connected and fair ---- */
{
  const S = sandbox;
  const summarise = ch => ch.nodes.map(n => [n.id, n.kind, n.level, (n.foes || []).join('/'), n.to.join('|')].join(',')).join(';');
  check(summarise(S.generateChart('paradise', 42)) === summarise(S.generateChart('paradise', 42)), 'the same seed always draws the same chart');
  check(summarise(S.generateChart('paradise', 42)) !== summarise(S.generateChart('paradise', 43)), 'a different seed draws a different chart');

  let charts = 0, orphans = 0, deadEnds = 0, badFoes = 0, harshOpeners = 0;
  const kindsSeen = new Set();
  for (const sea of S.SEAS) {
    for (let seed = 0; seed < 60; seed++) {
      const ch = S.generateChart(sea.id, seed);
      charts++;
      // every island must be reachable from the start, and lead somewhere
      const reached = new Set(['start']);
      const queue = ['start'];
      while (queue.length) {
        for (const t of ch.byId[queue.shift()].to) if (!reached.has(t)) { reached.add(t); queue.push(t); }
      }
      if (!reached.has('port')) orphans++;
      for (const n of ch.nodes) {
        if (!reached.has(n.id)) orphans++;
        if (n.id !== 'port' && !n.to.length) deadEnds++;
        if (n.kind === 'start' || n.kind === 'port') continue;
        kindsSeen.add(n.kind);
        if (n.foes.some(f => !S.CHAR_BY_ID[f])) badFoes++;
        if (n.fight && !n.foes.length) badFoes++;
        if (n.col === 0 && ['patrol', 'rival', 'bounty', 'storm'].indexOf(n.kind) >= 0) harshOpeners++;
        if (n.x <= 0 || n.x >= 1 || n.y <= 0 || n.y >= 1) badFoes++;   // must sit inside the chart box
      }
    }
  }
  check(orphans === 0, `every island on every chart is reachable (${orphans} orphans in ${charts} charts)`);
  check(deadEnds === 0, `no island is a dead end (${deadEnds})`);
  check(badFoes === 0, `every encounter is well-formed (${badFoes} bad)`);
  check(harshOpeners === 0, `the first island is never a death sentence (${harshOpeners})`);
  check(kindsSeen.size === S.VOYAGE_KINDS.length, `every encounter kind actually appears (${kindsSeen.size}/${S.VOYAGE_KINDS.length})`);
  console.log(`charts: ${charts} generated, ${kindsSeen.size} encounter kinds in play`);
}

/* ---- the sea's economy hangs off the campaign's ---- */
{
  const S = sandbox;
  const st = S.newStoryState();
  const w = S.worldEnsure(st);
  check(w && w.run === null && w.voyages === 0, 'a fresh save has an empty sea log');
  check(S.seaUnlocked(st, S.SEA_BY_ID['east-blue']), 'East Blue is open from the start');
  check(!S.seaUnlocked(st, S.SEA_BY_ID['new-world']), 'the New World stays shut until Marineford');
  st.cleared.push('marineford');
  check(S.seaUnlocked(st, S.SEA_BY_ID['new-world']), 'clearing the gating island opens the sea');

  // payouts are multiples of xpToNext, so an island is worth the same slice of
  // a level at 6 as it is at 62 — the same anchor the campaign is tuned to
  const node = { kind: 'patrol', xpMul: 0.7, berryMul: 0.4, level: 20, depth: 0.5, fight: 'single', foes: ['nami'] };
  for (const lv of [6, 20, 45, 70]) {
    const ratio = S.nodeXp(node, lv) / sandbox.xpToNext(lv);
    check(Math.abs(ratio - 0.7) < 0.01, `payouts stay level-neutral (Lv ${lv} → ${ratio.toFixed(3)})`);
  }
  check(S.nodeXp(node, 30) < sandbox.chapterXp(sandbox.STORY[6], true), 'one island is worth less than a whole chapter');
  check(S.nodeBerries(node, 30) > 0, 'a patrol pays coin');

  // banking: everything at port, half for turning back, a quarter and no coin for a wipe
  const mk = () => {
    const s = S.newStoryState();
    S.recruit(s, 'zoro', 10);
    const run = S.newVoyage(s, 'east-blue', ['luffy', 'zoro'], 5);
    run.legs = 4;
    run.hold.xp = 1000; run.hold.berries = 800;
    return { s, run };
  };
  const atPort = mk(); const portRes = S.voyageBank(atPort.s, atPort.run, 'port');
  const back = mk(); const backRes = S.voyageBank(back.s, back.run, 'turnback');
  const lost = mk(); const lostRes = S.voyageBank(lost.s, lost.run, 'wipe');
  check(portRes.xpEach === 1000 && backRes.xpEach === 500 && lostRes.xpEach === 250, 'the hold pays out by how the voyage ended');
  check(portRes.berries > 800 && portRes.bonus > 0, 'making port adds a harbour bonus');
  check(backRes.berries === 400 && lostRes.berries === 0, 'turning back keeps half the coin; a wipe keeps none');
  check(atPort.s.berries === portRes.berries, 'banked berries land in the campaign purse');
  check(S.levelOf(atPort.s, 'luffy') > S.STORY_START_LEVEL, 'banked XP levels the landing party');
  check(S.worldEnsure(atPort.s).made['east-blue'] === 1, 'the sea log remembers a successful voyage');
  check(S.worldEnsure(atPort.s).run === null, 'banking closes the voyage');

  // recruits are the one thing the sea never takes back
  const wiped = mk();
  wiped.run.hold.recruits.push({ id: 'nami', level: 12 });
  const wipedRes = S.voyageBank(wiped.s, wiped.run, 'wipe');
  check(wipedRes.recruited.indexOf('nami') >= 0 && wiped.s.roster.indexOf('nami') >= 0, 'a castaway joins even when the voyage is lost');
}

/* ---- carried damage, rations and save migration ---- */
{
  const S = sandbox;
  const st = S.newStoryState();
  S.recruit(st, 'zoro', 10);
  const run = S.newVoyage(st, 'east-blue', ['luffy', 'zoro'], 1);
  check(S.voyageStanding(run).length === 2 && !S.voyageDown(run).length, 'a voyage sets out at full health');

  S.voyageSync(run, [{ id: 'luffy', hp: 0.4, status: 'burn' }]);
  check(run.hp['luffy'] === 0.4 && run.status['luffy'] === 'burn', 'damage and status carry off the battlefield');
  check(run.hp['zoro'] === 1, 'a fighter who sat out is untouched');

  const stores = run.rations;
  check(S.useRation(run) && run.rations === stores - 1, 'a ration is spent when it is eaten');
  check(run.hp['luffy'] > 0.4 && run.status['luffy'] === null, 'a ration heals and cures');

  run.rations = 0;
  check(!S.useRation(run), 'you cannot eat what you do not have');
  check(!S.voyageCutAndRun(run), 'breaking off needs a ration too');

  // a squall can end a voyage on its own — that is what makes routing matter
  const stormy = S.newVoyage(st, 'east-blue', ['luffy'], 1);
  stormy.hp['luffy'] = 0.05;
  const storm = { kind: 'storm', fight: null, level: 10, depth: 1, xpMul: 0.15, berryMul: 0, foes: [] };
  S.voyageResolveEvent(st, stormy, storm, () => 0.5);
  check(stormy.over === 'wipe', 'a squall can take your last fighter');

  // an anchorage is the relief you route toward
  const rest = S.newVoyage(st, 'east-blue', ['luffy', 'zoro'], 1);
  rest.hp['luffy'] = 0.2; rest.status['luffy'] = 'poison';
  const storesBefore = rest.rations;
  S.voyageResolveEvent(st, rest, { kind: 'anchorage', fight: null, level: 10, depth: 0, xpMul: 0, berryMul: 0, foes: [] }, () => 0.5);
  check(rest.hp['luffy'] > 0.2 && rest.status['luffy'] === null, 'an anchorage patches the crew up');
  check(rest.rations === storesBefore + 1, 'an anchorage resupplies');

  // migration: an old save has no world at all, and a broken one must not throw
  const old = S.newStoryState();
  delete old.world;
  check(S.worldEnsure(old) && old.world.seed >= 1, 'a save from before the open sea gains one');
  const broken = S.newStoryState();
  broken.world = { run: 'not an object', best: 7, made: null, voyages: 'many' };
  const fixed = S.worldEnsure(broken);
  check(fixed.run === null && typeof fixed.best === 'object' && fixed.voyages === 0, 'a corrupt world block is repaired, not fatal');
  const finished = S.newStoryState();
  finished.world = { run: { party: ['luffy'], over: 'port' } };
  check(S.worldEnsure(finished).run === null, 'a voyage that already ended is not resumed');
}

/* ---- a voyage is actually sailable ---- */
{
  const S = sandbox;
  const power = id => S.worldBst(id) + (S.CHAR_BY_ID[id].awaken ? 90 : 0);

  const graft = (battle, run, ids) => battle.sides.player.crew.forEach((f, i) => {
    f.hp = Math.max(1, Math.round(f.maxHp * run.hp[ids[i]]));
    f.status = run.status[ids[i]] || null;
  });
  const readBack = (battle, ids) => battle.sides.player.crew.map((f, i) => ({
    id: ids[i], hp: f.alive ? f.hp / f.maxHp : 0, status: f.status,
  }));

  function fight(st, run, node, ids) {
    const opts = { playerLevels: ids.map(id => S.levelOf(st, id)), enemyLevels: S.voyageFoeLevel(run, node) };
    if (node.fight === 'doubles' && ids.length >= 2) {
      const b = new S.DoublesBattle(ids, node.foes, opts);
      graft(b, run, ids);
      let g = 0;
      while (!b.over && g < 400) {
        g++;
        if (b.awaiting) {
          for (const p of b.awaiting.positions.slice()) {
            if (!b.awaiting) break;
            const bn = b.benchIndices('player');
            if (bn.length) b.submitReplace(p, bn[0]);
          }
          if (b.awaiting) break;
          continue;
        }
        b.playRound(b.livingPositions('player').map(p => ({ pos: p, ...b.chooseAI('player', p) })));
      }
      return { won: b.winner === 'player' && b.sides.player.crew.some(f => f.alive), entries: readBack(b, ids) };
    }
    const b = new S.Battle(ids, node.foes, opts);
    graft(b, run, ids);
    let g = 0;
    while (!b.over && g < 300) {
      g++;
      if (b.awaitingReplace) {
        const idx = b.sides.player.crew.findIndex(f => f.alive);
        if (idx < 0) break;
        b.submitReplace(idx);
        continue;
      }
      b.playTurn(b.chooseAI('player'));
    }
    return { won: b.winner === 'player' && b.sides.player.crew.some(f => f.alive), entries: readBack(b, ids) };
  }

  /* Send whoever the type chart likes best — the mode's signature decision. */
  function pickDuelist(st, run, node, standing) {
    let best = standing[0], bestScore = -Infinity;
    for (const id of standing) {
      const probe = new S.Battle([id], node.foes, { playerLevels: [S.levelOf(st, id)], enemyLevels: S.voyageFoeLevel(run, node) });
      const me = probe.sides.player.crew[0];
      me.hp = Math.max(1, Math.round(me.maxHp * run.hp[id]));
      const sc = probe.matchupScore(me, probe.sides.enemy.crew[0]);
      if (sc > bestScore) { bestScore = sc; best = id; }
    }
    return best;
  }

  function sail(st, seaId, opts) {
    const o = opts || {};
    const party = [...st.roster].sort((a, b) => power(b) - power(a)).slice(0, S.VOYAGE_PARTY_MAX);
    const seed = Math.floor(Math.random() * 1e9);
    const chart = S.generateChart(seaId, seed);
    const run = S.newVoyage(st, seaId, party, seed);
    const health = () => run.party.reduce((a, id) => a + run.hp[id], 0) / run.party.length;

    for (let guard = 0; guard < 40 && !run.over; guard++) {
      const routes = S.chartRoutes(chart, run.at);
      if (!routes.length) break;
      if (health() < 0.4 && run.legs >= 2) return S.voyageBank(st, run, 'turnback');
      // hurt crews take the calmest water; healthy ones chase the payout
      const scored = routes.map(n => ({
        n, threat: S.voyageThreat(st, run, n),
        pay: S.nodeXp(n, S.voyageFoeLevel(run, n)) + S.nodeBerries(n, S.voyageFoeLevel(run, n)),
      }));
      scored.sort((a, b) => health() < 0.6 ? (a.threat - b.threat) || (b.pay - a.pay) : (b.pay - a.pay) || (a.threat - b.threat));
      const node = S.voyageSail(chart, run, scored[0].n.id);
      if (node.kind === 'port') return S.voyageBank(st, run, 'port');
      if (run.rations > 0 && health() < 0.45) S.useRation(run);
      if (!node.fight) { S.voyageResolveEvent(st, run, node, Math.random); continue; }
      const standing = S.voyageStanding(run);
      if (!standing.length) break;
      const ids = node.fight === 'duel'
        ? [o.noPick ? standing[0] : pickDuelist(st, run, node, standing)]
        : standing;
      const res = fight(st, run, node, ids);
      S.voyageResolveBattle(st, run, node, res.won, res.entries);
    }
    return S.voyageBank(st, run, run.over || 'wipe');
  }

  function saveAfter(chapters, level) {
    const st = S.newStoryState();
    for (let i = 0; i < chapters; i++) {
      st.cleared.push(S.STORY[i].id);
      for (const u of (S.STORY[i].unlock || [])) S.recruit(st, u, S.STORY[i].level + 2);
    }
    for (const id of st.roster) st.level[id] = level;
    st.berries = 0;
    return st;
  }

  const RUNS = 14;
  const report = [];
  for (const sc of [{ sea: 'east-blue', ch: 2, lv: 12 }, { sea: 'paradise', ch: 6, lv: 28 }]) {
    const tally = { port: 0, turnback: 0, wipe: 0 };
    let berries = 0, xp = 0;
    for (let i = 0; i < RUNS; i++) {
      const st = saveAfter(sc.ch, sc.lv);
      const res = sail(st, sc.sea);
      tally[res.how]++;
      berries += res.berries; xp += res.xpEach;
      check(st.berries === res.berries, `${sc.sea}: the purse matches the ledger`);
      check(res.legs >= 1, `${sc.sea}: a voyage covers ground`);
    }
    report.push(`${sc.sea} Lv${sc.lv}: ${tally.port} port / ${tally.turnback} turned back / ${tally.wipe} lost, ` +
      `${Math.round(berries / RUNS).toLocaleString()} berries a voyage`);
    check(tally.port + tally.turnback >= RUNS * 0.5, `${sc.sea}: most voyages come home with something (${tally.port + tally.turnback}/${RUNS})`);
    check(tally.wipe < RUNS, `${sc.sea}: the sea is not unbeatable`);
    check(berries / RUNS > sandbox.trainCost(sc.lv), `${sc.sea}: a voyage funds at least a level at the tavern`);
  }
  console.log('\nvoyages: ' + report.join('\n          '));

  // the deep water must actually be deeper than the shallows
  const shallow = saveAfter(2, 12), deep = saveAfter(2, 12);
  check(S.SEA_BY_ID['new-world'].lo > S.SEA_BY_ID['east-blue'].hi, 'the New World starts above East Blue\'s ceiling');
  check(!S.seaUnlocked(shallow, S.SEA_BY_ID['sky']) && !S.seaUnlocked(deep, S.SEA_BY_ID['new-world']), 'a rookie crew cannot reach the deep seas at all');
}

console.log(failures === 0 ? '\nALL TESTS PASSED ✓' : `\n${failures} FAILURES ✗`);
process.exit(failures === 0 ? 0 : 1);
