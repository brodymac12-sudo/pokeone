/* ============================================================
   GRAND LINE LEGENDS — UI Controller
   ============================================================ */

const UI = {
  battle: null,
  mode: 'single',        // 'single' (4v4) | 'doubles' (2v2)
  playerCrew: [],        // chosen character ids
  loadouts: {},          // id -> array of 4 chosen move indices (into char.moves)
  opponentChoice: 'random',
  selectedPreset: null,
  busy: false,
  story: null,           // Story Mode save (roster, levels, berries)
  storyChapter: null,    // chapter being prepared / fought
  storyRun: null,        // set while a story battle is in progress
  awakenPending: false,  // player armed an Awakening for the next move
  muted: localStorage.getItem('gll-muted') === '1',
  lastCrews: null,       // for rematch
};

const MOVESET_SIZE = 4;
/* Free Battle always drafts 4; a Story chapter says how many you may bring. */
function crewMax() {
  if (UI.storyChapter) return UI.storyChapter.size;
  if (UI.voyageOutfit) return VOYAGE_PARTY_MAX;   // a landing party is "up to", not "exactly"
  return CREW_SIZE;
}
/* Default loadout: the 4 signature moves in single, or a doubles-ready set
   (signatures with the 2v2 move swapped in) in doubles — mirroring the AI. */
function defaultLoadout(id) {
  const c = CHAR_BY_ID[id];
  if (UI.mode === 'doubles' && c) {
    const set = [0, 1, 2, 3];
    const used = new Set();
    const swapIn = i => {
      if (set.includes(i)) return;
      let wi = -1, wv = Infinity;
      set.forEach((idx, k) => { if (used.has(k)) return; const v = c.moves[idx].pow || 0; if (v < wv) { wv = v; wi = k; } });
      if (wi < 0) return;
      set[wi] = i; used.add(wi);
    };
    c.moves.forEach((m, i) => { if (m.doubles) swapIn(i); });
    const tr = c.moves.findIndex(m => m.fx && m.fx.trickRoom);
    if (tr >= 0 && c.stats.spd <= 70 && used.size < 2 && set.filter(k => c.moves[k].pow > 0).length >= 3) swapIn(tr);
    return set;
  }
  return [0, 1, 2, 3];
}
function ensureLoadout(id) {
  if (!UI.loadouts[id]) UI.loadouts[id] = defaultLoadout(id);
  return UI.loadouts[id];
}
function loadoutMoves(id) {
  const c = CHAR_BY_ID[id];
  return ensureLoadout(id).map(i => c.moves[i]).filter(Boolean);
}

/* a fighter's live types / ability (an Awakening overrides them) */
function uiTypes(f) { return f.types || f.def.types; }
function uiAbility(f) { return f.ability || f.def.ability; }

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

function typeBadge(t, small) {
  const ty = TYPES[t];
  return `<span class="type-badge${small ? ' sm' : ''}" style="background:${ty.color};color:${ty.text}">${ty.name}</span>`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---- move effect descriptions (shared by battle, builder, library) ---- */
const STAT_LABELS = { atk: 'ATK', def: 'DEF', satk: 'SP.ATK', sdef: 'SP.DEF', spd: 'SPD' };
function statChangeText(obj) {
  return Object.entries(obj).map(([s, d]) => `${STAT_LABELS[s] || s} ${d > 0 ? '+' : ''}${d}`).join(', ');
}
function describeMoveFx(mv) {
  const fx = mv.fx || {};
  const parts = [];
  if (mv.pow > 0) parts.push(mv.cat === 'special' ? '✨ Special' : '⚔️ Physical');
  if (fx.trickRoom) parts.push('🌀 Trick Room — for 5 turns the slowest strike first');
  if (fx.wideGuard) parts.push('🧱 2v2: shields your whole side from a spread hit');
  if (fx.spread) parts.push('💥 2v2: hits BOTH foes');
  if (fx.team) parts.push(`📣 2v2: your side ${statChangeText(fx.team)}`);
  if (fx.allyHeal) parts.push(`💞 2v2: heals partner ${fx.allyHeal}%`);
  if (fx.allyBuff) parts.push(`📈 2v2: partner ${statChangeText(fx.allyBuff)}`);
  if (fx.redirect) parts.push('🌀 2v2: draws the foes\' attacks');
  if (fx.protect) parts.push('🛡️ guards — blocks the next attack (weaker if spammed)');
  if ((mv.prio || 0) > 0 && !fx.protect && !fx.redirect) parts.push('⚡ priority — acts first');
  if (fx.multi) parts.push(`🌀 hits ${fx.multi[0] === fx.multi[1] ? fx.multi[0] : fx.multi[0] + '–' + fx.multi[1]}×`);
  if (fx.burn) parts.push(`🔥 ${fx.burn}% burn`);
  if (fx.poison) parts.push(`☠️ ${fx.poison}% poison`);
  if (fx.para) parts.push(`⚡ ${fx.para}% paralyze`);
  if (fx.freeze) parts.push(`🧊 ${fx.freeze}% freeze`);
  if (fx.sleep) parts.push(mv.pow === 0 ? '💤 puts the foe to sleep' : `💤 ${fx.sleep}% sleep`);
  if (fx.stun) parts.push(mv.pow === 0 ? '💫 stuns the foe' : `💫 ${fx.stun}% stun`);
  if (fx.enemy) {
    const ch = fx.enemyChance !== undefined ? fx.enemyChance : 100;
    parts.push(`📉 ${ch < 100 ? ch + '% chance: ' : ''}foe ${statChangeText(fx.enemy)}`);
  }
  if (fx.self) {
    const down = Object.values(fx.self).some(v => v < 0);
    parts.push(`${down ? '📉' : '📈'} self ${statChangeText(fx.self)}`);
  }
  if (fx.heal) parts.push(`💚 restores ${fx.heal}% max HP`);
  if (fx.drain) parts.push(`🩸 heals ${fx.drain}% of damage dealt`);
  if (fx.recoil) parts.push(`💢 ${fx.recoil}% recoil`);
  if (fx.ignoreDef) parts.push('🗡️ ignores Defense');
  if (fx.critBoost) parts.push('🎯 high crit chance');
  if (fx.neverMiss) parts.push('🎯 never misses');
  return parts;
}
function moveRowHTML(m) {
  const fxParts = describeMoveFx(m);
  return `<div class="detail-move">
    <div class="dm-top">${typeBadge(m.type, true)}
      <span class="mname">${m.name}</span>
      <span class="mnum">${m.pow > 0 ? 'PWR ' + m.pow : 'STATUS'} · ACC ${m.acc}</span></div>
    ${fxParts.length ? `<div class="dm-fx">${fxParts.join(' · ')}</div>` : ''}</div>`;
}

/* ============================ SOUND ============================ */
let audioCtx = null;
function blip(freqA, freqB, dur, type, vol) {
  if (UI.muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freqA, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), audioCtx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.045, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur + 0.02);
  } catch (e) { /* audio unavailable */ }
}
const SFX = {
  hit: () => blip(190, 90, 0.1),
  superHit: () => blip(320, 70, 0.18, 'sawtooth', 0.05),
  weakHit: () => blip(140, 100, 0.07, 'triangle'),
  heal: () => blip(420, 760, 0.16, 'sine', 0.05),
  faint: () => blip(220, 40, 0.45, 'sawtooth', 0.05),
  click: () => blip(520, 480, 0.05, 'sine', 0.03),
  status: () => blip(300, 220, 0.12, 'triangle', 0.04),
  win: () => { blip(392, 392, 0.12, 'sine', 0.05); setTimeout(() => blip(494, 494, 0.12, 'sine', 0.05), 130); setTimeout(() => blip(587, 587, 0.22, 'sine', 0.06), 260); },
  lose: () => { blip(294, 294, 0.16, 'sine', 0.05); setTimeout(() => blip(247, 247, 0.16, 'sine', 0.05), 170); setTimeout(() => blip(196, 196, 0.3, 'sine', 0.06), 340); },
};

/* ============================ SELECT SCREEN ============================ */

function buildSelectScreen() {
  // preset cards
  const grid = $('#preset-grid');
  grid.innerHTML = '';
  for (const crew of PRESET_CREWS) {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.dataset.crewId = crew.id;
    card.innerHTML = `<span class="flag">${crew.flag}</span><h3>${crew.name}</h3><p>${crew.desc}</p>`;
    const faces = document.createElement('div');
    faces.className = 'preset-faces';
    crew.members.forEach(id => faces.appendChild(makeSpriteCanvas(id, 3, false)));
    card.appendChild(faces);
    card.addEventListener('click', () => {
      SFX.click();
      UI.selectedPreset = crew.id;
      UI.playerCrew = [...crew.members];
      UI.playerCrew.forEach(ensureLoadout);
      $$('.preset-card').forEach(c => c.classList.toggle('selected', c.dataset.crewId === crew.id));
      renderCrewSlots();
      renderRosterPicks();
      updateBattleButton();
    });
    grid.appendChild(card);
  }

  buildRosterGrid();

  // opponent select (random + presets + saved teams)
  const sel = $('#opponent-select');
  sel.addEventListener('change', () => { UI.opponentChoice = sel.value; });
  refreshOpponentOptions();

  renderCrewSlots();
  renderSavedTeams();
  showDetail(CHARACTERS[0].id);
  updateBattleButton();
}

/* The recruitable pool: everyone in Free Battle, only fighters you have
   actually recruited while playing Story Mode. */
function rosterPool() {
  if (UI.storyChapter || UI.voyageOutfit) {
    const st = storyState();
    return CHARACTERS.filter(c => st.roster.indexOf(c.id) >= 0);
  }
  return CHARACTERS;
}

function buildRosterGrid() {
  const roster = $('#roster-grid');
  if (!roster) return;
  roster.innerHTML = '';
  for (const c of rosterPool()) {
    const chip = document.createElement('div');
    chip.className = 'roster-chip';
    chip.dataset.id = c.id;
    chip.appendChild(makeSpriteCanvas(c.id, 4, false));
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = shortName(c);
    chip.appendChild(nm);
    if (UI.storyChapter) {
      const lv = document.createElement('span');
      lv.className = 'lib-bst';
      lv.textContent = 'Lv ' + levelOf(storyState(), c.id);
      chip.appendChild(lv);
    }
    chip.addEventListener('click', () => {
      SFX.click();
      togglePick(c.id);     // update crew membership first…
      showDetail(c.id);     // …so the detail panel shows the move picker
    });
    roster.appendChild(chip);
  }
  renderRosterPicks();
}

function shortName(c) {
  const map = {
    luffy: 'Luffy', zoro: 'Zoro', nami: 'Nami', usopp: 'Usopp', sanji: 'Sanji',
    chopper: 'Chopper', robin: 'Robin', franky: 'Franky', brook: 'Brook', jinbe: 'Jinbe',
    garp: 'Garp', akainu: 'Akainu', aokiji: 'Aokiji', kizaru: 'Kizaru', magellan: 'Magellan',
    mihawk: 'Mihawk', crocodile: 'Crocodile', doflamingo: 'Doflamingo', hancock: 'Hancock',
    law: 'Law', shanks: 'Shanks', whitebeard: 'Whitebeard', ace: 'Ace', marco: 'Marco',
    blackbeard: 'Blackbeard', kaido: 'Kaido', bigmom: 'Big Mom', enel: 'Enel', buggy: 'Buggy',
    roger: 'Roger', rocks: 'Rocks', imu: 'Imu', loki: 'Loki',
  };
  return map[c.id] || c.name;
}

function togglePick(id) {
  const i = UI.playerCrew.indexOf(id);
  if (i >= 0) UI.playerCrew.splice(i, 1);
  else if (UI.playerCrew.length < crewMax()) { UI.playerCrew.push(id); ensureLoadout(id); }
  UI.selectedPreset = null;
  $$('.preset-card').forEach(c => c.classList.remove('selected'));
  renderCrewSlots();
  renderRosterPicks();
  updateBattleButton();
}

function renderRosterPicks() {
  $$('.roster-chip').forEach(ch => ch.classList.toggle('picked', UI.playerCrew.includes(ch.dataset.id)));
}

function renderCrewSlots() {
  const slots = $('#crew-slots');
  slots.innerHTML = '';
  for (let i = 0; i < crewMax(); i++) {
    const slot = document.createElement('div');
    slot.className = 'crew-slot';
    const id = UI.playerCrew[i];
    if (id) {
      slot.classList.add('filled');
      slot.appendChild(makeSpriteCanvas(id, 4, false));
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = shortName(CHAR_BY_ID[id]);
      slot.appendChild(nm);
      slot.title = 'Remove from crew';
      slot.addEventListener('click', () => { SFX.click(); togglePick(id); });
    } else {
      slot.textContent = '+';
    }
    slots.appendChild(slot);
  }
}

