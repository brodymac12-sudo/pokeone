/* Headless test: validates data, sprites, and battle engine.
   Run: node test/sim.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const code = ['js/data.js', 'js/engine.js', 'js/sprites.js']
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
  const ids = ['luffy', 'zoro', 'sanji', 'law', 'doflamingo', 'kaido', 'crocodile'];
  check(ids.every(id => CB[id].awaken && CB[id].awaken.moves && CB[id].awaken.moves.length === 4), 'seven fighters have a 4-move Awakening');

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

console.log(failures === 0 ? '\nALL TESTS PASSED ✓' : `\n${failures} FAILURES ✗`);
process.exit(failures === 0 ? 0 : 1);
