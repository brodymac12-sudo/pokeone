/* Headless test: validates data, sprites, and battle engine.
   Run: node test/sim.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const code = ['js/data.js', 'js/engine.js', 'js/sprites.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('\n;\n');

const ctx = { module: { exports: {} }, console };
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
  check(c.moves[c.moves.length - 1].name === 'Protect', `${c.id}: pool ends with Protect`);
  check(c.moves.some(m => m.fx && m.fx.protect), `${c.id}: pool contains a Protect move`);
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
const bst = c => c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd;
const T = id => bst(sandbox.CHAR_BY_ID[id]);
check(T('roger') > T('shanks'), 'Roger > Shanks');
check(T('imu') > T('kaido'), 'Imu > Kaido');
check(T('rocks') > T('whitebeard'), 'Rocks > Whitebeard');
check(T('shanks') > T('mihawk'), 'Shanks > Mihawk');
check(T('shanks') - T('usopp') >= 100, 'Shanks dwarfs Usopp by 100+ BST');
check(T('garp') > T('law'), 'Garp > Law');
check(T('luffy') > T('sanji') && T('sanji') > T('nami'), 'Straw Hat internal hierarchy');
check(T('buggy') < 320 && T('usopp') < 320 && T('nami') < 340, 'support tier stays lean');
// weak characters compensate with utility: each sub-340 fighter has a status move
for (const c of CHARACTERS) {
  if (bst(c) < 340) check(c.moves.some(m => m.pow === 0), `${c.id} (BST ${bst(c)}) carries a status move`);
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
check(rank('roger') < 8, `Roger ranks top-8 (got #${rank('roger') + 1})`);
check(rank('rocks') < 10, `Rocks ranks top-10 (got #${rank('rocks') + 1})`);
check(rank('imu') < 10, `Imu ranks top-10 (got #${rank('imu') + 1})`);
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