function showDetail(id) {
  const c = CHAR_BY_ID[id];
  const p = $('#detail-panel');
  const maxStat = 130;
  p.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div id="detail-sprite"></div>
      <div style="flex:1">
        <h3>${c.name}</h3>
        <div class="epithet">"${c.epithet}" — ${c.crew}</div>
        <div>${c.types.map(t => typeBadge(t)).join(' ')}</div>
      </div>
    </div>
    <div class="statbars">
      ${['hp', 'atk', 'def', 'satk', 'sdef', 'spd'].map(s => `
        <div class="statbar"><span>${STAT_LABELS[s] || s.toUpperCase()}</span>
          <div class="track"><div class="fill" style="width:${Math.min(100, c.stats[s] / maxStat * 100)}%"></div></div>
          <span>${c.stats[s]}</span></div>`).join('')}
    </div>
    <div class="ability-box"><b>★ ${c.ability.name}</b> — ${c.ability.desc}</div>
    ${movesetSectionHTML(c)}`;
  $('#detail-sprite').appendChild(makeSpriteCanvas(id, 6, false));
  wireMovesetPicker(id);
}

/* Moves visible in the builder: doubles-only moves appear in 2v2 mode only.
   Returns [{ m, i }] keeping each move's real pool index for the loadout. */
function visibleMoves(c) {
  return c.moves.map((m, i) => ({ m, i })).filter(({ m }) => UI.mode === 'doubles' || !m.doubles);
}

/* Moves block: an interactive "pick 4" picker when the fighter is in the
   crew, otherwise a read-only listing of the visible pool. */
function movesetSectionHTML(c) {
  const inCrew = UI.playerCrew.includes(c.id);
  const vis = visibleMoves(c);
  const hint = UI.mode === 'doubles' ? ' · ✦ = 2v2 move' : '';
  if (!inCrew) {
    return `<div class="moveset-head">Move Pool <span class="ms-hint">— recruit to customize${hint}</span></div>
      <div class="detail-moves">${vis.map(({ m }) => moveRowHTML(m)).join('')}</div>`;
  }
  const lo = ensureLoadout(c.id);
  return `<div class="moveset-head">Moveset <span class="ms-count">${lo.length}/4</span>
      <span class="ms-hint">— tap to choose 4${hint}</span></div>
    <div class="detail-moves moveset-pick">
      ${vis.map(({ m, i }) => selectableMoveHTML(m, i, lo.includes(i))).join('')}</div>`;
}

function selectableMoveHTML(m, idx, selected) {
  const fxParts = describeMoveFx(m);
  return `<div class="detail-move selectable${selected ? ' selected' : ''}" data-midx="${idx}">
    <div class="dm-top"><span class="ms-check">${selected ? '✓' : '＋'}</span>${typeBadge(m.type, true)}
      <span class="mname">${m.doubles ? '<span class="dbl-tag">✦</span> ' : ''}${m.name}</span>
      <span class="mnum">${m.pow > 0 ? 'PWR ' + m.pow : 'STATUS'} · ACC ${m.acc}</span></div>
    ${fxParts.length ? `<div class="dm-fx">${fxParts.join(' · ')}</div>` : ''}</div>`;
}

function wireMovesetPicker(id) {
  if (!UI.playerCrew.includes(id)) return;
  $$('#detail-panel .detail-move.selectable').forEach(el => {
    el.addEventListener('click', () => toggleMoveSelect(id, Number(el.dataset.midx)));
  });
}

function toggleMoveSelect(id, idx) {
  const lo = ensureLoadout(id);
  const at = lo.indexOf(idx);
  if (at >= 0) {
    if (lo.length <= 1) return;           // keep at least one move
    lo.splice(at, 1);
  } else {
    if (lo.length >= MOVESET_SIZE) {
      const head = $('#detail-panel .ms-count');
      if (head) { head.classList.remove('nudge'); void head.offsetWidth; head.classList.add('nudge'); }
      return;
    }
    lo.push(idx);
  }
  SFX.click();
  showDetail(id);
  updateBattleButton();
}

function updateBattleButton() {
  const btn = $('#btn-battle');
  const saveBtn = $('#btn-save-team');
  if (saveBtn) saveBtn.disabled = UI.playerCrew.length === 0;
  const max = crewMax();
  // a voyage sails with anyone from one to four; every other mode wants a full crew
  const full = UI.voyageOutfit ? UI.playerCrew.length >= 1 : UI.playerCrew.length === max;
  const movesReady = UI.playerCrew.every(id => ensureLoadout(id).length === MOVESET_SIZE);
  btn.disabled = !full || !movesReady;
  if (!full) {
    const need = max - UI.playerCrew.length;
    btn.textContent = UI.voyageOutfit ? 'Choose at least one for the landing party' : `Choose ${need} more pirate${need === 1 ? '' : 's'}`;
  } else if (!movesReady) {
    const who = UI.playerCrew.find(id => ensureLoadout(id).length !== MOVESET_SIZE);
    btn.textContent = `Finish ${shortName(CHAR_BY_ID[who])}'s moveset (pick 4)`;
  } else if (UI.voyageOutfit) {
    btn.textContent = `⚓ Weigh anchor — ${SEA_BY_ID[UI.voyageOutfit].name}`;
  } else if (UI.storyChapter) {
    btn.textContent = `⚓ Set sail for ${UI.storyChapter.name}!`;
  } else {
    btn.textContent = UI.mode === 'doubles' ? '⚔️ Begin 2v2 Duel!' : '⚔️ Set Sail for Battle!';
  }
}

/* Clamp a list of move indices to a valid 4-move set for the current mode
   (dropping doubles-only moves in 1v1) and backfill from the signature kit. */
function sanitizeLoadout(c, indices) {
  let lo = (indices || []).filter(i => c.moves[i] && (UI.mode === 'doubles' || !c.moves[i].doubles));
  for (let i = 0; lo.length < MOVESET_SIZE && i < c.moves.length; i++)
    if ((UI.mode === 'doubles' || !c.moves[i].doubles) && !lo.includes(i)) lo.push(i);
  return (lo.length ? lo : defaultLoadout(c.id)).slice(0, MOVESET_SIZE);
}

/* Resolve the opponent: random crew, a famous preset, or a saved team
   (value "team:<name>"). Returns { ids, loadouts } where loadouts is an
   array of move-object arrays (or undefined to use defaults). */
function pickOpponent() {
  const n = crewMax(), v = UI.opponentChoice;
  if (v && v.startsWith('team:')) {
    const team = loadTeams().find(t => t.name === v.slice(5));
    if (team) {
      const ids = team.members.slice(0, n);
      const loadouts = ids.map(id => sanitizeLoadout(CHAR_BY_ID[id], team.loadouts && team.loadouts[id]).map(i => CHAR_BY_ID[id].moves[i]));
      return { ids, loadouts };
    }
  }
  if (v && v !== 'random') {
    const preset = PRESET_CREWS.find(c => c.id === v);
    if (preset) return { ids: preset.members.slice(0, n), loadouts: undefined };
  }
  const pool = CHARACTERS.map(c => c.id).filter(id => !UI.playerCrew.includes(id));
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return { ids, loadouts: undefined };
}

/* ---- saved teams (localStorage) ---- */
function loadTeams() { try { return JSON.parse(localStorage.getItem('gll-teams') || '[]'); } catch (e) { return []; } }
function storeTeams(t) { try { localStorage.setItem('gll-teams', JSON.stringify(t)); } catch (e) {} }
function saveCurrentTeam() {
  if (!UI.playerCrew.length) return;
  const suggested = UI.playerCrew.map(id => shortName(CHAR_BY_ID[id])).slice(0, 2).join(' & ');
  const name = (prompt('Name this team:', suggested) || '').trim().slice(0, 24);
  if (!name) return;
  const team = { name, members: [...UI.playerCrew], loadouts: {} };
  for (const id of UI.playerCrew) team.loadouts[id] = ensureLoadout(id).slice();
  const teams = loadTeams();
  const i = teams.findIndex(t => t.name === name);
  if (i >= 0) teams[i] = team; else teams.push(team);
  storeTeams(teams);
  renderSavedTeams();
  refreshOpponentOptions();
}
function deleteTeam(name) {
  storeTeams(loadTeams().filter(t => t.name !== name));
  renderSavedTeams();
  refreshOpponentOptions();
}
function loadTeamIntoCrew(team) {
  SFX.click();
  UI.playerCrew = team.members.slice(0, crewMax());
  UI.loadouts = {};
  for (const id of UI.playerCrew) UI.loadouts[id] = sanitizeLoadout(CHAR_BY_ID[id], team.loadouts && team.loadouts[id]);
  UI.selectedPreset = null;
  $$('.preset-card').forEach(c => c.classList.remove('selected'));
  renderCrewSlots();
  renderRosterPicks();
  if (UI.playerCrew[0]) showDetail(UI.playerCrew[0]);
  updateBattleButton();
  renderSavedTeams();
}
function renderSavedTeams() {
  const list = $('#saved-teams-list');
  if (!list) return;
  const teams = loadTeams();
  list.innerHTML = teams.length ? '' : '<span class="saved-empty">none yet — build a crew and hit Save</span>';
  for (const team of teams) {
    const chip = document.createElement('div');
    chip.className = 'team-chip';
    const load = document.createElement('button');
    load.className = 'team-load';
    load.textContent = team.name;
    load.title = team.members.map(id => shortName(CHAR_BY_ID[id])).join(', ');
    load.addEventListener('click', () => loadTeamIntoCrew(team));
    const del = document.createElement('button');
    del.className = 'team-del';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', e => { e.stopPropagation(); SFX.click(); deleteTeam(team.name); });
    chip.appendChild(load); chip.appendChild(del);
    list.appendChild(chip);
  }
}
function refreshOpponentOptions() {
  const sel = $('#opponent-select');
  if (!sel) return;
  const cur = sel.value;
  let html = '<option value="random">🎲 Random Crew</option>' +
    PRESET_CREWS.map(c => `<option value="${c.id}">${c.flag} ${c.name}</option>`).join('');
  const teams = loadTeams();
  if (teams.length) html += '<optgroup label="Saved teams">' +
    teams.map(t => `<option value="team:${t.name}">💾 ${t.name}</option>`).join('') + '</optgroup>';
  sel.innerHTML = html;
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'random';
  UI.opponentChoice = sel.value;
}

/* ============================ BATTLE SCREEN ============================ */

/* `afterBuild` runs on the fresh Battle before anything is drawn — the seam a
   voyage uses to graft carried-over damage onto the crew, since Fighter caches
   maxHp at construction. */
function startBattle(playerIds, enemyIds, playerLoadouts, enemyLoadouts, playerLevels, enemyLevels, afterBuild) {
  UI.lastCrews = { player: [...playerIds], enemy: [...enemyIds], playerLoadouts, enemyLoadouts, playerLevels, enemyLevels };
  UI.battle = new Battle(playerIds, enemyIds, { playerLoadouts, enemyLoadouts, playerLevels, enemyLevels });
  if (afterBuild) afterBuild(UI.battle);
  syncForfeitLabels();
  UI.busy = false;
  $('#battle-log').innerHTML = '';
  $('#turn-label').textContent = 'BATTLE START';
  showScreen('#screen-battle');
  renderCombatant('player');
  renderCombatant('enemy');
  renderDots();
  renderMoves();
  // play opening events (switch-in abilities like Conqueror's Aura)
  playEvents(UI.battle.events.slice());
}

function fighter(sideKey) { return UI.battle.active(sideKey); }

function renderCombatant(sideKey) {
  const f = fighter(sideKey);
  const zone = $(sideKey === 'player' ? '#player-zone' : '#enemy-zone');
  const wrap = zone.querySelector('.sprite-wrap');
  wrap.classList.remove('fainted-anim');
  wrap.classList.toggle('awakened-aura', !!f.awakened);
  wrap.innerHTML = '';
  wrap.appendChild(makeSpriteCanvas(f.def.id, sideKey === 'player' ? 9 : 7, sideKey === 'player'));
  renderCard(sideKey);
}

function renderCard(sideKey) {
  const f = fighter(sideKey);
  const card = $(sideKey === 'player' ? '#player-card' : '#enemy-card');
  const ab = uiAbility(f);
  card.innerHTML = `
    <div class="row1">
      <span class="fname">${f.awakened ? '⚡ ' : ''}${f.name}</span>
      <span class="status-chip"></span>
    </div>
    <div class="types-row">
      ${uiTypes(f).map(t => typeBadge(t, true)).join('')}
      <span class="ability-tag" title="${ab.desc}">★ ${ab.name}</span>
    </div>
    <div class="stage-row"></div>
    <div class="hp-track"><div class="hp-fill"></div></div>
    <div class="hp-num"></div>`;
  updateHp(sideKey, false);
  updateStatusChip(sideKey);
  updateStages(sideKey);
}

/* Persistent buff/debuff readout: one chip per non-zero stat stage. */
const STAGE_LABELS = { atk: 'ATK', def: 'DEF', satk: 'SP.A', sdef: 'SP.D', spd: 'SPD' };
function updateStages(sideKey) {
  const f = fighter(sideKey);
  const card = $(sideKey === 'player' ? '#player-card' : '#enemy-card');
  const row = card.querySelector('.stage-row');
  if (!row) return;
  const chips = [];
  for (const s of ['atk', 'def', 'satk', 'sdef', 'spd']) {
    const v = f.stages[s];
    if (!v) continue;
    const arrows = (v > 0 ? '▲' : '▼').repeat(Math.min(3, Math.abs(v)));
    chips.push(`<span class="stage-chip ${v > 0 ? 'up' : 'down'}" title="${STAGE_LABELS[s]} ${v > 0 ? '+' : ''}${v} stage${Math.abs(v) > 1 ? 's' : ''}">${STAGE_LABELS[s]} ${arrows}</span>`);
  }
  row.innerHTML = chips.join('');
  row.style.display = chips.length ? 'flex' : 'none';
}

function updateHp(sideKey) {
  const f = fighter(sideKey);
  const card = $(sideKey === 'player' ? '#player-card' : '#enemy-card');
  const fill = card.querySelector('.hp-fill');
  const pct = f.maxHp ? (f.hp / f.maxHp) * 100 : 0;
  fill.style.width = pct + '%';
  fill.classList.toggle('mid', pct <= 55 && pct > 25);
  fill.classList.toggle('low', pct <= 25);
  card.querySelector('.hp-num').textContent = `${f.hp} / ${f.maxHp}`;
}

const STATUS_CHIP_COLORS = { burn: '#e8542f', poison: '#9a4ad4', para: '#caa42a', freeze: '#5ab8d4', sleep: '#7a86a0' };
function updateStatusChip(sideKey) {
  const f = fighter(sideKey);
  const chip = $(sideKey === 'player' ? '#player-card' : '#enemy-card').querySelector('.status-chip');
  if (f.status) {
    chip.style.display = 'inline-block';
    chip.style.background = STATUS_CHIP_COLORS[f.status] || '#666';
    chip.textContent = STATUS_ICONS[f.status];
  } else {
    chip.style.display = 'none';
  }
}

function renderDots() {
  for (const sideKey of ['player', 'enemy']) {
    const wrap = $(sideKey === 'player' ? '#player-dots' : '#enemy-dots');
    wrap.innerHTML = '';
    UI.battle.sides[sideKey].crew.forEach((f, i) => {
      const d = document.createElement('div');
      d.className = 'dot';
      if (!f.alive) d.classList.add('fainted');
      if (i === UI.battle.sides[sideKey].active && f.alive) d.classList.add('active-dot');
      d.title = f.name;
      wrap.appendChild(d);
    });
  }
}

function renderMoves() {
  const f = fighter('player');
  const enemy = fighter('enemy');
  const grid = $('#moves-grid');
  // when an Awakening is armed, preview the awakened moveset so the player
  // chooses (and uses) a special move on the very turn they transform
  const previewing = UI.awakenPending && UI.battle && UI.battle.canAwaken('player') && f.def.awaken;
  const moveList = previewing ? f.def.awaken.moves : f.moves;
  grid.classList.toggle('awaken-preview', !!previewing);
  grid.innerHTML = '';
  moveList.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'move-btn';
    b.style.borderLeft = `4px solid ${TYPES[m.type].color}`;
    let effHint = '';
    if (m.pow > 0 && enemy && enemy.alive) {
      const eff = typeEffectiveness(m.type, enemy.def.types);
      if (eff === 0) effHint = '<span class="eff-hint zero">✕</span>';
      else if (eff > 1) effHint = '<span class="eff-hint up">▲▲</span>';
      else if (eff < 1) effHint = '<span class="eff-hint down">▼</span>';
    }
    const fxParts = describeMoveFx(m);
    b.innerHTML = `<span class="mv-name">${m.name}</span>
      <span class="mv-meta">${typeBadge(m.type, true)}
        <span>${m.pow > 0 ? 'PWR ' + m.pow : 'STATUS'}</span><span>ACC ${m.acc}</span>${effHint}</span>
      ${fxParts.length ? `<span class="mv-fx">${fxParts.join(' · ')}</span>` : ''}`;
    b.title = m.name + (fxParts.length ? ' — ' + fxParts.join('; ') : '');
    b.addEventListener('click', () => takeAction({ type: 'move', idx: i }));
    grid.appendChild(b);
  });
  setActionsEnabled(!UI.busy);
  updateAwakenButton();
}

function updateAwakenButton() {
  const btn = $('#btn-awaken');
  if (!btn) return;
  const can = UI.battle && !UI.battle.over && UI.battle.canAwaken && UI.battle.canAwaken('player');
  btn.style.display = can ? '' : 'none';
  if (!can) { UI.awakenPending = false; return; }
  const aw = fighter('player').def.awaken;
  btn.classList.toggle('armed', UI.awakenPending);
  btn.textContent = UI.awakenPending ? '⚡ Awakening!' : '⚡ Awaken';
  btn.title = aw ? aw.name : '';
  btn.disabled = UI.busy;
}

function setActionsEnabled(on) {
  $$('#moves-grid .move-btn').forEach(b => b.disabled = !on);
  $('#btn-switch').disabled = !on;
  $('#btn-forfeit').disabled = !on;
  const aw = $('#btn-awaken'); if (aw) aw.disabled = !on;
}

async function takeAction(action) {
  if (UI.busy || !UI.battle || UI.battle.over || UI.battle.awaitingReplace) return;
  if (UI.awakenPending && action.type === 'move' && UI.battle.canAwaken('player')) action.awaken = true;
  UI.awakenPending = false;
  UI.busy = true;
  setActionsEnabled(false);
  const events = UI.battle.playTurn(action);
  await playEvents(events);
}

/* ---- battle log ---- */
function logLine(msg, cls) {
  const log = $('#battle-log');
  log.querySelectorAll('.latest').forEach(l => l.classList.remove('latest'));
  const div = document.createElement('div');
  div.className = 'logline latest' + (cls ? ' ' + cls : '');
  div.textContent = msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function floatNum(sideKey, text, color) {
  const zone = $(sideKey === 'player' ? '#player-zone' : '#enemy-zone');
  const el = document.createElement('div');
  el.className = 'float-num';
  el.style.color = color;
  el.textContent = text;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/* ---- event playback ---- */
async function playEvents(events) {
  for (const ev of events) {
    if (!UI.battle) return;
    switch (ev.t) {
      case 'turnStart':
        $('#turn-label').textContent = 'TURN ' + ev.n;
        const sep = document.createElement('div');
        sep.className = 'turnsep';
        sep.textContent = '— Turn ' + ev.n + ' —';
        $('#battle-log').appendChild(sep);
        await sleep(120);
        break;

      case 'log':
        logLine(ev.msg);
        await sleep(ev.move ? 320 : 380);
        break;

      case 'anim': {
        const wrap = $(ev.side === 'player' ? '#player-zone' : '#enemy-zone').querySelector('.sprite-wrap');
        const cls = ev.side === 'player' ? 'lunge-right' : 'lunge-left';
        if (ev.kind === 'attack' && !ev.status) {
          wrap.classList.add(cls);
          setTimeout(() => wrap.classList.remove(cls), 450);
          await sleep(240);
        } else if (ev.kind === 'attack') {
          await sleep(140);
        } else if (ev.kind === 'protect' || ev.kind === 'blocked') {
          wrap.classList.add('guard-flash');
          setTimeout(() => wrap.classList.remove('guard-flash'), 420);
          SFX.status();
          await sleep(220);
        }
        break;
      }

      case 'damage': {
        const targetWrap = $(ev.side === 'player' ? '#player-zone' : '#enemy-zone').querySelector('.sprite-wrap');
        targetWrap.classList.add('shake', 'hit-flash');
        setTimeout(() => targetWrap.classList.remove('shake', 'hit-flash'), 450);
        const color = ev.crit ? '#ffd24a' : ev.eff > 1 ? '#ff7a5a' : ev.eff < 1 ? '#9fb8d4' : '#ffffff';
        floatNum(ev.side, '-' + ev.amount, ev.dot ? '#c084fc' : color);
        if (ev.crit || ev.eff > 1) SFX.superHit(); else if (ev.eff < 1) SFX.weakHit(); else SFX.hit();
        updateHp(ev.side);
        await sleep(420);
        break;
      }

      case 'heal':
        floatNum(ev.side, '+' + ev.amount, '#4ade80');
        SFX.heal();
        updateHp(ev.side);
        await sleep(380);
        break;

      case 'status':
        updateStatusChip(ev.side);
        if (ev.status) SFX.status();
        await sleep(160);
        break;

      case 'stat': {
        const f = fighter(ev.side);
        const arrow = ev.delta > 0 ? '▲' : '▼';
        const label = ev.stat.toUpperCase() + ' ' + arrow.repeat(Math.min(2, Math.abs(ev.delta)));
        floatNum(ev.side, label, ev.delta > 0 ? '#5eead4' : '#f59e0b');
        updateStages(ev.side);
        SFX.status();
        await sleep(300);
        break;
      }

      case 'switch':
        renderCombatant(ev.side);
        renderDots();
        if (ev.side === 'player') renderMoves();
        else renderMoves(); // refresh eff hints vs new enemy
        await sleep(420);
        break;

      case 'awaken': {
        const wrap = $(ev.side === 'player' ? '#player-zone' : '#enemy-zone').querySelector('.sprite-wrap');
        wrap.classList.add('awaken-flash');
        setTimeout(() => wrap.classList.remove('awaken-flash'), 700);
        logLine(`⚡ ${ev.name} → ${ev.awakenName}!`, 'awaken-line');
        SFX.win();
        renderCombatant(ev.side);   // new types/ability/glow + name
        if (ev.side === 'player') renderMoves();
        await sleep(900);
        break;
      }

      case 'faint': {
        const wrap = $(ev.side === 'player' ? '#player-zone' : '#enemy-zone').querySelector('.sprite-wrap');
        wrap.classList.add('fainted-anim');
        SFX.faint();
        renderDots();
        await sleep(650);
        break;
      }

      case 'needReplace':
        await sleep(250);
        openSwitchModal(true);
        return; // wait for user choice; flow resumes in submitReplace

      case 'end':
        await sleep(900);
        showResult(ev.winner);
        return;
    }
  }
  // turn fully played out
  UI.busy = false;
  if (UI.battle && !UI.battle.over && !UI.battle.awaitingReplace) {
    renderMoves();
    setActionsEnabled(true);
  }
}

/* ---- switch modal ---- */
function openSwitchModal(forced) {
  const modal = $('#modal-switch');
  const grid = $('#switch-grid');
  $('#switch-title').textContent = forced ? 'Your pirate is down! Send out the next!' : 'Switch Crew Member';
  $('#btn-switch-cancel').style.display = forced ? 'none' : 'inline-block';
  grid.innerHTML = '';
  const side = UI.battle.sides.player;
  side.crew.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'switch-card';
    if (!f.alive) card.classList.add('dead');
    if (i === side.active && f.alive && !forced) card.classList.add('current');
    card.appendChild(makeSpriteCanvas(f.def.id, 4, false));
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.innerHTML = `${f.name}<br>${f.def.types.map(t => typeBadge(t, true)).join(' ')}`;
    card.appendChild(nm);
    const hp = document.createElement('div');
    hp.className = 'hpline';
    const pct = (f.hp / f.maxHp) * 100;
    hp.innerHTML = `<div class="hp-track"><div class="hp-fill ${pct <= 25 ? 'low' : pct <= 55 ? 'mid' : ''}" style="width:${pct}%"></div></div>
      <div class="hp-num" style="font-size:10px">${f.hp}/${f.maxHp}</div>`;
    card.appendChild(hp);
    if (f.alive && !(i === side.active && !forced)) {
      card.addEventListener('click', async () => {
        SFX.click();
        closeSwitchModal();
        UI.busy = true;
        setActionsEnabled(false);
        let events;
        if (forced || UI.battle.awaitingReplace) events = UI.battle.submitReplace(i);
        else events = UI.battle.playTurn({ type: 'switch', idx: i });
        await playEvents(events);
      });
    }
    grid.appendChild(card);
  });
  modal.classList.add('open');
}
function closeSwitchModal() { $('#modal-switch').classList.remove('open'); }

/* ---- type chart modal ---- */
function buildTypeChart() {
  const keys = Object.keys(TYPES);
  let html = '<table class="tc-table"><tr><th>ATK ↓ / DEF →</th>';
  for (const d of keys) html += `<th><span class="type-badge sm" style="background:${TYPES[d].color};color:${TYPES[d].text}">${TYPES[d].name.slice(0, 4)}</span></th>`;
  html += '</tr>';
  for (const a of keys) {
    html += `<tr><td><span class="type-badge sm" style="background:${TYPES[a].color};color:${TYPES[a].text}">${TYPES[a].name}</span></td>`;
    for (const d of keys) {
      const m = (TYPE_CHART[a] && TYPE_CHART[a][d] !== undefined) ? TYPE_CHART[a][d] : 1;
      const cls = m === 2 ? 'tc-cell-2' : m === 0.5 ? 'tc-cell-05' : m === 0 ? 'tc-cell-0' : '';
      html += `<td class="${cls}">${m === 1 ? '' : m === 0.5 ? '½' : m}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  $('#tc-table-wrap').innerHTML = html;
}

/* ---- result ---- */
function showResult(winner) {
  UI.busy = false;
  if (UI.voyageRun) return voyageFinishBattle(winner, UI.battle);
  if (UI.storyRun) return storyFinish(winner);
  showResultGeneric(winner, UI.battle);
}

function showResultGeneric(winner, battle) {
  const t = $('#result-title');
  const win = winner === 'player', draw = winner === 'draw';
  t.textContent = draw ? 'DRAW!' : win ? 'VICTORY!' : 'DEFEAT...';
  t.className = 'result-title ' + (draw ? 'win' : win ? 'win' : 'lose');
  $('#result-sub').textContent = draw
    ? 'Both crews fell together — the sea claims no victor this day.'
    : win
      ? 'Your crew rules these waters. The Grand Line sings your name!'
      : 'Your crew was scattered to the waves. Regroup and set sail again!';
  (win || draw ? SFX.win : SFX.lose)();

  for (const sideKey of ['player', 'enemy']) {
    const wrap = $(sideKey === 'player' ? '#result-player' : '#result-enemy');
    wrap.innerHTML = '';
    battle.sides[sideKey].crew.forEach(f => {
      const rf = document.createElement('div');
      rf.className = 'rf' + (f.alive ? '' : ' dead');
      rf.appendChild(makeSpriteCanvas(f.def.id, 4, false));
      const nm = document.createElement('span');
      nm.textContent = shortName(f.def);
      rf.appendChild(nm);
      wrap.appendChild(rf);
    });
  }
  showScreen('#screen-result');
}

/* ============================ LIBRARY ============================ */

let libSelected = null;
let libSort = 'bst';

function bstOf(c) { return c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd; }

function libOrder() {
  const arr = [...CHARACTERS];
  if (libSort === 'bst') arr.sort((a, b) => bstOf(b) - bstOf(a));
  else if (libSort === 'name') arr.sort((a, b) => shortName(a).localeCompare(shortName(b)));
  else if (libSort === 'crew') arr.sort((a, b) => a.crew.localeCompare(b.crew) || bstOf(b) - bstOf(a));
  return arr;
}

/* Defensive matchups for a type combination, derived from the chart. */
function matchupsFor(types) {
  const weak = [], resist = [], immune = [];
  for (const atk of Object.keys(TYPES)) {
    let m = 1;
    for (const d of types) {
      const row = TYPE_CHART[atk];
      if (row && row[d] !== undefined) m *= row[d];
    }
    if (m === 0) immune.push(atk);
    else if (m >= 2) weak.push(atk);
    else if (m < 1) resist.push(atk);
  }
  return { weak, resist, immune };
}

function buildLibrary() {
  if (!libSelected) libSelected = libOrder()[0].id;
  renderLibGrid();
  renderLibDetail(libSelected);
}

function renderLibGrid() {
  const grid = $('#lib-grid');
  grid.innerHTML = '';
  for (const c of libOrder()) {
    const chip = document.createElement('div');
    chip.className = 'roster-chip lib-chip' + (c.id === libSelected ? ' picked' : '');
    chip.appendChild(makeSpriteCanvas(c.id, 4, false));
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = (c.awaken ? '⚡ ' : '') + shortName(c);
    chip.appendChild(nm);
    if (c.awaken) chip.title = 'Can Awaken — ' + c.awaken.name;
    const bst = document.createElement('span');
    bst.className = 'lib-bst';
    bst.textContent = 'BST ' + bstOf(c);
    chip.appendChild(bst);
    chip.addEventListener('click', () => {
      SFX.click();
      libSelected = c.id;
      renderLibGrid();
      renderLibDetail(c.id);
    });
    grid.appendChild(chip);
  }
}

function renderLibDetail(id) {
  const c = CHAR_BY_ID[id];
  const p = $('#lib-detail');
  const maxStat = 140;
  const mu = matchupsFor(c.types);
  const badgeList = arr => arr.length ? arr.map(t => typeBadge(t, true)).join(' ') : '<span class="mu-none">none</span>';
  const abilityImmune = c.ability.kind === 'immuneType'
    ? `<div class="mu-row"><span class="mu-label">★ Ability immunity</span><span>${typeBadge(c.ability.type, true)}</span></div>` : '';
  p.innerHTML = `
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div id="lib-sprite"></div>
      <div style="flex:1">
        <h3>${c.name}</h3>
        <div class="epithet">"${c.epithet}"<br>${c.crew}</div>
        <div style="margin-top:4px">${c.types.map(t => typeBadge(t)).join(' ')}
          <span class="lib-bst-big">BST ${bstOf(c)}</span></div>
      </div>
    </div>
    <div class="statbars">
      ${['hp', 'atk', 'def', 'satk', 'sdef', 'spd'].map(s => `
        <div class="statbar"><span>${STAT_LABELS[s] || s.toUpperCase()}</span>
          <div class="track"><div class="fill" style="width:${Math.min(100, c.stats[s] / maxStat * 100)}%"></div></div>
          <span>${c.stats[s]}</span></div>`).join('')}
    </div>
    <div class="ability-box"><b>★ ${c.ability.name}</b> — ${c.ability.desc}</div>
    <div class="mu-box">
      <div class="mu-row"><span class="mu-label">Weak to (2×)</span><span>${badgeList(mu.weak)}</span></div>
      <div class="mu-row"><span class="mu-label">Resists (½×)</span><span>${badgeList(mu.resist)}</span></div>
      ${mu.immune.length ? `<div class="mu-row"><span class="mu-label">Immune to</span><span>${badgeList(mu.immune)}</span></div>` : ''}
      ${abilityImmune}
    </div>
    <div class="detail-moves">
      ${c.moves.map(m => moveRowHTML(m)).join('')}
    </div>
    ${awakenSectionHTML(c)}`;
  $('#lib-sprite').appendChild(makeSpriteCanvas(id, 7, false));
}

/* The Awakening panel: shown for the eleven fighters that can transform. */
function awakenSectionHTML(c) {
  const aw = c.awaken;
  if (!aw) return '';
  const statChips = Object.entries(aw.stats || {})
    .map(([s, v]) => `<span class="aw-stat">+${v} ${STAT_LABELS[s] || s.toUpperCase()}</span>`).join('');
  const newTypes = (aw.types || c.types).map(t => typeBadge(t, true)).join(' ');
  const ability = aw.ability
    ? `<b>★ ${aw.ability.name}</b> — ${aw.ability.desc}`
    : `<b>★ ${c.ability.name}</b> — keeps its signature ability`;
  return `<div class="awaken-box">
    <div class="awaken-title">⚡ Awakening · ${aw.name} ${newTypes}</div>
    ${statChips ? `<div class="awaken-stats">${statChips}</div>` : ''}
    <div class="awaken-sub">${ability}</div>
    <div class="detail-moves">${aw.moves.map(m => moveRowHTML(m)).join('')}</div>
  </div>`;
}

/* ============================ TOURNAMENT ============================ */

const TOUR_REPS = 10;

function vsBlock(aId, bId, aWins, bWins) {
  const el = document.createElement('div');
  el.className = 'vs-block';
  const side = (id, wins, won) => {
    const s = document.createElement('div');
    s.className = 'vs-side' + (won ? ' vs-won' : '');
    s.appendChild(makeSpriteCanvas(id, 4, false));
    const nm = document.createElement('span');
    nm.textContent = shortName(CHAR_BY_ID[id]);
    s.appendChild(nm);
    return s;
  };
  el.appendChild(side(aId, aWins, aWins > bWins));
  const score = document.createElement('div');
  score.className = 'vs-score';
  score.textContent = `${aWins} – ${bWins}`;
  el.appendChild(score);
  el.appendChild(side(bId, bWins, bWins > aWins));
  return el;
}

function highlightCard(icon, title, m, note) {
  const card = document.createElement('div');
  card.className = 'tour-card';
  const t = document.createElement('div');
  t.className = 'tc-title';
  t.textContent = `${icon} ${title}`;
  card.appendChild(t);
  card.appendChild(vsBlock(m.a, m.b, m.aWins, m.bWins));
  const n = document.createElement('div');
  n.className = 'tc-note';
  n.textContent = note;
  card.appendChild(n);
  return card;
}

function startTournament() {
  $('#tour-intro').style.display = 'none';
  $('#tour-results').style.display = 'none';
  $('#btn-tour-rerun').style.display = 'none';
  $('#tour-progress').style.display = 'flex';
  $('#tour-bar').style.width = '0%';
  const state = createTournament(TOUR_REPS);
  UI.tournament = state;
  UI.tourStats = null;
  const totalBattles = state.pairs.length * state.reps;
  const step = () => {
    const done = runTournamentChunk(state, 14);
    $('#tour-bar').style.width = (state.idx / state.pairs.length * 100) + '%';
    $('#tour-progress-label').textContent =
      `⚔️ ${(state.idx * state.reps).toLocaleString()} / ${totalBattles.toLocaleString()} battles fought…`;
    if (!done) { setTimeout(step, 0); return; }
    UI.tourStats = computeTournamentStats(state);
    $('#tour-progress').style.display = 'none';
    renderTournamentResults();
    SFX.win();
  };
  setTimeout(step, 50);
}

function renderTournamentResults() {
  const stats = UI.tourStats;
  if (!stats) return;
  $('#tour-results').style.display = 'block';
  $('#btn-tour-rerun').style.display = 'inline-block';

  /* highlight cards */
  const hl = $('#tour-highlights');
  hl.innerHTML = '';
  if (stats.upset) {
    hl.appendChild(highlightCard('🥊', 'Upset of the Tournament', stats.upset,
      `${shortName(CHAR_BY_ID[stats.upset.a])} took the series despite giving up ${stats.upset.gap} BST to ${shortName(CHAR_BY_ID[stats.upset.b])}.`));
  }
  if (stats.deadlock) {
    hl.appendChild(highlightCard('⚖️', 'Dead Heat', stats.deadlock,
      'The closest series of the whole tournament — the sea itself couldn\'t pick a winner.'));
  }
  if (stats.domination) {
    hl.appendChild(highlightCard('💀', 'Total Domination', stats.domination,
      `A clean 10-game sweep across a gap of only ${stats.domination.gap} BST. Stats lie.`));
  }
  if (stats.marathon) {
    hl.appendChild(highlightCard('🐢', 'The Marathon War', stats.marathon,
      `These two ground out ${stats.marathon.avgTurns.toFixed(1)} turns per battle on average — storms included.`));
  }
  if (stats.blitz) {
    hl.appendChild(highlightCard('⚡', 'Fastest Demolition', stats.blitz,
      `Average battle: ${stats.blitz.avgTurns.toFixed(1)} turns. Blink and it's over.`));
  }

  /* legendary rivalries */
  const rv = $('#tour-rivalries');
  rv.innerHTML = '';
  for (const r of stats.rivalries) {
    const chip = document.createElement('div');
    chip.className = 'rival-chip';
    const label = document.createElement('div');
    label.className = 'rv-label';
    label.textContent = r.label;
    chip.appendChild(label);
    chip.appendChild(vsBlock(r.a, r.b, r.aWins, r.bWins));
    rv.appendChild(chip);
  }

  /* ranking table */
  const tbl = $('#tour-table');
  tbl.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  stats.table.forEach((row, i) => {
    const c = CHAR_BY_ID[row.id];
    const el = document.createElement('div');
    el.className = 'rank-row';
    const rk = document.createElement('div');
    rk.className = 'rk' + (i < 3 ? ' medal' : '');
    rk.textContent = i < 3 ? medals[i] : String(i + 1);
    el.appendChild(rk);
    el.appendChild(makeSpriteCanvas(row.id, 3, false));
    const nameCell = document.createElement('div');
    nameCell.innerHTML = `<div class="rname">${c.name}</div>
      <div style="display:flex;gap:4px;margin-top:2px">${c.types.map(t => typeBadge(t, true)).join('')}</div>`;
    el.appendChild(nameCell);
    const rec = document.createElement('div');
    rec.className = 'rrec';
    rec.textContent = `${row.wins} W – ${row.losses} L`;
    el.appendChild(rec);
    const pct = document.createElement('div');
    pct.innerHTML = `<div class="pct-track"><div class="pct-fill" style="width:${(row.pct * 100).toFixed(1)}%"></div></div>
      <div class="pct-num">${(row.pct * 100).toFixed(1)}%</div>`;
    el.appendChild(pct);
    const bstEl = document.createElement('div');
    bstEl.className = 'rbst';
    bstEl.textContent = 'BST ' + row.bst;
    el.appendChild(bstEl);
    el.addEventListener('click', () => toggleBreakdown(el, row.id));
    tbl.appendChild(el);
  });
}

function toggleBreakdown(rowEl, id) {
  SFX.click();
  const next = rowEl.nextElementSibling;
  if (next && next.classList.contains('rank-break')) { next.remove(); return; }
  document.querySelectorAll('.rank-break').forEach(b => b.remove());
  const h2h = UI.tournament.h2h[id];
  const sorted = Object.entries(h2h).sort((a, b) => b[1] - a[1]);
  const makeCol = (title, list) => {
    const col = document.createElement('div');
    col.className = 'break-col';
    const h = document.createElement('div');
    h.className = 'break-head';
    h.textContent = title;
    col.appendChild(h);
    for (const [opp, w] of list) {
      const chip = document.createElement('div');
      chip.className = 'break-chip';
      chip.appendChild(makeSpriteCanvas(opp, 3, false));
      const span = document.createElement('span');
      span.textContent = `${w}–${TOUR_REPS - w} vs ${shortName(CHAR_BY_ID[opp])}`;
      chip.appendChild(span);
      col.appendChild(chip);
    }
    return col;
  };
  const breakEl = document.createElement('div');
  breakEl.className = 'rank-break';
  breakEl.appendChild(makeCol('😤 Dominates', sorted.slice(0, 3)));
  breakEl.appendChild(makeCol('😰 Struggles against', sorted.slice(-3).reverse()));
  rowEl.after(breakEl);
}

function openTournament() {
  showScreen('#screen-tournament');
  if (UI.tourStats) {
    $('#tour-intro').style.display = 'none';
    renderTournamentResults();
  }
}

/* ============================ MODE-AWARE CREW SELECT ============================ */

function openSelect(mode) {
  UI.mode = mode;
  UI.storyChapter = null;  // leaving Story Mode: full roster, free opponent
  UI.storyRun = null;
  UI.voyageOutfit = null;  // …and leaving a voyage behind too
  UI.voyageRun = null;
  UI.loadouts = {};        // re-default movesets for the chosen mode
  UI.playerCrew = [];
  UI.selectedPreset = null;
  const saved = $('#saved-teams'); if (saved) saved.style.display = '';
  storyToggleOpponentRow(true);
  buildRosterGrid();
  const h2 = document.querySelector('#screen-select .select-header h2');
  if (h2) h2.textContent = mode === 'doubles' ? '⚔️ Assemble Your Crew — 2v2 (two fight at once)' : '⚓ Assemble Your Crew';
  const tabs = document.querySelector('#screen-select .tabs');
  if (tabs) tabs.style.display = '';
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'preset'));
  $('#preset-grid').style.display = 'grid';
  $('#custom-builder').style.display = 'none';
  $$('.preset-card').forEach(c => c.classList.remove('selected'));
  renderCrewSlots();
  renderRosterPicks();
  renderSavedTeams();
  refreshOpponentOptions();
  showDetail(CHARACTERS[0].id);
  updateBattleButton();
  showScreen('#screen-select');
}

/* ============================ DOUBLES BATTLE (2v2, pick 4 with bench) ============================ */

function dUnitEl(side, pos) { return document.querySelector(`#screen-doubles .d-unit[data-side="${side}"][data-slot="${pos}"]`); }
function dFighterAt(side, pos) { return UI.dbl.battle.fighterAt(side, pos); }

function startDoublesBattle(playerIds, enemyIds, playerLoadouts, enemyLoadouts, playerLevels, enemyLevels, afterBuild) {
  UI.dbl = {
    battle: new DoublesBattle(playerIds, enemyIds, { playerLoadouts, enemyLoadouts, playerLevels, enemyLevels }),
    lastCrews: { player: [...playerIds], enemy: [...enemyIds], playerLoadouts, enemyLoadouts, playerLevels, enemyLevels },
    busy: false, pending: [], queue: [], curSlot: null, pendingIdx: null,
  };
  if (afterBuild) afterBuild(UI.dbl.battle);
  syncForfeitLabels();
  $('#d-battle-log').innerHTML = '';
  $('#d-turn-label').textContent = '2v2 BATTLE';
  $('#d-prompt').textContent = '';
  $('#d-moves-grid').innerHTML = '';
  showScreen('#screen-doubles');
  for (const side of ['player', 'enemy']) { for (let pos = 0; pos < 2; pos++) dRenderUnit(side, pos); dRenderBench(side); }
  dPlayEvents(UI.dbl.battle.events.slice());   // opening events (intimidate, etc.)
}

function dRenderUnit(side, pos) {
  const unit = dUnitEl(side, pos);
  const f = dFighterAt(side, pos);
  unit.classList.toggle('fainted-unit', !f || !f.alive);
  unit.classList.remove('acting', 'targetable');
  const wrap = unit.querySelector('.sprite-wrap');
  wrap.classList.remove('fainted-anim');
  wrap.classList.toggle('awakened-aura', !!(f && f.awakened));
  wrap.innerHTML = '';
  const card = unit.querySelector('.d-card');
  if (!f) { card.innerHTML = '<div class="d-empty">— no fighter —</div>'; dRenderBench(side); return; }
  wrap.appendChild(makeSpriteCanvas(f.def.id, 7, side === 'player'));
  dRenderCard(side, pos);
  dRenderBench(side);
}

function dRenderCard(side, pos) {
  const f = dFighterAt(side, pos);
  const card = dUnitEl(side, pos).querySelector('.d-card');
  card.innerHTML = `
    <div class="row1"><span class="fname">${f.awakened ? '⚡ ' : ''}${shortName(f.def)}</span><span class="status-chip"></span></div>
    <div class="types-row">${uiTypes(f).map(t => typeBadge(t, true)).join('')}</div>
    <div class="stage-row"></div>
    <div class="hp-track"><div class="hp-fill"></div></div>
    <div class="hp-num"></div>`;
  dUpdateHp(side, pos); dUpdateStatus(side, pos); dUpdateStages(side, pos);
}

function dUpdateHp(side, pos) {
  const f = dFighterAt(side, pos); if (!f) return;
  const fill = dUnitEl(side, pos).querySelector('.hp-fill'); if (!fill) return;
  const pct = f.maxHp ? (f.hp / f.maxHp) * 100 : 0;
  fill.style.width = pct + '%';
  fill.classList.toggle('mid', pct <= 55 && pct > 25);
  fill.classList.toggle('low', pct <= 25);
  dUnitEl(side, pos).querySelector('.hp-num').textContent = `${f.hp} / ${f.maxHp}`;
}
function dUpdateStatus(side, pos) {
  const f = dFighterAt(side, pos); if (!f) return;
  const chip = dUnitEl(side, pos).querySelector('.status-chip'); if (!chip) return;
  if (f.status) { chip.style.display = 'inline-block'; chip.style.background = STATUS_CHIP_COLORS[f.status] || '#666'; chip.textContent = STATUS_ICONS[f.status]; }
  else chip.style.display = 'none';
}
function dUpdateStages(side, pos) {
  const f = dFighterAt(side, pos); if (!f) return;
  const row = dUnitEl(side, pos).querySelector('.stage-row'); if (!row) return;
  const chips = [];
  for (const s of ['atk', 'def', 'satk', 'sdef', 'spd']) {
    const v = f.stages[s]; if (!v) continue;
    const arrows = (v > 0 ? '▲' : '▼').repeat(Math.min(3, Math.abs(v)));
    chips.push(`<span class="stage-chip ${v > 0 ? 'up' : 'down'}">${STAGE_LABELS[s]} ${arrows}</span>`);
  }
  row.innerHTML = chips.join(''); row.style.display = chips.length ? 'flex' : 'none';
}

function dRenderBench(side) {
  const el = document.querySelector(`#screen-doubles .d-bench[data-side="${side}"]`);
  if (!el || !UI.dbl) return;
  const s = UI.dbl.battle.sides[side];
  el.innerHTML = '';
  s.crew.forEach((f, i) => {
    if (s.field.includes(i)) return;          // currently on the front line
    const chip = document.createElement('div');
    chip.className = 'bench-chip' + (f.alive ? '' : ' dead');
    chip.appendChild(makeSpriteCanvas(f.def.id, 2, side === 'player'));
    chip.title = `${f.name} — ${f.hp}/${f.maxHp}${f.alive ? '' : ' (down)'}`;
    el.appendChild(chip);
  });
}

function dFloat(side, pos, text, color) {
  const zone = dUnitEl(side, pos).querySelector('.combatant');
  const el = document.createElement('div'); el.className = 'float-num'; el.style.color = color; el.textContent = text;
  zone.appendChild(el); setTimeout(() => el.remove(), 1000);
}
function dLog(msg) {
  const log = $('#d-battle-log');
  log.querySelectorAll('.latest').forEach(l => l.classList.remove('latest'));
  const div = document.createElement('div'); div.className = 'logline latest'; div.textContent = msg;
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}
function dSetMovesEnabled(on) { document.querySelectorAll('#d-moves-grid .move-btn').forEach(b => b.disabled = !on); }

async function dPlayEvents(events) {
  UI.dbl.busy = true;
  dSetMovesEnabled(false);
  for (const ev of events) {
    if (!UI.dbl) return;
    switch (ev.t) {
      case 'turnStart': {
        $('#d-turn-label').textContent = 'TURN ' + ev.n;
        const sep = document.createElement('div'); sep.className = 'turnsep'; sep.textContent = '— Turn ' + ev.n + ' —';
        $('#d-battle-log').appendChild(sep); await sleep(110); break;
      }
      case 'log': dLog(ev.msg); await sleep(ev.move ? 300 : 360); break;
      case 'switch': dRenderUnit(ev.side, ev.slot); SFX.status(); await sleep(360); break;
      case 'awaken': {
        const wrap = dUnitEl(ev.side, ev.slot) && dUnitEl(ev.side, ev.slot).querySelector('.sprite-wrap');
        if (wrap) { wrap.classList.add('awaken-flash'); setTimeout(() => wrap.classList.remove('awaken-flash'), 700); }
        dLog(`⚡ ${ev.name} → ${ev.awakenName}!`);
        SFX.win();
        dRenderUnit(ev.side, ev.slot);
        await sleep(900); break;
      }
      case 'anim': {
        const wrap = dUnitEl(ev.side, ev.slot) && dUnitEl(ev.side, ev.slot).querySelector('.sprite-wrap');
        if (!wrap) break;
        if (ev.kind === 'attack' && !ev.status) { wrap.classList.add('attack-pulse'); setTimeout(() => wrap.classList.remove('attack-pulse'), 400); await sleep(190); }
        else if (ev.kind === 'protect' || ev.kind === 'blocked') { wrap.classList.add('guard-flash'); setTimeout(() => wrap.classList.remove('guard-flash'), 420); SFX.status(); await sleep(200); }
        break;
      }
      case 'damage': {
        const wrap = dUnitEl(ev.side, ev.slot).querySelector('.sprite-wrap');
        wrap.classList.add('shake', 'hit-flash'); setTimeout(() => wrap.classList.remove('shake', 'hit-flash'), 450);
        const color = ev.crit ? '#ffd24a' : ev.eff > 1 ? '#ff7a5a' : ev.eff < 1 ? '#9fb8d4' : '#ffffff';
        dFloat(ev.side, ev.slot, '-' + ev.amount, ev.dot ? '#c084fc' : color);
        if (ev.crit || ev.eff > 1) SFX.superHit(); else if (ev.eff < 1) SFX.weakHit(); else SFX.hit();
        dUpdateHp(ev.side, ev.slot); await sleep(360); break;
      }
      case 'heal': dFloat(ev.side, ev.slot, '+' + ev.amount, '#4ade80'); SFX.heal(); dUpdateHp(ev.side, ev.slot); await sleep(320); break;
      case 'status': dUpdateStatus(ev.side, ev.slot); if (ev.status) SFX.status(); await sleep(150); break;
      case 'stat': {
        const arrow = ev.delta > 0 ? '▲' : '▼';
        dFloat(ev.side, ev.slot, ev.stat.toUpperCase() + ' ' + arrow.repeat(Math.min(2, Math.abs(ev.delta))), ev.delta > 0 ? '#5eead4' : '#f59e0b');
        dUpdateStages(ev.side, ev.slot); SFX.status(); await sleep(260); break;
      }
      case 'faint': {
        const unit = dUnitEl(ev.side, ev.slot);
        unit.querySelector('.sprite-wrap').classList.add('fainted-anim');
        unit.classList.add('fainted-unit'); SFX.faint(); dRenderBench(ev.side); await sleep(600); break;
      }
      case 'end': await sleep(700); dShowResult(ev.winner); return;
    }
  }
  UI.dbl.busy = false;
  if (!UI.dbl || UI.dbl.battle.over) return;
  if (UI.dbl.battle.awaiting) { dPromptReplace(); return; }
  dStartPlayerInput();
}

function dStartPlayerInput() {
  UI.dbl.pending = [];
  UI.dbl.queue = UI.dbl.battle.livingPositions('player');
  dNextInput();
}
function dNextInput() {
  dClearTargetable();
  document.querySelectorAll('#screen-doubles .d-unit.acting').forEach(u => u.classList.remove('acting'));
  if (!UI.dbl.queue.length) { dResolveRound(); return; }
  UI.dbl.curSlot = UI.dbl.queue.shift();
  UI.dbl.pendingIdx = null;
  UI.dbl.awakenArmed = false;
  UI.dbl.busy = false;
  dUnitEl('player', UI.dbl.curSlot).classList.add('acting');
  dShowCurrentMoves();
}
function dShowCurrentMoves() {
  const f = dFighterAt('player', UI.dbl.curSlot);
  $('#d-prompt').textContent = `▶ Choose ${shortName(f.def)}'s action`;
  dRenderMoves(f);
}
function dActiveMoveList(f) {
  const armed = UI.dbl.awakenArmed && UI.dbl.battle.canAwaken('player', UI.dbl.curSlot) && f.def.awaken;
  return armed ? f.def.awaken.moves : f.moves;
}
function dRenderMoves(f) {
  const grid = $('#d-moves-grid'); grid.innerHTML = '';
  grid.classList.toggle('awaken-preview', dActiveMoveList(f) !== f.moves);
  const enemies = UI.dbl.battle.livingPositions('enemy');
  dActiveMoveList(f).forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'move-btn'; b.style.borderLeft = `4px solid ${TYPES[m.type].color}`;
    let effHint = '';
    if (m.pow > 0 && enemies.length) {
      const eff = typeEffectiveness(m.type, dFighterAt('enemy', enemies[0]).def.types);
      if (eff === 0) effHint = '<span class="eff-hint zero">✕</span>';
      else if (eff > 1) effHint = '<span class="eff-hint up">▲▲</span>';
      else if (eff < 1) effHint = '<span class="eff-hint down">▼</span>';
    }
    const fxParts = describeMoveFx(m);
    b.innerHTML = `<span class="mv-name">${m.name}</span>
      <span class="mv-meta">${typeBadge(m.type, true)}<span>${m.pow > 0 ? 'PWR ' + m.pow : 'STATUS'}</span><span>ACC ${m.acc}</span>${effHint}</span>
      ${fxParts.length ? `<span class="mv-fx">${fxParts.join(' · ')}</span>` : ''}`;
    b.addEventListener('click', () => dPickMove(i));
    grid.appendChild(b);
  });
  if (UI.dbl.battle.canAwaken('player', UI.dbl.curSlot)) {
    const aw = document.createElement('button');
    aw.className = 'move-btn btn-awaken' + (UI.dbl.awakenArmed ? ' armed' : '');
    const name = f.def.awaken ? f.def.awaken.name : '';
    aw.innerHTML = `<span class="mv-name">⚡ ${UI.dbl.awakenArmed ? 'Awakening armed!' : 'Awaken'}</span><span class="mv-meta">${name} — applies before your move</span>`;
    aw.addEventListener('click', () => { SFX.click(); UI.dbl.awakenArmed = !UI.dbl.awakenArmed; dShowCurrentMoves(); });
    grid.appendChild(aw);
  }
  if (dAvailableBench().length) {
    const sw = document.createElement('button');
    sw.className = 'move-btn d-switch-btn';
    sw.innerHTML = `<span class="mv-name">🔄 Switch out</span><span class="mv-meta">bring in a reserve (uses this fighter's turn)</span>`;
    sw.addEventListener('click', () => dPickSwitch());
    grid.appendChild(sw);
  }
  dSetMovesEnabled(true);
}
function dAvailableBench() {
  if (!UI.dbl) return [];
  return UI.dbl.battle.benchIndices('player').filter(i => !UI.dbl.pending.some(a => a.type === 'switch' && a.toCrewIdx === i));
}
function dPickMove(idx) {
  if (UI.dbl.busy) return;
  const f = dFighterAt('player', UI.dbl.curSlot);
  const mv = dActiveMoveList(f)[idx], fx = mv.fx || {};
  // spread / team / ally / redirect choose no target; single-target attacks & debuffs do
  const needsTarget = !fx.spread && (mv.pow > 0 || fx.enemy || fx.sleep || fx.stun);
  const enemies = UI.dbl.battle.livingPositions('enemy');
  if (!needsTarget) return dRecord(idx, null);
  if (enemies.length <= 1) return dRecord(idx, { side: 'enemy', pos: enemies[0] });
  UI.dbl.pendingIdx = idx;
  $('#d-prompt').textContent = `🎯 ${mv.name}: tap the enemy to hit`;
  dSetMovesEnabled(false);
  enemies.forEach(pos => {
    const u = dUnitEl('enemy', pos);
    u.classList.add('targetable');
    u._targetHandler = () => dPickTarget(pos);
    u.addEventListener('click', u._targetHandler);
  });
}
function dPickTarget(pos) { dRecord(UI.dbl.pendingIdx, { side: 'enemy', pos }); }
function dClearTargetable() {
  document.querySelectorAll('#screen-doubles .d-unit.targetable').forEach(u => {
    u.classList.remove('targetable');
    if (u._targetHandler) { u.removeEventListener('click', u._targetHandler); u._targetHandler = null; }
  });
}
function dRecord(idx, target) {
  const act = { pos: UI.dbl.curSlot, type: 'move', idx, target };
  if (UI.dbl.awakenArmed && UI.dbl.battle.canAwaken('player', UI.dbl.curSlot)) act.awaken = true;
  UI.dbl.pending.push(act);
  SFX.click();
  dClearTargetable();
  dNextInput();
}
function dPickSwitch() {
  if (UI.dbl.busy) return;
  const avail = dAvailableBench();
  if (!avail.length) return;
  dSetMovesEnabled(false);
  dShowBench(`🔄 Switch — choose a reserve to bring in`, avail, idx => dRecordSwitch(idx), true);
}
function dRecordSwitch(idx) {
  UI.dbl.pending.push({ pos: UI.dbl.curSlot, type: 'switch', toCrewIdx: idx });
  SFX.click();
  dNextInput();
}
function dShowBench(prompt, avail, onPick, allowCancel) {
  $('#d-prompt').textContent = prompt;
  const grid = $('#d-moves-grid'); grid.innerHTML = '';
  avail.forEach(idx => {
    const f = UI.dbl.battle.sides.player.crew[idx];
    const b = document.createElement('button'); b.className = 'move-btn d-bench-card';
    b.appendChild(makeSpriteCanvas(f.def.id, 4, false));
    const info = document.createElement('span'); info.className = 'bench-info';
    info.innerHTML = `<span class="mv-name">${shortName(f.def)}</span>
      <span class="mv-meta">${f.def.types.map(t => typeBadge(t, true)).join('')}<span>${f.hp}/${f.maxHp}</span></span>`;
    b.appendChild(info);
    b.addEventListener('click', () => onPick(idx));
    grid.appendChild(b);
  });
  if (allowCancel) {
    const c = document.createElement('button'); c.className = 'move-btn';
    c.innerHTML = '<span class="mv-name">↩ Back</span>';
    c.addEventListener('click', () => { SFX.click(); dShowCurrentMoves(); });
    grid.appendChild(c);
  }
}
function dPromptReplace() {
  const pos = UI.dbl.battle.awaiting.positions[0];
  const avail = UI.dbl.battle.benchIndices('player');
  document.querySelectorAll('#screen-doubles .d-unit.acting').forEach(u => u.classList.remove('acting'));
  dUnitEl('player', pos).classList.add('acting');
  dShowBench(`💀 Position open — send out the next fighter!`, avail, idx => {
    SFX.click();
    const evs = UI.dbl.battle.submitReplace(pos, idx);
    dRenderUnit('player', pos);
    dPlayEvents(evs);
  }, false);
}
function dResolveRound() {
  document.querySelectorAll('#screen-doubles .d-unit.acting').forEach(u => u.classList.remove('acting'));
  $('#d-prompt').textContent = '';
  dSetMovesEnabled(false);
  dPlayEvents(UI.dbl.battle.playRound(UI.dbl.pending));
}
function dShowResult(winner) {
  UI.dbl.busy = false;
  if (UI.voyageRun) return voyageFinishBattle(winner, UI.dbl.battle);
  if (UI.storyRun) return storyFinish(winner);
  showResultGeneric(winner, UI.dbl.battle);
}

/* ============================ STORY MODE ============================ */

function storyState() { if (!UI.story) UI.story = loadStory(); return UI.story; }
function storySave() { saveStory(storyState()); }

function openStory() {
  storyState();
  UI.storyChapter = null;
  UI.storyRun = null;
  UI.voyageOutfit = null;
  UI.voyageRun = null;
  renderStoryMap();
  showScreen('#screen-story');
}

function renderStoryMap() {
  const st = storyState();
  $('#story-berries').textContent = '🪙 ' + st.berries.toLocaleString();
  const map = $('#story-map');
  map.innerHTML = '';
  let sea = null;
  STORY.forEach((ch, i) => {
    if (ch.sea !== sea) {
      sea = ch.sea;
      const h = document.createElement('div');
      h.className = 'sea-head';
      h.textContent = '⚓ ' + sea;
      map.appendChild(h);
    }
    const cleared = isChapterCleared(st, ch.id);
    const unlocked = isChapterUnlocked(st, i);
    const card = document.createElement('div');
    card.className = 'chapter-card' + (cleared ? ' cleared' : '') + (unlocked ? '' : ' locked');
    const status = cleared ? '✓ cleared' : unlocked ? '▶ next' : '🔒 locked';
    card.innerHTML = `
      <div class="ch-flag">${ch.flag}</div>
      <div class="ch-body">
        <div class="ch-top"><span class="ch-name">${i + 1}. ${ch.name}</span><span class="ch-status">${status}</span></div>
        <div class="ch-blurb">${ch.blurb}</div>
        <div class="ch-meta">Foes Lv ${ch.level} · bring ${ch.size} vs ${ch.foes.length}${ch.mode === 'doubles' ? ' · 2v2 doubles' : ''} · 🪙 ${ch.berries}</div>
      </div>
      <div class="ch-foes"></div>`;
    const foesEl = card.querySelector('.ch-foes');
    ch.foes.forEach(id => foesEl.appendChild(makeSpriteCanvas(id, 3, false)));
    if (unlocked) card.addEventListener('click', () => { SFX.click(); openStoryChapter(i); });
    map.appendChild(card);
  });
}

/* Chapter briefing → the crew builder, restricted to your recruits. */
function openStoryChapter(idx) {
  const st = storyState();
  const ch = STORY[idx];
  UI.storyChapter = ch;
  UI.mode = ch.mode === 'doubles' ? 'doubles' : 'single';
  UI.loadouts = {};
  UI.selectedPreset = null;
  UI.playerCrew = (st.party || []).filter(id => st.roster.indexOf(id) >= 0).slice(0, ch.size);
  UI.playerCrew.forEach(ensureLoadout);

  const h2 = document.querySelector('#screen-select .select-header h2');
  if (h2) h2.textContent = `${ch.flag} ${ch.name} — choose ${ch.size} ${ch.size === 1 ? 'fighter' : 'fighters'}`;
  const tabs = document.querySelector('#screen-select .tabs');
  if (tabs) tabs.style.display = 'none';
  $('#preset-grid').style.display = 'none';
  $('#custom-builder').style.display = 'grid';
  const saved = $('#saved-teams'); if (saved) saved.style.display = 'none';
  storyToggleOpponentRow(false);

  buildRosterGrid();
  renderCrewSlots();
  showDetail(UI.playerCrew[0] || st.roster[0]);
  updateBattleButton();
  showScreen('#screen-select');
}

/* Story fights a fixed foe, so the opponent picker is hidden there. */
function storyToggleOpponentRow(show) {
  const sel = $('#opponent-select');
  const label = document.querySelector('.vs-row label');
  if (sel) sel.style.display = show ? '' : 'none';
  if (label) label.style.display = show ? '' : 'none';
}

function startStoryBattle() {
  const st = storyState(), ch = UI.storyChapter;
  st.party = [...UI.playerCrew];
  storySave();
  const loadouts = UI.playerCrew.map(id => loadoutMoves(id));
  const levels = UI.playerCrew.map(id => levelOf(st, id));
  UI.storyRun = { chapterId: ch.id, party: [...UI.playerCrew] };
  if (ch.mode === 'doubles') startDoublesBattle([...UI.playerCrew], [...ch.foes], loadouts, undefined, levels, ch.level);
  else startBattle([...UI.playerCrew], [...ch.foes], loadouts, undefined, levels, ch.level);
}

/* Battle over: bank the XP, berries and recruits, then show the spoils. */
function storyFinish(winner) {
  const st = storyState(), run = UI.storyRun;
  const ch = STORY_BY_ID[run.chapterId];
  const res = resolveChapter(st, ch, winner === 'player', run.party);
  storySave();
  UI.storyRun = null;
  renderStoryResult(ch, res);
  showScreen('#screen-story-result');
}

function renderStoryResult(ch, res) {
  const st = storyState();
  const t = $('#sr-title');
  t.textContent = res.won ? (res.first ? 'ISLAND CLEARED!' : 'VICTORY!') : 'DEFEATED...';
  t.className = 'result-title ' + (res.won ? 'win' : 'lose');
  $('#sr-sub').textContent = res.won
    ? `${ch.flag} ${ch.name} is behind you. The log pose turns.`
    : `${ch.name} was too much this time — train up and sail back in.`;

  const box = $('#sr-rewards');
  box.innerHTML = '';
  const line = (label, value) => {
    const d = document.createElement('div');
    d.className = 'sr-line';
    d.innerHTML = `<span class="sr-label">${label}</span><span class="sr-value">${value}</span>`;
    box.appendChild(d);
  };
  line('⭐ XP earned', `+${res.xpEach} to each fighter`);
  if (res.berries) line('🪙 Berries', `+${res.berries.toLocaleString()}  (total ${st.berries.toLocaleString()})`);

  if (res.levelUps.length) {
    const d = document.createElement('div');
    d.className = 'sr-line';
    d.innerHTML = `<span class="sr-label">📈 Level up</span><span class="sr-value">${res.levelUps.map(l => `${shortName(CHAR_BY_ID[l.id])} Lv ${l.from}→${l.to}`).join(' · ')}</span>`;
    box.appendChild(d);
  }
  if (res.recruited.length) {
    const d = document.createElement('div');
    d.className = 'sr-recruits';
    d.innerHTML = '<div class="sr-label">🤝 Joined your crew</div>';
    const row = document.createElement('div');
    row.className = 'sr-faces';
    for (const id of res.recruited) {
      const f = document.createElement('div');
      f.className = 'rf';
      f.appendChild(makeSpriteCanvas(id, 4, false));
      const nm = document.createElement('span');
      nm.textContent = `${shortName(CHAR_BY_ID[id])} Lv ${levelOf(st, id)}`;
      f.appendChild(nm);
      row.appendChild(f);
    }
    d.appendChild(row);
    box.appendChild(d);
  }
  const done = STORY.every(c => isChapterCleared(st, c.id));
  if (done) line('👑 Voyage complete', 'You are the Pirate King. Free Battle awaits.');
  $('#btn-sr-retry').style.display = res.won ? 'none' : '';
  (res.won ? SFX.win : SFX.lose)();
}

/* ---- crew & training ---- */
function openCrewModal() { renderCrewList(); $('#modal-crew').classList.add('open'); }
function closeCrewModal() { $('#modal-crew').classList.remove('open'); }
function renderCrewList() {
  const st = storyState();
  $('#crew-berries').textContent = '🪙 ' + st.berries.toLocaleString();
  const list = $('#crew-list');
  list.innerHTML = '';
  const ordered = [...st.roster].sort((a, b) => levelOf(st, b) - levelOf(st, a));
  for (const id of ordered) {
    const c = CHAR_BY_ID[id];
    const lv = levelOf(st, id), xp = st.xp[id] || 0, need = xpToNext(lv);
    const maxed = lv >= STORY_MAX_LEVEL;
    const row = document.createElement('div');
    row.className = 'crew-row';
    row.appendChild(makeSpriteCanvas(id, 3, false));
    const info = document.createElement('div');
    info.className = 'crew-info';
    info.innerHTML = `<div class="crew-name">${shortName(c)} <span class="crew-lv">Lv ${lv}</span></div>
      <div class="xp-track"><div class="xp-fill" style="width:${maxed ? 100 : Math.min(100, xp / need * 100)}%"></div></div>
      <div class="crew-sub">${maxed ? 'MAX LEVEL' : xp + ' / ' + need + ' XP'}</div>`;
    row.appendChild(info);
    const cost = trainCost(lv);
    const btn = document.createElement('button');
    btn.className = 'btn';
    if (maxed) { btn.textContent = 'MAX'; btn.disabled = true; }
    else {
      btn.textContent = `Train 🪙${cost}`;
      btn.disabled = st.berries < cost;
      btn.addEventListener('click', () => {
        if (trainFighter(st, id).ok) { SFX.heal(); storySave(); renderCrewList(); renderStoryMap(); }
      });
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
}

/* ============================ UNCHARTED WATERS ============================ */

/* Forfeiting means something different at sea, so the button says so. */
function syncForfeitLabels() {
  const voyage = !!UI.voyageRun;
  const label = !voyage ? '🏳️ Forfeit'
    : UI.voyageRun.rations > 0 ? `🏳️ Cut & Run (🍖 ${UI.voyageRun.rations})` : '🏳️ Abandon Voyage';
  for (const sel of ['#btn-forfeit', '#d-btn-forfeit']) {
    const b = $(sel);
    if (b) b.textContent = label;
  }
}

function worldSave() {
  const st = storyState();
  const w = worldEnsure(st);
  w.run = UI.voyageRun || null;
  saveStory(st);
}

function openWorld() {
  const st = storyState();
  const w = worldEnsure(st);
  UI.storyChapter = null;
  UI.storyRun = null;
  UI.voyageOutfit = null;
  UI.mode = 'single';
  // a voyage left half-sailed in the save picks up exactly where it stopped:
  // the chart is a pure function of its seed, so only the seed was ever stored
  if (!UI.voyageRun && w.run) {
    UI.voyageRun = w.run;
    UI.voyageChart = generateChart(w.run.seaId, w.run.seed);
    UI.loadouts = Object.assign({}, w.run.loadouts || {});
  }
  $('#world-berries').textContent = '🪙 ' + st.berries.toLocaleString();
  if (UI.voyageRun && UI.voyageChart) return showVoyage();
  UI.voyageRun = null;
  UI.voyageChart = null;
  $('#world-seas').style.display = '';
  $('#world-run').style.display = 'none';
  $('#btn-world-turnback').style.display = 'none';
  renderSeaPicker();
  showScreen('#screen-world');
}

function renderSeaPicker() {
  const st = storyState();
  const w = worldEnsure(st);
  const box = $('#world-seas');
  box.innerHTML = '';
  for (const sea of SEAS) {
    const open = seaUnlocked(st, sea);
    const made = w.made[sea.id] || 0;
    const gate = sea.gate ? STORY_BY_ID[sea.gate] : null;
    const card = document.createElement('div');
    card.className = 'sea-card' + (open ? '' : ' locked');
    card.innerHTML = `
      <div class="sc-flag">${sea.flag}</div>
      <div class="sc-body">
        <div class="sc-top">
          <span class="sc-name">${sea.name}</span>
          <span class="sc-status">${open ? (made ? '⚓ made port ×' + made : '▶ open water') : '🔒 clear ' + (gate ? gate.name : sea.gate)}</span>
        </div>
        <div class="sc-blurb">${sea.blurb}</div>
        <div class="sc-meta">Foes Lv ${sea.lo}–${sea.hi} · ${sea.cols} islands to ${sea.portName} · 🪙 harbour bonus ${sea.portBerries.toLocaleString()}</div>
      </div>`;
    if (open) card.addEventListener('click', () => { SFX.click(); openVoyageOutfit(sea.id); });
    box.appendChild(card);
  }
}

/* Outfitting reuses the crew builder, restricted to your recruits — the same
   trick Story Mode plays, except a landing party is one to four, not exactly N. */
function openVoyageOutfit(seaId) {
  const st = storyState();
  const sea = SEA_BY_ID[seaId];
  UI.voyageOutfit = seaId;
  UI.storyChapter = null;
  UI.mode = 'single';
  UI.loadouts = {};
  UI.selectedPreset = null;
  UI.playerCrew = (st.party || []).filter(id => st.roster.indexOf(id) >= 0).slice(0, VOYAGE_PARTY_MAX);
  if (!UI.playerCrew.length) UI.playerCrew = st.roster.slice(0, VOYAGE_PARTY_MAX);
  UI.playerCrew.forEach(ensureLoadout);

  const h2 = document.querySelector('#screen-select .select-header h2');
  if (h2) h2.textContent = `${sea.flag} ${sea.name} — choose up to ${VOYAGE_PARTY_MAX} for the landing party`;
  const tabs = document.querySelector('#screen-select .tabs');
  if (tabs) tabs.style.display = 'none';
  $('#preset-grid').style.display = 'none';
  $('#custom-builder').style.display = 'grid';
  const saved = $('#saved-teams'); if (saved) saved.style.display = 'none';
  storyToggleOpponentRow(false);

  buildRosterGrid();
  renderCrewSlots();
  showDetail(UI.playerCrew[0] || st.roster[0]);
  updateBattleButton();
  showScreen('#screen-select');
}

function startVoyage() {
  const st = storyState();
  const seaId = UI.voyageOutfit;
  st.party = [...UI.playerCrew];
  const seed = Math.floor(Math.random() * 4294967295) >>> 0;
  UI.voyageChart = generateChart(seaId, seed);
  UI.voyageRun = newVoyage(st, seaId, [...UI.playerCrew], seed);
  UI.voyageRun.loadouts = {};
  for (const id of UI.playerCrew) UI.voyageRun.loadouts[id] = ensureLoadout(id).slice();
  UI.voyageOutfit = null;
  UI.voyageToast = '⚓ Lines cast off. Chart a course east.';
  worldSave();
  openWorld();
}

function showVoyage() {
  $('#world-seas').style.display = 'none';
  $('#world-run').style.display = '';
  $('#btn-world-turnback').style.display = UI.voyageRun.legs >= 1 ? '' : 'none';
  $('#world-berries').textContent = '🪙 ' + storyState().berries.toLocaleString();
  renderChart();
  renderVoyageStatus();
  showScreen('#screen-world');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderChart() {
  const chart = UI.voyageChart, run = UI.voyageRun;
  const box = $('#world-chart');
  box.innerHTML = '';

  // routes first, as an SVG underlay stretched to the box (0-100 in both axes
  // maps straight onto the percentage coordinates the islands are placed at)
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const n of chart.nodes) {
    for (const id of n.to) {
      const m = chart.byId[id];
      if (!m) continue;
      const live = n.id === run.at;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', n.x * 100); line.setAttribute('y1', n.y * 100);
      line.setAttribute('x2', m.x * 100); line.setAttribute('y2', m.y * 100);
      line.setAttribute('stroke', live ? 'rgba(232,184,74,0.8)' : 'rgba(255,255,255,0.13)');
      line.setAttribute('stroke-width', live ? 0.45 : 0.22);
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(line);
    }
  }
  box.appendChild(svg);

  const routes = chartRoutes(chart, run.at).map(n => n.id);
  for (const n of chart.nodes) {
    const here = n.id === run.at;
    const reachable = routes.indexOf(n.id) >= 0;
    const been = run.visited.indexOf(n.id) >= 0;
    const el = document.createElement('div');
    el.className = 'wnode' + (here ? ' here' : reachable ? ' reachable' : been ? ' visited' : ' far')
      + (n.kind === 'port' ? ' port-node' : '');
    el.style.left = (n.x * 100) + '%';
    el.style.top = (n.y * 100) + '%';
    // only water you can actually reach shows its colours; the rest is fog
    const known = here || reachable || been || n.kind === 'port';
    const lv = n.fight ? `<div class="wn-lv">Lv ${voyageFoeLevel(run, n)}</div>` : '';
    el.innerHTML = known
      ? `<div class="wn-flag">${n.flag}</div><div>${n.kind === 'port' ? n.title : VOYAGE_KIND_BY_ID[n.kind] ? VOYAGE_KIND_BY_ID[n.kind].name : n.title}</div>${reachable ? lv : ''}`
      : '<div class="wn-flag">🌫️</div><div>uncharted</div>';
    if (reachable) {
      el.title = n.kind === 'port' ? 'Make port and bank the hold' : n.blurb;
      el.addEventListener('click', () => { SFX.click(); worldSail(n.id); });
    }
    box.appendChild(el);
  }
}

function renderVoyageStatus() {
  const st = storyState(), run = UI.voyageRun;
  const box = $('#world-status');
  box.innerHTML = '';
  const crew = document.createElement('div');
  crew.className = 'wcrew';
  for (const id of run.party) {
    const frac = run.hp[id];
    const pip = document.createElement('div');
    pip.className = 'wpip' + (frac > 0 ? '' : ' down');
    pip.appendChild(makeSpriteCanvas(id, 3, false));
    const info = document.createElement('div');
    info.className = 'wp-info';
    const status = run.status[id] ? ` <span class="wp-status">${STATUS_ICONS[run.status[id]] || ''}</span>` : '';
    const cls = frac > 0.5 ? '' : frac > 0.22 ? ' mid' : ' low';
    info.innerHTML = `<div class="wp-name">${shortName(CHAR_BY_ID[id])} <span class="wn-lv">Lv ${levelOf(st, id)}</span>${status}</div>
      <div class="hp-track"><div class="hp-fill${cls}" style="width:${Math.max(0, frac) * 100}%"></div></div>`;
    pip.appendChild(info);
    crew.appendChild(pip);
  }
  box.appendChild(crew);

  const hold = document.createElement('div');
  hold.className = 'whold';
  hold.innerHTML = `🍖 ${run.rations} rations · ⚓ Hold: ${run.hold.xp.toLocaleString()} XP · 🪙 ${run.hold.berries.toLocaleString()}
    <span class="wh-sub">${UI.voyageToast || `Leg ${run.legs} · nothing is yours until you make port`}</span>`;
  box.appendChild(hold);
}

function worldSail(nodeId) {
  const node = voyageSail(UI.voyageChart, UI.voyageRun, nodeId);
  if (!node) return;
  UI.voyageToast = null;
  worldSave();
  if (node.kind === 'port') return endVoyage('port');
  renderChart();
  renderVoyageStatus();
  openEncounter(node);
}

/* ---- the encounter card ---- */

const THREAT_LABELS = [
  { cls: 'calm', text: '⚓ Calm' },
  { cls: 'choppy', text: '🌊 Choppy' },
  { cls: 'rough', text: '🌀 Rough' },
  { cls: 'deadly', text: '💀 Deadly' },
];

function closeEncounter() { $('#modal-encounter').classList.remove('open'); }

function encButton(label, cls, fn) {
  const b = document.createElement('button');
  b.className = 'btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  b.addEventListener('click', () => { SFX.click(); fn(); });
  return b;
}

function openEncounter(node) {
  const st = storyState(), run = UI.voyageRun;
  UI.voyageNode = node;
  const lv = voyageFoeLevel(run, node);
  const threat = THREAT_LABELS[voyageThreat(st, run, node)];

  $('#enc-title').textContent = `${node.flag} ${node.title}`;
  const th = $('#enc-threat');
  th.className = 'threat ' + threat.cls;
  th.textContent = threat.text;
  $('#enc-blurb').textContent = node.blurb;

  const foes = $('#enc-foes');
  foes.innerHTML = '';
  for (const id of node.foes) {
    const ef = document.createElement('div');
    ef.className = 'ef';
    ef.appendChild(makeSpriteCanvas(id, 6, true));
    const nm = document.createElement('span');
    nm.textContent = shortName(CHAR_BY_ID[id]);
    ef.appendChild(nm);
    const l = document.createElement('span');
    l.className = 'ef-lv';
    l.textContent = 'Lv ' + lv;
    ef.appendChild(l);
    foes.appendChild(ef);
  }

  const xp = nodeXp(node, lv), berries = nodeBerries(node, lv);
  const pay = [];
  if (xp) pay.push(`+${xp.toLocaleString()} XP`);
  if (berries) pay.push(`+🪙 ${berries.toLocaleString()}`);
  $('#enc-payout').textContent = pay.length ? 'Into the hold: ' + pay.join(' · ') : '';

  const duels = $('#enc-duelists');
  duels.innerHTML = '';
  const actions = $('#enc-actions');
  actions.innerHTML = '';

  if (node.fight === 'duel') {
    // one-on-one, and WHICH of your crew takes it is the decision of the mode:
    // this engine has very little middle ground, so the type matchup decides
    duels.appendChild(Object.assign(document.createElement('div'), {
      className: 'enc-payout', textContent: 'One on one. Who takes this?', style: 'grid-column:1/-1',
    }));
    for (const id of voyageStanding(run)) {
      const card = document.createElement('div');
      card.className = 'duelist';
      card.appendChild(makeSpriteCanvas(id, 5, false));
      const v = duelVerdict(id, node.foes[0], lv);
      const frac = run.hp[id];
      const cls = frac > 0.5 ? '' : frac > 0.22 ? ' mid' : ' low';
      const nm = document.createElement('div');
      nm.className = 'd-name';
      nm.textContent = `${shortName(CHAR_BY_ID[id])} Lv ${levelOf(st, id)}`;
      card.appendChild(nm);
      const track = document.createElement('div');
      track.className = 'hp-track';
      track.innerHTML = `<div class="hp-fill${cls}" style="width:${frac * 100}%"></div>`;
      card.appendChild(track);
      const verdict = document.createElement('div');
      verdict.className = 'd-verdict ' + v.cls;
      verdict.textContent = v.text;
      card.appendChild(verdict);
      card.addEventListener('click', () => { SFX.click(); voyageEngage(id); });
      duels.appendChild(card);
    }
  } else if (node.fight) {
    actions.appendChild(encButton('⚔️ Engage', 'btn-gold', () => voyageEngage(null)));
  } else {
    const label = node.kind === 'storm' ? '🌩️ Ride it out' : node.kind === 'anchorage' ? '⚓ Drop anchor' : '🫱 Take it';
    actions.appendChild(encButton(label, 'btn-gold', () => voyageEvent(node)));
  }

  if (node.fight && run.rations > 0) {
    actions.appendChild(encButton(`🍖 Use a ration (${run.rations})`, '', () => {
      if (useRation(run)) { SFX.heal(); worldSave(); renderVoyageStatus(); openEncounter(node); }
    }));
  }
  $('#modal-encounter').classList.add('open');
}

/* Ask the engine itself how this duel looks — the same tempo score its AI uses
   to decide who to send in. */
function duelVerdict(id, foeId, lv) {
  const st = storyState();
  const probe = new Battle([id], [foeId], { playerLevels: [levelOf(st, id)], enemyLevels: lv, playerLoadouts: [loadoutMoves(id)] });
  const me = probe.sides.player.crew[0], them = probe.sides.enemy.crew[0];
  me.hp = Math.max(1, Math.round(me.maxHp * UI.voyageRun.hp[id]));
  const s = probe.matchupScore(me, them);
  if (s > 0.12) return { cls: 'good', text: 'Favourable' };
  if (s < -0.12) return { cls: 'bad', text: 'Grim' };
  return { cls: 'even', text: 'Even' };
}

/* Islands with no fight on them resolve in place, then report what happened. */
function voyageEvent(node) {
  const st = storyState(), run = UI.voyageRun;
  const out = voyageResolveEvent(st, run, node, Math.random);
  worldSave();
  const bits = [];
  if (out.berries) bits.push(`🪙 +${out.berries.toLocaleString()} into the hold`);
  if (out.xp) bits.push(`+${out.xp.toLocaleString()} XP`);
  if (out.rations) bits.push(`🍖 +${out.rations} ration`);
  if (out.healed.length) bits.push(`💚 the crew rests — ${out.healed.map(id => shortName(CHAR_BY_ID[id])).join(', ')} patched up`);
  if (out.hurt.length) bits.push(`💥 the squall batters everyone`);
  if (out.ko.length) bits.push(`☠️ ${out.ko.map(id => shortName(CHAR_BY_ID[id])).join(', ')} went down`);
  if (out.recruit) bits.push(`🤝 ${CHAR_BY_ID[out.recruit.id].name} joins at the ledger — if you make it home`);

  $('#enc-blurb').textContent = bits.length ? bits.join(' · ') : 'Nothing but open water.';
  $('#enc-payout').textContent = '';
  $('#enc-duelists').innerHTML = '';
  const actions = $('#enc-actions');
  actions.innerHTML = '';
  actions.appendChild(encButton('⛵ Sail on', 'btn-gold', () => {
    closeEncounter();
    if (run.over === 'wipe') return endVoyage('wipe');
    UI.voyageToast = bits[0] || null;
    showVoyage();
  }));
  (out.ko.length ? SFX.lose : out.healed.length ? SFX.heal : SFX.click)();
  renderVoyageStatus();
}

/* ---- fights ---- */

/* Fighter freezes maxHp at construction, so carried damage has to be grafted
   on after the crew is built but before anything is drawn. */
function voyageGraft(battle, ids) {
  const run = UI.voyageRun;
  battle.sides.player.crew.forEach((f, i) => {
    const id = ids[i];
    if (!id || run.hp[id] === undefined) return;
    f.hp = Math.max(1, Math.round(f.maxHp * run.hp[id]));
    f.status = run.status[id] || null;
  });
}

function voyageEngage(duelistId) {
  const st = storyState(), run = UI.voyageRun, node = UI.voyageNode;
  closeEncounter();
  const ids = duelistId ? [duelistId] : voyageStanding(run);
  if (!ids.length) return endVoyage('wipe');
  UI.voyageIds = ids;
  const levels = ids.map(id => levelOf(st, id));
  const lv = voyageFoeLevel(run, node);
  const graft = b => voyageGraft(b, ids);
  if (node.fight === 'doubles' && ids.length >= 2) {
    UI.mode = 'doubles';
    startDoublesBattle(ids, node.foes.slice(), ids.map(id => loadoutMoves(id)), undefined, levels, lv, graft);
  } else {
    UI.mode = 'single';
    startBattle(ids, node.foes.slice(), ids.map(id => loadoutMoves(id)), undefined, levels, lv, graft);
  }
}

function voyageFinishBattle(winner, battle) {
  const st = storyState(), run = UI.voyageRun, node = UI.voyageNode;
  const ids = UI.voyageIds || [];
  // never trust `winner` alone: a 1v1 can never report a draw, and forfeiting
  // short-circuits the engine entirely — so read the crew back off the battle
  const entries = battle.sides.player.crew.map((f, i) => ({
    id: ids[i], hp: f.alive ? f.hp / f.maxHp : 0, status: f.status,
  }));
  const standing = battle.sides.player.crew.some(f => f.alive);
  const res = voyageResolveBattle(st, run, node, winner === 'player' && standing, entries);
  UI.mode = 'single';
  worldSave();
  if (run.over === 'wipe') return endVoyage('wipe');
  const bits = [res.won ? '⚔️ The water is yours' : '🩸 Beaten off, but still afloat'];
  if (res.xp) bits.push(`+${res.xp.toLocaleString()} XP`);
  if (res.berries) bits.push(`🪙 +${res.berries.toLocaleString()}`);
  if (res.ko.length) bits.push(`☠️ ${res.ko.map(id => shortName(CHAR_BY_ID[id])).join(', ')} down`);
  UI.voyageToast = bits.join(' · ');
  showVoyage();
}

/* Forfeiting a sea fight is Cut & Run: a ration and blood to break off and
   keep sailing — or, with the stores empty, abandoning the voyage outright. */
function worldCutAndRun() {
  const run = UI.voyageRun;
  const battle = UI.mode === 'doubles' && UI.dbl ? UI.dbl.battle : UI.battle;
  const ids = UI.voyageIds || [];
  if (run.rations <= 0) {
    if (!confirm('No rations left — breaking off now means abandoning the voyage. The hold pays a quarter of the XP and none of the coin. Abandon?')) return;
    for (const id of run.party) run.hp[id] = 0;
    return endVoyage('wipe');
  }
  if (!confirm('Cut and run? One ration and 15% of everyone\'s health, and this island\'s spoils are lost — but the voyage goes on.')) return;
  voyageSync(run, battle.sides.player.crew.map((f, i) => ({
    id: ids[i], hp: f.alive ? f.hp / f.maxHp : 0, status: f.status,
  })));
  voyageCutAndRun(run);
  UI.mode = 'single';
  worldSave();
  if (run.over === 'wipe') return endVoyage('wipe');
  UI.voyageToast = '🏳️ You broke off and ran. One ration spent.';
  showVoyage();
}

/* ---- the ledger ---- */

function endVoyage(how) {
  const st = storyState(), run = UI.voyageRun;
  const res = voyageBank(st, run, how);
  UI.voyageRun = null;
  UI.voyageChart = null;
  UI.voyageNode = null;
  UI.voyageIds = null;
  UI.voyageToast = null;
  UI.mode = 'single';
  saveStory(st);
  renderVoyageResult(SEA_BY_ID[run.seaId], run, res);
  showScreen('#screen-voyage-result');
}

function renderVoyageResult(sea, run, res) {
  const st = storyState();
  const t = $('#vr-title');
  t.textContent = res.title;
  t.className = 'result-title ' + (res.how === 'wipe' ? 'lose' : 'win');
  $('#vr-sub').textContent = res.how === 'port'
    ? `${sea.flag} ${run.legs} islands crossed and the lamps of ${sea.portName} dead ahead. Every beri is yours.`
    : res.how === 'turnback'
      ? `You came about ${run.legs} islands out. Half a hold beats no hold — and no crew lost to the deep.`
      : `${sea.name} closed over the lot of you. The coin is gone; the crew will mend.`;

  const box = $('#vr-rewards');
  box.innerHTML = '';
  const line = (label, value) => {
    const d = document.createElement('div');
    d.className = 'sr-line';
    d.innerHTML = `<span class="sr-label">${label}</span><span class="sr-value">${value}</span>`;
    box.appendChild(d);
  };
  line('🧭 Islands crossed', run.legs);
  line('⭐ XP banked', `+${res.xpEach.toLocaleString()} to each of the landing party`);
  line('🪙 Berries', res.berries
    ? `+${res.berries.toLocaleString()}${res.bonus ? ` (incl. 🏮 ${res.bonus.toLocaleString()} harbour bonus)` : ''}  ·  total ${st.berries.toLocaleString()}`
    : 'none — the sea took the hold');
  if (res.levelUps.length) {
    line('📈 Level up', res.levelUps.map(l => `${shortName(CHAR_BY_ID[l.id])} Lv ${l.from}→${l.to}`).join(' · '));
  }
  if (res.down.length) {
    line('☠️ Went down', res.down.map(id => shortName(CHAR_BY_ID[id])).join(' · ') + ' — patched up back on land');
  }
  if (res.recruited.length) {
    const d = document.createElement('div');
    d.className = 'sr-recruits';
    d.innerHTML = '<div class="sr-label">🤝 Pulled from the water</div>';
    const row = document.createElement('div');
    row.className = 'sr-faces';
    for (const id of res.recruited) {
      const f = document.createElement('div');
      f.className = 'rf';
      f.appendChild(makeSpriteCanvas(id, 4, false));
      const nm = document.createElement('span');
      nm.textContent = `${shortName(CHAR_BY_ID[id])} Lv ${levelOf(st, id)}`;
      f.appendChild(nm);
      row.appendChild(f);
    }
    d.appendChild(row);
    box.appendChild(d);
  }
  (res.how === 'wipe' ? SFX.lose : SFX.win)();
}

/* ============================ WIRING ============================ */

function initUI() {
  buildSelectScreen();
  buildTypeChart();

  $('#btn-setsail').addEventListener('click', () => { SFX.click(); openSelect('single'); });
  $('#btn-doubles').addEventListener('click', () => { SFX.click(); openSelect('doubles'); });
  $('#btn-tournament').addEventListener('click', () => { SFX.click(); openTournament(); });
  $('#btn-tour-back').addEventListener('click', () => { SFX.click(); showScreen('#screen-title'); });
  $('#btn-tour-run').addEventListener('click', () => { SFX.click(); startTournament(); });
  $('#btn-tour-rerun').addEventListener('click', () => { SFX.click(); startTournament(); });

  let libReturnTo = '#screen-title';
  $('#btn-library').addEventListener('click', () => { SFX.click(); libReturnTo = '#screen-title'; buildLibrary(); showScreen('#screen-library'); });
  $('#btn-select-library').addEventListener('click', () => { SFX.click(); libReturnTo = '#screen-select'; buildLibrary(); showScreen('#screen-library'); });
  $('#btn-lib-back').addEventListener('click', () => { SFX.click(); showScreen(libReturnTo); });
  $('#lib-sort').addEventListener('change', e => { libSort = e.target.value; renderLibGrid(); });
  $('#btn-typechart').addEventListener('click', () => { SFX.click(); $('#modal-typechart').classList.add('open'); });
  $('#btn-tc-close').addEventListener('click', () => $('#modal-typechart').classList.remove('open'));
  $('#btn-tc-close2').addEventListener('click', () => $('#modal-typechart').classList.remove('open'));
  $('#btn-back-title').addEventListener('click', () => { SFX.click(); showScreen('#screen-title'); });

  // tabs
  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    SFX.click();
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const custom = tab.dataset.tab === 'custom';
    $('#preset-grid').style.display = custom ? 'none' : 'grid';
    $('#custom-builder').style.display = custom ? 'grid' : 'none';
  }));

  $('#btn-battle').addEventListener('click', () => {
    const enough = UI.voyageOutfit ? UI.playerCrew.length >= 1 : UI.playerCrew.length === crewMax();
    if (!enough) return;
    if (!UI.playerCrew.every(id => ensureLoadout(id).length === MOVESET_SIZE)) return;
    SFX.click();
    const loadouts = UI.playerCrew.map(id => loadoutMoves(id));
    if (UI.voyageOutfit) return startVoyage();
    if (UI.storyChapter) return startStoryBattle();
    const opp = pickOpponent();
    if (UI.mode === 'doubles') startDoublesBattle([...UI.playerCrew], opp.ids, loadouts, opp.loadouts);
    else startBattle([...UI.playerCrew], opp.ids, loadouts, opp.loadouts);
  });

  // ---- uncharted waters ----
  $('#btn-world').addEventListener('click', () => { SFX.click(); openWorld(); });
  $('#btn-world-back').addEventListener('click', () => { SFX.click(); showScreen('#screen-title'); });
  $('#btn-world-crew').addEventListener('click', () => { SFX.click(); openCrewModal(); });
  $('#btn-world-turnback').addEventListener('click', () => {
    if (!UI.voyageRun) return;
    if (!confirm('Come about and run for home? You keep half the hold and every soul aboard.')) return;
    SFX.click();
    endVoyage('turnback');
  });
  $('#btn-vr-again').addEventListener('click', () => { SFX.click(); openWorld(); });
  $('#btn-vr-title').addEventListener('click', () => { SFX.click(); showScreen('#screen-title'); });

  // ---- story mode ----
  $('#btn-story').addEventListener('click', () => { SFX.click(); openStory(); });
  $('#btn-story-back').addEventListener('click', () => { SFX.click(); showScreen('#screen-title'); });
  $('#btn-story-crew').addEventListener('click', () => { SFX.click(); openCrewModal(); });
  $('#btn-crew-close').addEventListener('click', closeCrewModal);
  $('#btn-crew-close2').addEventListener('click', closeCrewModal);
  $('#btn-story-reset').addEventListener('click', () => {
    if (!confirm('Scuttle this voyage and start a brand new one? All levels, berries and recruits are lost.')) return;
    SFX.click();
    UI.story = resetStory();
    openStory();
  });
  $('#btn-sr-continue').addEventListener('click', () => { SFX.click(); openStory(); });
  $('#btn-sr-retry').addEventListener('click', () => {
    SFX.click();
    const idx = storyIndexOf(UI.storyChapter ? UI.storyChapter.id : STORY[0].id);
    openStoryChapter(idx >= 0 ? idx : 0);
  });

  $('#btn-save-team').addEventListener('click', () => { SFX.click(); saveCurrentTeam(); });

  $('#d-btn-forfeit').addEventListener('click', () => {
    if (UI.dbl && UI.dbl.busy) return;
    if (UI.voyageRun) return worldCutAndRun();
    if (confirm('Strike your colors and forfeit this 2v2?')) dShowResult('enemy');
  });

  $('#btn-awaken').addEventListener('click', () => {
    if (UI.busy || !UI.battle || !UI.battle.canAwaken('player')) return;
    SFX.click();
    UI.awakenPending = !UI.awakenPending;
    renderMoves();   // re-render to preview (or restore) the awakened moveset
  });
  $('#btn-switch').addEventListener('click', () => { if (!UI.busy) { SFX.click(); openSwitchModal(false); } });
  $('#btn-switch-cancel').addEventListener('click', closeSwitchModal);
  $('#btn-forfeit').addEventListener('click', () => {
    if (UI.busy) return;
    if (UI.voyageRun) return worldCutAndRun();
    if (confirm('Strike your colors and forfeit this battle?')) showResult('enemy');
  });

  $('#btn-rematch').addEventListener('click', () => {
    SFX.click();
    if (UI.mode === 'doubles') {
      const lc = UI.dbl && UI.dbl.lastCrews;
      if (lc) startDoublesBattle([...lc.player], [...lc.enemy], lc.playerLoadouts, lc.enemyLoadouts);
    } else if (UI.lastCrews) {
      startBattle([...UI.lastCrews.player], [...UI.lastCrews.enemy], UI.lastCrews.playerLoadouts, UI.lastCrews.enemyLoadouts);
    }
  });
  $('#btn-newcrew').addEventListener('click', () => { SFX.click(); openSelect(UI.mode); });
  $('#btn-result-title').addEventListener('click', () => { SFX.click(); showScreen('#screen-title'); });

  // mute toggle (shared across both battle screens)
  const muteBtns = ['#btn-mute', '#d-btn-mute'].map($).filter(Boolean);
  const syncMute = () => muteBtns.forEach(b => b.textContent = UI.muted ? '🔇' : '🔊');
  syncMute();
  muteBtns.forEach(b => b.addEventListener('click', () => {
    UI.muted = !UI.muted;
    localStorage.setItem('gll-muted', UI.muted ? '1' : '0');
    syncMute();
  }));
}

document.addEventListener('DOMContentLoaded', initUI);
