/* ============================================================
   GRAND LINE LEGENDS — Battle Engine (DOM-free)
   Produces a list of events per turn that the UI animates.
   ============================================================ */

function rngFloat() { return Math.random(); }
function chance(pct) { return rngFloat() * 100 < pct; }
function randInt(a, b) { return a + Math.floor(rngFloat() * (b - a + 1)); }

const STATUS_NAMES = {
  burn: 'burned', poison: 'poisoned', para: 'paralyzed',
  freeze: 'frozen solid', sleep: 'fast asleep',
};
const STATUS_ICONS = { burn: 'BRN', poison: 'PSN', para: 'PAR', freeze: 'FRZ', sleep: 'SLP' };
const STORM_TURN = 30;

/* Resolve a chosen 4-move loadout into actual move objects.
   loadout may be: undefined (default = first 4 of the pool),
   an array of pool indices, or an array of move objects. */
function resolveLoadout(charDef, loadout) {
  if (!loadout || !loadout.length) return charDef.moves.slice(0, 4);
  const moves = loadout
    .map(m => (typeof m === 'number' ? charDef.moves[m] : m))
    .filter(Boolean)
    .slice(0, 4);
  return moves.length ? moves : charDef.moves.slice(0, 4);
}

/* A doubles-flavoured default loadout: the signature kit with the fighter's
   doubles move(s) swapped in over the lowest-power signature slot, so the AI
   actually uses spread/support tools in 2v2. */
function doublesLoadout(charDef) {
  const set = charDef.moves.slice(0, 4);
  const used = new Set();
  for (const dm of charDef.moves.filter(m => m.doubles)) {
    if (set.includes(dm)) continue;
    let wi = -1, wv = Infinity;
    set.forEach((m, i) => { if (used.has(i)) return; const v = m.pow || 0; if (v < wv) { wv = v; wi = i; } });
    if (wi < 0) wi = 0;
    set[wi] = dm; used.add(wi);
  }
  return set;
}

class Fighter {
  constructor(charDef, loadout) {
    this.def = charDef;
    this.moves = resolveLoadout(charDef, loadout);   // the 4 moves taken into battle
    const rs = realStats(charDef.stats);
    this.maxHp = rs.hp;
    this.hp = rs.hp;
    this.baseAtk = rs.atk;
    this.baseDef = rs.def;
    this.baseSatk = rs.satk;
    this.baseSdef = rs.sdef;
    this.baseSpd = rs.spd;
    this.stages = { atk: 0, def: 0, satk: 0, sdef: 0, spd: 0 };
    this.status = null;       // burn | poison | para | freeze | sleep
    this.sleepTurns = 0;
    this.stunned = false;     // skips next action
    this.protecting = false;  // guarding against this turn's attacks
    this.protectStreak = 0;   // consecutive Protects (diminishing success)
    this.usedRevive = false;
    this.usedSurvive = false;
  }
  get alive() { return this.hp > 0; }
  get name() { return this.def.name; }
  stageMult(stat) {
    const s = Math.max(-4, Math.min(4, this.stages[stat]));
    return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
  }
}

class Battle {
  /* playerIds / enemyIds: arrays of character ids.
     opts.playerLoadouts / opts.enemyLoadouts: optional arrays (parallel to
     the id arrays) of chosen movesets — each a list of 4 indices or move
     objects. Omitted entries fall back to the character's default 4. */
  constructor(playerIds, enemyIds, opts = {}) {
    const pL = opts.playerLoadouts || [];
    const eL = opts.enemyLoadouts || [];
    this.sides = {
      player: { crew: playerIds.map((id, i) => new Fighter(CHAR_BY_ID[id], pL[i])), active: 0, isAI: false },
      enemy: { crew: enemyIds.map((id, i) => new Fighter(CHAR_BY_ID[id], eL[i])), active: 0, isAI: true },
    };
    this.turn = 0;
    this.over = false;
    this.winner = null;
    this.awaitingReplace = false;
    this.trickRoom = 0;       // turns of reversed speed order remaining
    this.events = [];
    // switch-in abilities for leads
    this.emit({ t: 'log', msg: '⚔️ The crews face off across the waves!' });
    this.onSwitchIn('player');
    this.onSwitchIn('enemy');
  }

  active(sideKey) { return this.sides[sideKey].crew[this.sides[sideKey].active]; }
  other(sideKey) { return sideKey === 'player' ? 'enemy' : 'player'; }
  emit(ev) { this.events.push(ev); }

  /* Ability is live unless the opposing active fighter nullifies it. */
  abilityOf(sideKey) {
    const f = this.active(sideKey);
    if (!f || !f.alive) return null;
    const opp = this.active(this.other(sideKey));
    const oppAb = opp && opp.alive ? opp.def.ability : null;
    if (oppAb && oppAb.kind === 'nullify' && f.def.ability.kind !== 'nullify') return null;
    return f.def.ability;
  }

  /* Effective offense for a move's damage class: Attack (physical) or
     Sp. Atk (special). Low-HP abilities and burn scale whichever is used. */
  effOff(sideKey, cat) {
    const f = this.active(sideKey);
    const special = cat === 'special';
    let v = (special ? f.baseSatk : f.baseAtk) * f.stageMult(special ? 'satk' : 'atk');
    const ab = this.abilityOf(sideKey);
    if (ab && (ab.kind === 'lowHpBoost' || ab.kind === 'lowHpAtk') && f.hp <= f.maxHp / 2) v *= ab.mult;
    if (f.status === 'burn') v *= 0.75;
    return v;
  }
  effDef(sideKey, cat, ignoreBuffs) {
    const f = this.active(sideKey);
    const special = cat === 'special';
    let mult = f.stageMult(special ? 'sdef' : 'def');
    if (ignoreBuffs && mult > 1) mult = 1;
    return (special ? f.baseSdef : f.baseDef) * mult;
  }
  effSpd(sideKey) {
    const f = this.active(sideKey);
    let v = f.baseSpd * f.stageMult('spd');
    const ab = this.abilityOf(sideKey);
    if (ab && ab.kind === 'lowHpBoost' && f.hp <= f.maxHp / 2) v *= ab.mult;
    if (f.status === 'para') v *= 0.5;
    return v;
  }

  /* ------------- public API ------------- */

  /* action: {type:'move', idx} | {type:'switch', idx} ; returns events */
  playTurn(playerAction) {
    this.events = [];
    if (this.over || this.awaitingReplace) return this.events;
    this.turn++;
    this.emit({ t: 'turnStart', n: this.turn });

    const enemyAction = this.chooseAI('enemy');

    // 1. switches first
    if (playerAction.type === 'switch') this.doSwitch('player', playerAction.idx);
    if (enemyAction.type === 'switch') this.doSwitch('enemy', enemyAction.idx);

    // 2. moves, ordered by priority then speed
    const movers = [];
    if (playerAction.type === 'move') movers.push({ side: 'player', mv: this.active('player').moves[playerAction.idx] });
    if (enemyAction.type === 'move') movers.push({ side: 'enemy', mv: this.active('enemy').moves[enemyAction.idx] });
    movers.sort((a, b) => {
      const pa = this.movePriority(a.side, a.mv), pb = this.movePriority(b.side, b.mv);
      if (pa !== pb) return pb - pa;
      const sa = this.effSpd(a.side), sb = this.effSpd(b.side);
      if (sa !== sb) return this.trickRoom > 0 ? sa - sb : sb - sa;   // Trick Room: slower acts first
      return rngFloat() < 0.5 ? -1 : 1;
    });

    for (const m of movers) {
      if (this.over) break;
      const user = this.active(m.side);
      if (!user.alive) continue;             // fainted before acting
      this.useMove(m.side, m.mv);
      this.checkFaints();
    }

    // 3. end of turn effects
    if (!this.over) this.endOfTurn();

    // 4. replacements
    this.handleReplacements();
    return this.events;
  }

  /* player picks replacement after faint */
  submitReplace(idx) {
    this.events = [];
    const side = this.sides.player;
    if (!this.awaitingReplace || !side.crew[idx] || !side.crew[idx].alive) return this.events;
    side.active = idx;
    this.awaitingReplace = false;
    this.emit({ t: 'switch', side: 'player', idx, name: side.crew[idx].name });
    this.emit({ t: 'log', msg: `🏴‍☠️ ${side.crew[idx].name} takes the deck!` });
    this.onSwitchIn('player');
    this.checkFaints();          // intimidate can't faint, but keep consistent
    this.handleReplacements();   // enemy may also need replacing
    return this.events;
  }

  /* ------------- internals ------------- */

  movePriority(sideKey, mv) {
    let p = mv.prio || 0;
    const ab = this.abilityOf(sideKey);
    if (ab && ab.kind === 'statusPriority' && mv.pow === 0) p += 1;
    return p;
  }

  doSwitch(sideKey, idx) {
    const side = this.sides[sideKey];
    if (!side.crew[idx] || !side.crew[idx].alive || idx === side.active) return;
    const old = this.active(sideKey);
    // stat-stage buffs/debuffs persist when a fighter retreats and returns;
    // only the transient per-turn flags clear on a switch.
    old.stunned = false;
    old.protecting = false;
    old.protectStreak = 0;
    side.active = idx;
    side.lastSwitchTurn = this.turn;   // throttles back-to-back AI switching
    this.emit({ t: 'switch', side: sideKey, idx, name: side.crew[idx].name });
    this.emit({ t: 'log', msg: `${sideKey === 'player' ? '🏴‍☠️' : '🏴'} ${old.name} falls back — ${side.crew[idx].name} takes the deck!` });
    this.onSwitchIn(sideKey);
  }

  onSwitchIn(sideKey) {
    const ab = this.abilityOf(sideKey);
    const f = this.active(sideKey);
    if (ab && ab.kind === 'intimidate') {
      const oppKey = this.other(sideKey);
      const opp = this.active(oppKey);
      if (opp && opp.alive) {
        this.changeStage(oppKey, 'atk', -1);
        this.emit({ t: 'log', msg: `👁️ ${f.name}'s ${ab.name} washes over ${opp.name} — Attack fell!` });
      }
    }
  }

  changeStage(sideKey, stat, delta) {
    const f = this.active(sideKey);
    const before = f.stages[stat];
    f.stages[stat] = Math.max(-4, Math.min(4, before + delta));
    const changed = f.stages[stat] - before;
    if (changed !== 0) this.emit({ t: 'stat', side: sideKey, stat, delta: changed });
    return changed;
  }

  /* returns false if user cannot act this turn */
  canAct(sideKey) {
    const f = this.active(sideKey);
    if (f.stunned) {
      f.stunned = false;
      this.emit({ t: 'log', msg: `💫 ${f.name} is stunned and can't move!` });
      this.emit({ t: 'anim', kind: 'stunned', side: sideKey });
      return false;
    }
    if (f.status === 'freeze') {
      if (chance(25)) {
        f.status = null;
        this.emit({ t: 'status', side: sideKey, status: null });
        this.emit({ t: 'log', msg: `🧊 ${f.name} broke out of the ice!` });
      } else {
        this.emit({ t: 'log', msg: `🧊 ${f.name} is frozen solid!` });
        return false;
      }
    }
    if (f.status === 'sleep') {
      if (f.sleepTurns <= 0) {
        f.status = null;
        this.emit({ t: 'status', side: sideKey, status: null });
        this.emit({ t: 'log', msg: `☀️ ${f.name} woke up!` });
      } else {
        f.sleepTurns--;
        this.emit({ t: 'log', msg: `💤 ${f.name} is fast asleep...` });
        return false;
      }
    }
    if (f.status === 'para' && chance(20)) {
      this.emit({ t: 'log', msg: `⚡ ${f.name} is paralyzed and can't move!` });
      return false;
    }
    return true;
  }

  useMove(sideKey, mv) {
    const userKey = sideKey, targetKey = this.other(sideKey);
    const user = this.active(userKey);
    const target = this.active(targetKey);
    if (!this.canAct(userKey)) return;

    const fx = mv.fx || {};
    // any non-Protect action resets the consecutive-guard counter
    if (!fx.protect) user.protectStreak = 0;

    this.emit({ t: 'log', msg: `${userKey === 'player' ? '▶' : '◀'} ${user.name} used ${mv.name}!`, move: mv, side: userKey });
    this.emit({ t: 'anim', kind: 'attack', side: userKey, moveType: mv.type, status: mv.pow === 0 });

    const userAb = this.abilityOf(userKey);
    const targetAb = this.abilityOf(targetKey);

    /* ---- Protect: brace against this turn's attacks (diminishing) ---- */
    if (fx.protect) {
      const successCh = 100 / (user.protectStreak + 1);
      if (chance(successCh)) {
        user.protecting = true;
        user.protectStreak++;
        this.emit({ t: 'anim', kind: 'protect', side: userKey });
        this.emit({ t: 'log', msg: `🛡️ ${user.name} braces behind a guard!` });
      } else {
        user.protectStreak = 0;
        this.emit({ t: 'log', msg: `🛡️ ${user.name}'s guard failed!` });
      }
      return;
    }

    /* ---- status (no-damage) moves ---- */
    if (mv.pow === 0) {
      if (fx.trickRoom) {
        this.trickRoom = this.trickRoom > 0 ? 0 : 5;
        this.emit({ t: 'log', msg: this.trickRoom ? `🌀 ${user.name} twists the dimensions — Trick Room! The slow now strike first!` : `🌀 ${user.name} dispels the Trick Room!` });
        return;
      }
      if (fx.heal) {
        const amt = Math.floor(user.maxHp * fx.heal / 100);
        const healed = Math.min(amt, user.maxHp - user.hp);
        user.hp += healed;
        this.emit({ t: 'heal', side: userKey, amount: healed, hp: user.hp });
        this.emit({ t: 'log', msg: `💚 ${user.name} recovered ${healed} HP!` });
      }
      if (fx.self) for (const [stat, d] of Object.entries(fx.self)) {
        if (this.changeStage(userKey, stat, d)) this.emit({ t: 'log', msg: `📈 ${user.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}${Math.abs(d) > 1 ? ' sharply' : ''}!` });
      }
      // doubles-only effects degrade gracefully in 1v1 (no partner): apply to self
      if (fx.team) for (const [stat, d] of Object.entries(fx.team))
        if (this.changeStage(userKey, stat, d)) this.emit({ t: 'log', msg: `📣 ${user.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}!` });
      if (fx.allyHeal) { const h = Math.min(Math.floor(user.maxHp * fx.allyHeal / 100), user.maxHp - user.hp); if (h > 0) { user.hp += h; this.emit({ t: 'heal', side: userKey, amount: h, hp: user.hp }); this.emit({ t: 'log', msg: `💚 ${user.name} recovered ${h} HP!` }); } }
      if (fx.allyBuff) for (const [stat, d] of Object.entries(fx.allyBuff))
        if (this.changeStage(userKey, stat, d)) this.emit({ t: 'log', msg: `📈 ${user.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}!` });
      if (fx.enemy || fx.sleep || fx.stun) {
        if (!target.alive) { this.emit({ t: 'log', msg: 'But there was no target...' }); return; }
        if (target.protecting) { this.emit({ t: 'log', msg: `🛡️ ${target.name}'s guard holds firm!` }); return; }
        // dodge + accuracy for hostile status moves
        if (targetAb && targetAb.kind === 'dodge' && chance(targetAb.chance)) {
          this.emit({ t: 'log', msg: `💨 ${target.name} slipped away — ${targetAb.name}!` });
          return;
        }
        const hits = (userAb && userAb.kind === 'neverMiss') || fx.neverMiss || chance(mv.acc);
        if (!hits) { this.emit({ t: 'log', msg: `💨 But it missed!` }); return; }
        if (fx.enemy) for (const [stat, d] of Object.entries(fx.enemy)) {
          if (this.changeStage(targetKey, stat, d)) this.emit({ t: 'log', msg: `📉 ${target.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}${Math.abs(d) > 1 ? ' sharply' : ''}!` });
        }
        if (fx.sleep && chance(fx.sleep)) this.applyStatus(targetKey, 'sleep');
        if (fx.stun && chance(fx.stun)) this.applyStun(targetKey);
      }
      return;
    }

    /* ---- damaging moves ---- */
    if (!target.alive) { this.emit({ t: 'log', msg: 'But there was no target...' }); return; }

    // a raised guard blocks the blow outright
    if (target.protecting) {
      this.emit({ t: 'anim', kind: 'blocked', side: targetKey });
      this.emit({ t: 'log', msg: `🛡️ ${target.name}'s guard blocked the attack!` });
      return;
    }

    // full-type immunity ability (Buggy)
    if (targetAb && targetAb.kind === 'immuneType' && targetAb.type === mv.type) {
      this.emit({ t: 'log', msg: `🤡 It passed right through — ${target.name}'s ${targetAb.name}!` });
      return;
    }
    // dodge abilities
    if (targetAb && targetAb.kind === 'dodge' && chance(targetAb.chance)) {
      this.emit({ t: 'log', msg: `💨 ${target.name} dodged — ${targetAb.name}!` });
      return;
    }
    // accuracy
    const neverMiss = (userAb && userAb.kind === 'neverMiss') || fx.neverMiss;
    if (!neverMiss && !chance(mv.acc)) {
      this.emit({ t: 'log', msg: `💨 ${user.name}'s attack missed!` });
      return;
    }

    let eff = typeEffectiveness(mv.type, target.def.types);
    // Roger's supreme Haki: resistances don't apply (immunities still do)
    if (eff > 0 && eff < 1 && userAb && userAb.kind === 'pierce') {
      eff = 1;
      this.emit({ t: 'log', msg: `👑 ${user.name}'s supreme Haki cuts through the resistance!` });
    }
    if (eff === 0) {
      this.emit({ t: 'log', msg: `🛡️ It doesn't affect ${target.name} at all!` });
      return;
    }

    const nHits = fx.multi ? randInt(fx.multi[0], fx.multi[1]) : 1;
    let totalDmg = 0;
    let landedCrit = false;

    for (let h = 0; h < nHits; h++) {
      if (!target.alive) break;
      // crit
      let critCh = 6.25 + (fx.critBoost || 0);
      let critMult = 1.5;
      if (userAb && userAb.kind === 'critChance') critCh += userAb.bonus;
      if (userAb && userAb.kind === 'superCrit') { critCh += userAb.bonus; critMult = userAb.mult; }
      const isCrit = chance(critCh);
      if (isCrit) landedCrit = true;

      const A = this.effOff(userKey, mv.cat);
      const ignoreBuffs = (userAb && userAb.kind === 'ignoreBuffs');
      const D = fx.ignoreDef ? (mv.cat === 'special' ? this.active(targetKey).baseSdef : this.active(targetKey).baseDef) : this.effDef(targetKey, mv.cat, ignoreBuffs);

      let dmg = ((2 * LEVEL / 5 + 2) * mv.pow * (A / D)) / 50 + 2;
      // STAB
      if (user.def.types.includes(mv.type)) dmg *= 1.5;
      dmg *= eff;
      if (isCrit) dmg *= critMult;
      dmg *= 0.85 + rngFloat() * 0.15;
      // ability damage modifiers
      if (userAb && userAb.kind === 'typeBoost' && userAb.type === mv.type) dmg *= userAb.mult;
      if (userAb && userAb.kind === 'executioner' && target.hp <= target.maxHp / 2) dmg *= userAb.mult;
      if (userAb && userAb.kind === 'transform' && user.hp <= user.maxHp / 2) dmg *= userAb.out;
      if (targetAb && targetAb.kind === 'armorTypes' && targetAb.types.includes(mv.type)) dmg *= targetAb.mult;
      if (targetAb && targetAb.kind === 'scales' && target.hp > target.maxHp / 2) dmg *= targetAb.mult;
      if (targetAb && targetAb.kind === 'transform' && target.hp <= target.maxHp / 2) dmg *= targetAb.in;
      // Blackbeard's curse: he takes extra damage (his own ability, never nullified)
      if (target.def.ability.kind === 'nullify') dmg *= target.def.ability.dmgIn;

      dmg = Math.max(1, Math.floor(dmg));

      // survive-at-1HP ability
      const survAb = targetAb && targetAb.kind === 'survive';
      if (survAb && !target.usedSurvive && dmg >= target.hp) {
        dmg = target.hp - 1;
        target.usedSurvive = true;
        this.emit({ t: 'log', msg: `🌙 ${target.name} refuses to fall — ${targetAb.name}!` });
      }

      target.hp = Math.max(0, target.hp - dmg);
      totalDmg += dmg;
      this.emit({ t: 'damage', side: targetKey, amount: dmg, hp: target.hp, eff, crit: isCrit, moveType: mv.type });
    }

    if (nHits > 1) this.emit({ t: 'log', msg: `🌀 Hit ${nHits} time${nHits > 1 ? 's' : ''}!` });
    if (landedCrit) this.emit({ t: 'log', msg: `💥 A critical hit!` });
    if (eff > 1) this.emit({ t: 'log', msg: `🔥 It's super effective!` });
    else if (eff < 1) this.emit({ t: 'log', msg: `🌫️ It's not very effective...` });

    /* post-hit effects */
    if (totalDmg > 0) {
      // drain / lifesteal
      let drainFrac = (fx.drain || 0) / 100;
      if (userAb && userAb.kind === 'lifesteal') drainFrac = Math.max(drainFrac, userAb.frac);
      if (drainFrac > 0 && user.alive) {
        const healed = Math.min(Math.max(1, Math.floor(totalDmg * drainFrac)), user.maxHp - user.hp);
        if (healed > 0) {
          user.hp += healed;
          this.emit({ t: 'heal', side: userKey, amount: healed, hp: user.hp });
          this.emit({ t: 'log', msg: `🩸 ${user.name} drained ${healed} HP!` });
        }
      }
      // recoil
      if (fx.recoil && user.alive) {
        const rec = Math.max(1, Math.floor(totalDmg * fx.recoil / 100));
        user.hp = Math.max(0, user.hp - rec);
        this.emit({ t: 'damage', side: userKey, amount: rec, hp: user.hp, eff: 1, crit: false, recoil: true });
        this.emit({ t: 'log', msg: `💢 ${user.name} is hit with recoil!` });
      }
      // status infliction from move (+ Ace's bonus burn)
      if (target.alive) {
        let burnCh = (fx.burn || 0);
        if (userAb && userAb.kind === 'bonusBurn') burnCh += userAb.chance;
        if (burnCh && chance(burnCh)) this.applyStatus(targetKey, 'burn');
        if (fx.poison && chance(fx.poison)) this.applyStatus(targetKey, 'poison');
        if (fx.para && chance(fx.para)) this.applyStatus(targetKey, 'para');
        if (fx.freeze && chance(fx.freeze)) this.applyStatus(targetKey, 'freeze');
        if (fx.sleep && chance(fx.sleep)) this.applyStatus(targetKey, 'sleep');
        let stunCh = (fx.stun || 0);
        if (userAb && userAb.kind === 'bonusStun') stunCh += userAb.chance;
        if (stunCh && chance(stunCh)) this.applyStun(targetKey);
        // stat drops riding on damaging moves
        if (fx.enemy && chance(fx.enemyChance !== undefined ? fx.enemyChance : 100)) {
          for (const [stat, d] of Object.entries(fx.enemy)) {
            if (this.changeStage(targetKey, stat, d)) this.emit({ t: 'log', msg: `📉 ${target.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}!` });
          }
        }
        if (fx.self) {
          for (const [stat, d] of Object.entries(fx.self)) {
            if (this.changeStage(userKey, stat, d)) this.emit({ t: 'log', msg: `${d > 0 ? '📈' : '📉'} ${user.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}!` });
          }
        }
        // thorns abilities (freeze/poison/stun attackers)
        if (targetAb && targetAb.kind === 'thorns' && user.alive && chance(targetAb.chance)) {
          if (targetAb.status === 'stun') this.applyStun(userKey, `💘 ${targetAb.name}!`);
          else this.applyStatus(userKey, targetAb.status, `${targetAb.name}!`);
        }
      }
      // flame thaws ice
      if (mv.type === 'FLAME' && target.status === 'freeze') {
        target.status = null;
        this.emit({ t: 'status', side: targetKey, status: null });
        this.emit({ t: 'log', msg: `💧 The ice around ${target.name} melted!` });
      }
    }
  }

  applyStatus(sideKey, status, sourceNote) {
    const f = this.active(sideKey);
    if (!f.alive || f.status) return;
    const ab = this.abilityOf(sideKey);
    if (status === 'burn' && ab && ab.burnImmune) {
      this.emit({ t: 'log', msg: `🔥 ${f.name} walks through flames unburnt!` });
      return;
    }
    if ((status === 'burn' || status === 'poison') && ab && ab.kind === 'immortal') {
      this.emit({ t: 'log', msg: `👁️ ${f.name}'s immortal body rejects the affliction!` });
      return;
    }
    f.status = status;
    if (status === 'sleep') f.sleepTurns = randInt(1, 3);
    this.emit({ t: 'status', side: sideKey, status });
    this.emit({ t: 'log', msg: `${statusEmoji(status)} ${f.name} is ${STATUS_NAMES[status]}!${sourceNote ? ' (' + sourceNote + ')' : ''}` });
  }

  applyStun(sideKey, sourceNote) {
    const f = this.active(sideKey);
    if (!f.alive || f.stunned) return;
    f.stunned = true;
    this.emit({ t: 'log', msg: `💫 ${f.name} is stunned!${sourceNote ? ' (' + sourceNote + ')' : ''}` });
  }

  endOfTurn() {
    if (this.trickRoom > 0 && --this.trickRoom === 0) this.emit({ t: 'log', msg: '🌀 The Trick Room collapsed — speed returns to normal.' });
    // The sea itself ends stalemates: past turn 30 a storm batters both crews harder each turn.
    if (this.turn === STORM_TURN) this.emit({ t: 'log', msg: '🌊 The sky darkens... a New World storm closes in!' });
    if (this.turn > STORM_TURN) {
      for (const sideKey of ['player', 'enemy']) {
        const f = this.active(sideKey);
        if (!f.alive) continue;
        const d = Math.max(1, Math.floor(f.maxHp * 0.04 * (this.turn - STORM_TURN)));
        f.hp = Math.max(0, f.hp - d);
        this.emit({ t: 'damage', side: sideKey, amount: d, hp: f.hp, eff: 1, crit: false, dot: 'storm' });
        this.emit({ t: 'log', msg: `🌊 The storm batters ${f.name}!` });
      }
    }
    for (const sideKey of ['player', 'enemy']) {
      const f = this.active(sideKey);
      if (!f.alive) continue;
      if (f.status === 'burn') {
        const d = Math.max(1, Math.floor(f.maxHp / 16));
        f.hp = Math.max(0, f.hp - d);
        this.emit({ t: 'damage', side: sideKey, amount: d, hp: f.hp, eff: 1, crit: false, dot: 'burn' });
        this.emit({ t: 'log', msg: `🔥 ${f.name} is hurt by its burn!` });
      } else if (f.status === 'poison') {
        const d = Math.max(1, Math.floor(f.maxHp / 8));
        f.hp = Math.max(0, f.hp - d);
        this.emit({ t: 'damage', side: sideKey, amount: d, hp: f.hp, eff: 1, crit: false, dot: 'poison' });
        this.emit({ t: 'log', msg: `☠️ ${f.name} is hurt by poison!` });
      }
      const ab = this.abilityOf(sideKey);
      if (ab && (ab.kind === 'regen' || ab.kind === 'immortal') && f.alive && f.hp > 0 && f.hp < f.maxHp) {
        const healed = Math.min(Math.floor(f.maxHp * ab.frac), f.maxHp - f.hp);
        if (healed > 0) {
          f.hp += healed;
          this.emit({ t: 'heal', side: sideKey, amount: healed, hp: f.hp });
          this.emit({ t: 'log', msg: `🔵 ${f.name} regenerates ${healed} HP — ${ab.name}!` });
        }
      }
    }
    // guards last only for the turn they were raised
    for (const sideKey of ['player', 'enemy']) {
      const f = this.active(sideKey);
      if (f) f.protecting = false;
    }
    this.checkFaints();
  }

  checkFaints() {
    for (const sideKey of ['player', 'enemy']) {
      const f = this.active(sideKey);
      if (f && f.hp <= 0 && !f._fainted) {
        // revive ability
        if (f.def.ability.kind === 'revive' && !f.usedRevive && this.abilityOf(sideKey)) {
          f.usedRevive = true;
          f.hp = Math.floor(f.maxHp * f.def.ability.frac);
          f.status = null; f.stunned = false;
          this.emit({ t: 'heal', side: sideKey, amount: f.hp, hp: f.hp });
          this.emit({ t: 'log', msg: `🎻 ${f.name}'s soul returns to his bones — ${f.def.ability.name}!` });
          continue;
        }
        f._fainted = true;
        f.hp = 0;
        f.status = null;
        this.emit({ t: 'faint', side: sideKey, name: f.name });
        this.emit({ t: 'log', msg: `💀 ${f.name} is down!` });
        // Rocks feeds on the chaos: any faint raises his Attack
        for (const rk of ['player', 'enemy']) {
          const r = this.active(rk);
          const rab = this.abilityOf(rk);
          if (r && r.alive && rab && rab.kind === 'rage') {
            if (this.changeStage(rk, 'atk', 1)) {
              this.emit({ t: 'log', msg: `😈 ${r.name}'s ${rab.name} swells — Attack rose!` });
            }
          }
        }
      }
    }
    this.checkWin();
  }

  checkWin() {
    if (this.over) return;
    const pAlive = this.sides.player.crew.some(f => f.alive);
    const eAlive = this.sides.enemy.crew.some(f => f.alive);
    if (!eAlive) { this.over = true; this.winner = 'player'; this.emit({ t: 'end', winner: 'player' }); }
    else if (!pAlive) { this.over = true; this.winner = 'enemy'; this.emit({ t: 'end', winner: 'enemy' }); }
  }

  handleReplacements() {
    if (this.over) return;
    // enemy auto-replace
    const e = this.sides.enemy;
    if (!this.active('enemy').alive) {
      const idx = this.bestReplacement('enemy');
      e.active = idx;
      this.emit({ t: 'switch', side: 'enemy', idx, name: e.crew[idx].name });
      this.emit({ t: 'log', msg: `🏴 The enemy sends out ${e.crew[idx].name}!` });
      this.onSwitchIn('enemy');
    }
    // player needs manual replace
    if (!this.active('player').alive && this.sides.player.crew.some(f => f.alive)) {
      this.awaitingReplace = true;
      this.emit({ t: 'needReplace' });
    }
  }

  /* ===================== AI BRAIN =====================
     The AI evaluates every option in HP-equivalent units:
     - damaging moves: expected damage (capped at the KO), with
       lethal bonuses, priority awareness, and secondary-effect value
     - status moves: heals, sleeps, stuns, and stat stages priced
       against the opponent's actual expected output
     - switches: matchup tempo scores minus the free hit taken
     It respects ability interactions (nullify, dodge, armor, scales,
     transforms, pierce) via a shared damage-estimation model. */

  /* Deterministic damage estimate (mean roll, no crit), mirroring useMove. */
  estDamage(att, def, mv, attAb, defAb) {
    if (!mv || mv.pow === 0 || !def) return 0;
    if (defAb && defAb.kind === 'immuneType' && defAb.type === mv.type) return 0;
    let eff = typeEffectiveness(mv.type, def.def.types);
    if (eff > 0 && eff < 1 && attAb && attAb.kind === 'pierce') eff = 1;
    if (eff === 0) return 0;
    const sp = mv.cat === 'special';
    let A = (sp ? att.baseSatk : att.baseAtk) * att.stageMult(sp ? 'satk' : 'atk');
    if (attAb && (attAb.kind === 'lowHpBoost' || attAb.kind === 'lowHpAtk') && att.hp <= att.maxHp / 2) A *= attAb.mult;
    if (att.status === 'burn') A *= 0.75;
    let defMult = def.stageMult(sp ? 'sdef' : 'def');
    if (attAb && attAb.kind === 'ignoreBuffs' && defMult > 1) defMult = 1;
    const baseD = sp ? def.baseSdef : def.baseDef;
    const D = (mv.fx && mv.fx.ignoreDef) ? baseD : baseD * defMult;
    let dmg = ((2 * LEVEL / 5 + 2) * mv.pow * (A / D)) / 50 + 2;
    if (att.def.types.includes(mv.type)) dmg *= 1.5;
    dmg *= eff * 0.93;
    if (attAb && attAb.kind === 'typeBoost' && attAb.type === mv.type) dmg *= attAb.mult;
    if (attAb && attAb.kind === 'executioner' && def.hp <= def.maxHp / 2) dmg *= attAb.mult;
    if (attAb && attAb.kind === 'transform' && att.hp <= att.maxHp / 2) dmg *= attAb.out;
    if (defAb && defAb.kind === 'armorTypes' && defAb.types.includes(mv.type)) dmg *= defAb.mult;
    if (defAb && defAb.kind === 'scales' && def.hp > def.maxHp / 2) dmg *= defAb.mult;
    if (defAb && defAb.kind === 'transform' && def.hp <= def.maxHp / 2) dmg *= defAb.in;
    if (def.def.ability.kind === 'nullify') dmg *= def.def.ability.dmgIn;
    if (mv.fx && mv.fx.multi) dmg *= (mv.fx.multi[0] + mv.fx.multi[1]) / 2;
    return Math.max(1, Math.floor(dmg));
  }

  /* Chance the move connects, considering accuracy and dodge abilities. */
  hitChance(mv, attAb, defAb) {
    let p = ((attAb && attAb.kind === 'neverMiss') || (mv.fx && mv.fx.neverMiss)) ? 1 : mv.acc / 100;
    if (defAb && defAb.kind === 'dodge') p *= 1 - defAb.chance / 100;
    return p;
  }

  /* Resolve which abilities are live for a hypothetical pairing (nullify). */
  liveAbilities(a, b) {
    let abA = a.def.ability, abB = b.def.ability;
    if (abA && abA.kind === 'nullify' && abB && abB.kind !== 'nullify') abB = null;
    if (abB && abB.kind === 'nullify' && abA && abA.kind !== 'nullify') abA = null;
    return [abA, abB];
  }

  /* Best expected one-turn damage from fighter a onto fighter b. */
  bestExpected(a, b) {
    const [abA, abB] = this.liveAbilities(a, b);
    let best = 0;
    for (const mv of a.moves) {
      if (mv.pow === 0) continue;
      const d = this.estDamage(a, b, mv, abA, abB) * this.hitChance(mv, abA, abB);
      if (d > best) best = d;
    }
    return best;
  }

  /* Matchup tempo from `mine`'s perspective: damage traded per turn as HP fractions. */
  matchupScore(mine, theirs) {
    const myOut = this.bestExpected(mine, theirs) / Math.max(1, theirs.hp);
    const myIn = this.bestExpected(theirs, mine) / Math.max(1, mine.hp);
    return myOut - myIn;
  }

  bestReplacement(sideKey) {
    const side = this.sides[sideKey];
    const opp = this.active(this.other(sideKey));
    let best = -1, bestScore = -Infinity;
    side.crew.forEach((f, i) => {
      if (!f.alive || i === side.active) return;
      const score = this.matchupScore(f, opp) + (f.hp / f.maxHp) * 0.3;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return best === -1 ? side.crew.findIndex(f => f.alive) : best;
  }

  chooseAI(sideKey) {
    const side = this.sides[sideKey];
    const me = this.active(sideKey);
    if (!me || !me.alive) return { type: 'move', idx: 0 }; // replaced before acting
    const oppKey = this.other(sideKey);
    const opp = this.active(oppKey);
    const [myAb, oppAb] = this.liveAbilities(me, opp);

    /* ---- threat assessment ---- */
    const oppBest = this.bestExpected(opp, me);
    const faster = this.effSpd(sideKey) > this.effSpd(oppKey);
    const oppCanKO = oppBest >= me.hp * 0.92;
    const doomed = oppCanKO && !faster;       // they likely KO me before I act
    const turnsToDie = me.hp / Math.max(1, oppBest);
    const lateStorm = this.turn >= STORM_TURN - 2;

    const options = [];

    for (let i = 0; i < me.moves.length; i++) {
      const mv = me.moves[i];
      const fx = mv.fx || {};
      let score = 0;

      if (mv.pow > 0) {
        const hitP = this.hitChance(mv, myAb, oppAb);
        const raw = this.estDamage(me, opp, mv, myAb, oppAb);
        const capped = Math.min(raw, opp.hp);
        score = capped * hitP;
        if (raw >= opp.hp) {
          score += 55 * hitP;                                  // close the deal
          if (doomed && (mv.prio || 0) > 0) score += 80;       // priority KO saves me
        }
        if (doomed && (mv.prio || 0) > 0) score += 12;         // at least act first
        if (raw < opp.hp && !opp.status) {
          const sChance = (fx.burn || 0) + (fx.poison || 0) + (fx.para || 0) + (fx.freeze || 0) + (fx.sleep || 0);
          score += sChance * 0.45;
          if (myAb && myAb.kind === 'bonusBurn') score += 8;
        }
        if (fx.stun && raw < opp.hp && !opp.stunned) score += fx.stun * 0.5;
        if (fx.drain && me.hp < me.maxHp * 0.7) score += raw * fx.drain / 100 * 0.5;
        if (myAb && myAb.kind === 'lifesteal' && me.hp < me.maxHp * 0.7) score += raw * myAb.frac * 0.5;
        if (fx.recoil && me.hp < me.maxHp * 0.35) score -= raw * fx.recoil / 100 * 1.2;
        if (fx.enemy && raw < opp.hp) score += 6;
      } else {
        /* ---- status moves, valued in HP-equivalents ---- */
        const acc = (fx.neverMiss || (myAb && myAb.kind === 'neverMiss')) ? 1 : mv.acc / 100;
        if (fx.protect) {
          // worth most when a guard buys regen/end-of-turn value or stalls a likely KO
          let v = 0;
          if (myAb && (myAb.kind === 'regen' || myAb.kind === 'immortal') && me.hp < me.maxHp * 0.85) {
            v = me.maxHp * myAb.frac * 0.9;
          }
          if (oppCanKO) v = Math.max(v, oppBest * 0.5);   // dodge the killing blow
          v /= (me.protectStreak + 1);                    // diminishing: success halves each time
          if (lateStorm) v *= 0.2;                        // the storm ignores guards
          score = Math.max(score, v);
        }
        if (fx.heal) {
          const missing = me.maxHp - me.hp;
          const healAmt = Math.min(Math.floor(me.maxHp * fx.heal / 100), missing);
          const hpFrac = me.hp / me.maxHp;
          let mult = hpFrac < 0.4 ? 1.25 : hpFrac < 0.65 ? 0.55 : 0.05;
          if (oppCanKO && !faster) mult = 0.05;                // healing won't save me
          else if (oppBest > healAmt * 0.95) mult *= 0.45;     // they out-damage the heal
          score = Math.max(score, healAmt * mult);
        }
        if (fx.sleep && !opp.status) score = Math.max(score, Math.min(oppBest * 1.6, 130) * acc);
        if (fx.stun && !opp.stunned) score = Math.max(score, Math.min(oppBest * 0.9, 90) * acc);
        if (fx.enemy && opp.hp > opp.maxHp * 0.35) {
          let v = 0;
          const myBestOut = this.bestExpected(me, opp);
          for (const [stat, d] of Object.entries(fx.enemy)) {
            const room = Math.max(0, 4 + Math.min(0, opp.stages[stat]));
            const effDelta = Math.min(Math.abs(d), room);
            if (stat === 'atk') v += oppBest * 0.38 * effDelta;
            if (stat === 'def') v += myBestOut * 0.3 * effDelta;
            if (stat === 'spd') v += (faster ? 8 : 30) * effDelta;
          }
          score = Math.max(score, v * acc);
        }
        if (fx.self) {
          let v = 0;
          const myBestOut = this.bestExpected(me, opp);
          const safe = turnsToDie >= 2.6 && opp.hp > opp.maxHp * 0.3;
          for (const [stat, d] of Object.entries(fx.self)) {
            if (d <= 0) continue;
            const room = Math.max(0, 4 - Math.max(0, me.stages[stat]));
            const effDelta = Math.min(d, room);
            if (stat === 'atk') v += myBestOut * 0.35 * effDelta;
            if (stat === 'def') v += oppBest * 0.28 * effDelta;
            if (stat === 'spd') v += (faster ? 6 : 26) * effDelta;
          }
          if (!safe) v *= 0.15;
          score = Math.max(score, v);
        }
        if (lateStorm) score *= 0.3;        // storm closing in: stop posturing
        if (doomed) score *= 0.1;
      }
      options.push({ action: { type: 'move', idx: i }, score });
    }

    /* ---- switch consideration ----
       Switching costs a whole turn and a free hit, so the AI only does it
       to escape a clearly losing matchup for a clearly better one, never two
       turns in a row (which caused dithering / ping-ponging). */
    const justSwitched = (this.turn - (side.lastSwitchTurn ?? -9)) <= 1;
    if (!lateStorm && !justSwitched) {
      const curScore = this.matchupScore(me, opp);
      let bestIdx = -1, bestGain = 0;
      side.crew.forEach((f, i) => {
        if (!f.alive || i === side.active) return;
        const incoming = this.bestExpected(opp, f);     // free hit on the switch-in
        if (incoming >= f.hp * 0.9) return;             // never switch into a (near) KO
        // the upgrade must outweigh the lost turn and the free hit taken
        const gain = this.matchupScore(f, opp) - curScore - (incoming / Math.max(1, f.maxHp)) * 0.9;
        if (gain > bestGain) { bestGain = gain; bestIdx = i; }
      });
      if (bestIdx >= 0 && bestGain > 0.6 && curScore < -0.3 && opp.hp > opp.maxHp * 0.35) {
        options.push({ action: { type: 'switch', idx: bestIdx }, score: 22 + bestGain * 60 });
      }
    }

    /* ---- jittered argmax with slight imperfection ---- */
    for (const o of options) o.score *= 0.93 + rngFloat() * 0.14;
    options.sort((a, b) => b.score - a.score);
    if (options.length > 1 && rngFloat() < 0.1) return options[1].action;
    return options[0].action;
  }
}

/* ===================== DOUBLES (2v2 with bench) =====================
   Each side brings a crew of 4; two fighters hold the front line while the
   rest wait on the bench. Fainted front-liners are replaced from the bench
   (the player chooses; the AI auto-picks the best matchup), and the player
   may voluntarily switch a front-liner for a bench mate as that fighter's
   action. Combat rules mirror the single engine exactly, but addressed by
   field position (0/1) so the UI can target the right on-screen slot. */
const DOUBLES_ACTIVE = 2;

class DoublesBattle {
  constructor(playerIds, enemyIds, opts = {}) {
    const pL = opts.playerLoadouts || [], eL = opts.enemyLoadouts || [];
    const make = (id, lo) => new Fighter(CHAR_BY_ID[id], lo || doublesLoadout(CHAR_BY_ID[id]));
    this.sides = {
      player: { crew: playerIds.map((id, i) => make(id, pL[i])), field: [], redirect: null, wideGuard: false, isAI: false },
      enemy: { crew: enemyIds.map((id, i) => make(id, eL[i])), field: [], redirect: null, wideGuard: false, isAI: true },
    };
    for (const sk of ['player', 'enemy']) {
      const s = this.sides[sk];
      for (let i = 0; i < s.crew.length && s.field.length < DOUBLES_ACTIVE; i++) if (s.crew[i].alive) s.field.push(i);
      while (s.field.length < DOUBLES_ACTIVE) s.field.push(null);
    }
    this.trickRoom = 0;
    this.turn = 0;
    this.over = false;
    this.winner = null;
    this.awaiting = null;     // { side:'player', positions:[...] } when a replacement is owed
    this.events = [];
    this.emit({ t: 'log', msg: '⚔️ A 2-on-2 clash erupts — four per crew, two in the fray!' });
    for (const sk of ['player', 'enemy']) for (let pos = 0; pos < DOUBLES_ACTIVE; pos++) {
      const f = this.fighterAt(sk, pos);
      if (f && f.alive) this.onSwitchIn(sk, pos);
    }
  }

  emit(ev) { this.events.push(ev); }
  other(sk) { return sk === 'player' ? 'enemy' : 'player'; }
  fighterAt(sk, pos) { const idx = this.sides[sk].field[pos]; return idx == null ? null : this.sides[sk].crew[idx]; }
  livingPositions(sk) { const r = []; for (let pos = 0; pos < DOUBLES_ACTIVE; pos++) { const f = this.fighterAt(sk, pos); if (f && f.alive) r.push(pos); } return r; }
  benchIndices(sk) { const s = this.sides[sk]; return s.crew.map((f, i) => i).filter(i => s.crew[i].alive && !s.field.includes(i)); }
  oppActives(sk) { const o = this.other(sk); return this.livingPositions(o).map(pos => ({ pos, f: this.fighterAt(o, pos) })); }
  partnerPos(sk, pos) { const other = pos === 0 ? 1 : 0; const f = this.fighterAt(sk, other); return f && f.alive ? other : null; }
  crewAlive(sk) { return this.sides[sk].crew.some(f => f.alive); }

  abilityOf(sk, pos) {
    const f = this.fighterAt(sk, pos);
    if (!f || !f.alive) return null;
    if (f.def.ability.kind !== 'nullify' && this.oppActives(sk).some(o => o.f.def.ability.kind === 'nullify')) return null;
    return f.def.ability;
  }

  effOff(f, ab, cat) {
    const sp = cat === 'special';
    let v = (sp ? f.baseSatk : f.baseAtk) * f.stageMult(sp ? 'satk' : 'atk');
    if (ab && (ab.kind === 'lowHpBoost' || ab.kind === 'lowHpAtk') && f.hp <= f.maxHp / 2) v *= ab.mult;
    if (f.status === 'burn') v *= 0.75;
    return v;
  }
  effDef(f, cat, ignoreBuffs) {
    const sp = cat === 'special';
    let mult = f.stageMult(sp ? 'sdef' : 'def');
    if (ignoreBuffs && mult > 1) mult = 1;
    return (sp ? f.baseSdef : f.baseDef) * mult;
  }
  effSpd(f, ab) {
    let v = f.baseSpd * f.stageMult('spd');
    if (ab && ab.kind === 'lowHpBoost' && f.hp <= f.maxHp / 2) v *= ab.mult;
    if (f.status === 'para') v *= 0.5;
    return v;
  }
  movePriority(ab, mv) {
    let p = mv.prio || 0;
    if (ab && ab.kind === 'statusPriority' && mv.pow === 0) p += 1;
    return p;
  }

  changeStage(sk, pos, stat, delta) {
    const f = this.fighterAt(sk, pos);
    const before = f.stages[stat];
    f.stages[stat] = Math.max(-4, Math.min(4, before + delta));
    const changed = f.stages[stat] - before;
    if (changed !== 0) this.emit({ t: 'stat', side: sk, slot: pos, stat, delta: changed });
    return changed;
  }

  onSwitchIn(sk, pos) {
    const ab = this.abilityOf(sk, pos), f = this.fighterAt(sk, pos);
    if (ab && ab.kind === 'intimidate') {
      for (const o of this.oppActives(sk)) {
        if (this.changeStage(this.other(sk), o.pos, 'atk', -1))
          this.emit({ t: 'log', msg: `👁️ ${f.name}'s ${ab.name} presses down on ${o.f.name} — Attack fell!` });
      }
    }
  }

  /* voluntary switch: front-liner at pos swaps with a living bench mate */
  doSwitch(sk, pos, toCrewIdx) {
    const s = this.sides[sk];
    if (toCrewIdx == null || !s.crew[toCrewIdx] || !s.crew[toCrewIdx].alive || s.field.includes(toCrewIdx)) return false;
    const old = this.fighterAt(sk, pos);
    if (old) { old.stunned = false; old.protecting = false; old.protectStreak = 0; }   // stat stages persist
    s.field[pos] = toCrewIdx;
    this.emit({ t: 'switch', side: sk, slot: pos, name: s.crew[toCrewIdx].name });
    this.emit({ t: 'log', msg: `${sk === 'player' ? '🏴‍☠️' : '🏴'} ${old ? old.name + ' falls back — ' : ''}${s.crew[toCrewIdx].name} takes the front!` });
    this.onSwitchIn(sk, pos);
    return true;
  }

  canAct(sk, pos) {
    const f = this.fighterAt(sk, pos);
    if (f.stunned) {
      f.stunned = false;
      this.emit({ t: 'log', msg: `💫 ${f.name} is stunned and can't move!` });
      this.emit({ t: 'anim', kind: 'stunned', side: sk, slot: pos });
      return false;
    }
    if (f.status === 'freeze') {
      if (chance(25)) { f.status = null; this.emit({ t: 'status', side: sk, slot: pos, status: null }); this.emit({ t: 'log', msg: `🧊 ${f.name} broke out of the ice!` }); }
      else { this.emit({ t: 'log', msg: `🧊 ${f.name} is frozen solid!` }); return false; }
    }
    if (f.status === 'sleep') {
      if (f.sleepTurns <= 0) { f.status = null; this.emit({ t: 'status', side: sk, slot: pos, status: null }); this.emit({ t: 'log', msg: `☀️ ${f.name} woke up!` }); }
      else { f.sleepTurns--; this.emit({ t: 'log', msg: `💤 ${f.name} is fast asleep...` }); return false; }
    }
    if (f.status === 'para' && chance(20)) { this.emit({ t: 'log', msg: `⚡ ${f.name} is paralyzed and can't move!` }); return false; }
    return true;
  }

  applyStatus(sk, pos, status, sourceNote) {
    const f = this.fighterAt(sk, pos);
    if (!f || !f.alive || f.status) return;
    const ab = this.abilityOf(sk, pos);
    if (status === 'burn' && ab && ab.burnImmune) { this.emit({ t: 'log', msg: `🔥 ${f.name} walks through flames unburnt!` }); return; }
    if ((status === 'burn' || status === 'poison') && ab && ab.kind === 'immortal') { this.emit({ t: 'log', msg: `👁️ ${f.name}'s immortal body rejects the affliction!` }); return; }
    f.status = status;
    if (status === 'sleep') f.sleepTurns = randInt(1, 3);
    this.emit({ t: 'status', side: sk, slot: pos, status });
    this.emit({ t: 'log', msg: `${statusEmoji(status)} ${f.name} is ${STATUS_NAMES[status]}!${sourceNote ? ' (' + sourceNote + ')' : ''}` });
  }
  applyStun(sk, pos, sourceNote) {
    const f = this.fighterAt(sk, pos);
    if (!f || !f.alive || f.stunned) return;
    f.stunned = true;
    this.emit({ t: 'log', msg: `💫 ${f.name} is stunned!${sourceNote ? ' (' + sourceNote + ')' : ''}` });
  }

  /* Faithful port of single-battle useMove, addressed by (side, position). */
  resolveMove(uSk, uPos, mv, tSk, tPos) {
    const user = this.fighterAt(uSk, uPos);
    if (!this.canAct(uSk, uPos)) return;
    const fx = mv.fx || {};
    if (!fx.protect) user.protectStreak = 0;

    this.emit({ t: 'log', msg: `${uSk === 'player' ? '▶' : '◀'} ${user.name} used ${mv.name}!`, move: mv, side: uSk, slot: uPos });
    this.emit({ t: 'anim', kind: 'attack', side: uSk, slot: uPos, moveType: mv.type, status: mv.pow === 0 });

    const userAb = this.abilityOf(uSk, uPos);
    const target = (tSk != null && tPos != null) ? this.fighterAt(tSk, tPos) : null;
    const targetAb = target ? this.abilityOf(tSk, tPos) : null;

    if (fx.protect) {
      const successCh = 100 / (user.protectStreak + 1);
      if (chance(successCh)) { user.protecting = true; user.protectStreak++; this.emit({ t: 'anim', kind: 'protect', side: uSk, slot: uPos }); this.emit({ t: 'log', msg: `🛡️ ${user.name} braces behind a guard!` }); }
      else { user.protectStreak = 0; this.emit({ t: 'log', msg: `🛡️ ${user.name}'s guard failed!` }); }
      return;
    }

    if (mv.pow === 0) {
      if (fx.heal) {
        const healed = Math.min(Math.floor(user.maxHp * fx.heal / 100), user.maxHp - user.hp);
        user.hp += healed;
        this.emit({ t: 'heal', side: uSk, slot: uPos, amount: healed, hp: user.hp });
        this.emit({ t: 'log', msg: `💚 ${user.name} recovered ${healed} HP!` });
      }
      if (fx.self) for (const [stat, d] of Object.entries(fx.self))
        if (this.changeStage(uSk, uPos, stat, d)) this.emit({ t: 'log', msg: `📈 ${user.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}${Math.abs(d) > 1 ? ' sharply' : ''}!` });
      // team rally: buff both front-liners on the user's side
      if (fx.team) for (const pos of this.livingPositions(uSk)) for (const [stat, d] of Object.entries(fx.team))
        if (this.changeStage(uSk, pos, stat, d)) this.emit({ t: 'log', msg: `📣 ${this.fighterAt(uSk, pos).name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}${Math.abs(d) > 1 ? ' sharply' : ''}!` });
      // partner support: heal / buff the ally
      if (fx.allyHeal || fx.allyBuff) {
        const ap = this.partnerPos(uSk, uPos);
        if (ap == null) { this.emit({ t: 'log', msg: `…but there's no partner to help!` }); }
        else {
          const ally = this.fighterAt(uSk, ap);
          if (fx.allyHeal) { const h = Math.min(Math.floor(ally.maxHp * fx.allyHeal / 100), ally.maxHp - ally.hp); ally.hp += h; this.emit({ t: 'heal', side: uSk, slot: ap, amount: h, hp: ally.hp }); this.emit({ t: 'log', msg: `💞 ${user.name} mends ${ally.name} for ${h} HP!` }); }
          if (fx.allyBuff) for (const [stat, d] of Object.entries(fx.allyBuff))
            if (this.changeStage(uSk, ap, stat, d)) this.emit({ t: 'log', msg: `📈 ${ally.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}${Math.abs(d) > 1 ? ' sharply' : ''}!` });
        }
      }
      // redirect: draw the foes' single-target attacks onto this fighter
      if (fx.redirect) { this.sides[uSk].redirect = uPos; this.emit({ t: 'log', msg: `🌀 ${user.name} draws the enemy's attacks!` }); }
      // wide guard: shield the whole side from spread attacks this turn
      if (fx.wideGuard) { this.sides[uSk].wideGuard = true; this.emit({ t: 'anim', kind: 'protect', side: uSk, slot: uPos }); this.emit({ t: 'log', msg: `🛡️ ${user.name} raises a wide guard over the crew!` }); }
      // trick room: flip the speed order for a few turns
      if (fx.trickRoom) {
        this.trickRoom = this.trickRoom > 0 ? 0 : 5;
        this.emit({ t: 'log', msg: this.trickRoom ? `🌀 ${user.name} twists the dimensions — Trick Room!` : `🌀 ${user.name} dispels the Trick Room!` });
      }
      if (fx.enemy || fx.sleep || fx.stun) {
        if (!target || !target.alive) { this.emit({ t: 'log', msg: 'But there was no target...' }); return; }
        if (target.protecting) { this.emit({ t: 'log', msg: `🛡️ ${target.name}'s guard holds firm!` }); return; }
        if (targetAb && targetAb.kind === 'dodge' && chance(targetAb.chance)) { this.emit({ t: 'log', msg: `💨 ${target.name} slipped away — ${targetAb.name}!` }); return; }
        const hits = (userAb && userAb.kind === 'neverMiss') || fx.neverMiss || chance(mv.acc);
        if (!hits) { this.emit({ t: 'log', msg: `💨 But it missed!` }); return; }
        if (fx.enemy) for (const [stat, d] of Object.entries(fx.enemy))
          if (this.changeStage(tSk, tPos, stat, d)) this.emit({ t: 'log', msg: `📉 ${target.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}${Math.abs(d) > 1 ? ' sharply' : ''}!` });
        if (fx.sleep && chance(fx.sleep)) this.applyStatus(tSk, tPos, 'sleep');
        if (fx.stun && chance(fx.stun)) this.applyStun(tSk, tPos);
      }
      return;
    }

    // wide guard turns aside an incoming spread attack entirely
    if (fx.spread && this.sides[this.other(uSk)].wideGuard) {
      this.emit({ t: 'anim', kind: 'blocked', side: this.other(uSk), slot: this.livingPositions(this.other(uSk))[0] });
      this.emit({ t: 'log', msg: `🛡️ The wide guard turns aside ${user.name}'s ${mv.name}!` });
      return;
    }
    // target list: spread hits every living foe (0.75x with two), else the chosen one
    const targets = fx.spread ? this.oppActives(uSk).map(o => [this.other(uSk), o.pos]) : [[tSk, tPos]];
    if (!targets.length || !this.fighterAt(targets[0][0], targets[0][1])) { this.emit({ t: 'log', msg: 'But there was no target...' }); return; }
    const spreadFactor = (fx.spread && targets.length > 1) ? 0.75 : 1;
    let grandTotal = 0;

    for (const [tk, tp] of targets) {
      const tgt = this.fighterAt(tk, tp);
      if (!tgt || !tgt.alive) continue;
      const tAb = this.abilityOf(tk, tp);
      if (tgt.protecting) { this.emit({ t: 'anim', kind: 'blocked', side: tk, slot: tp }); this.emit({ t: 'log', msg: `🛡️ ${tgt.name}'s guard blocked the attack!` }); continue; }
      if (tAb && tAb.kind === 'immuneType' && tAb.type === mv.type) { this.emit({ t: 'log', msg: `🤡 It passed right through — ${tgt.name}'s ${tAb.name}!` }); continue; }
      if (tAb && tAb.kind === 'dodge' && chance(tAb.chance)) { this.emit({ t: 'log', msg: `💨 ${tgt.name} dodged — ${tAb.name}!` }); continue; }
      const neverMiss = (userAb && userAb.kind === 'neverMiss') || fx.neverMiss;
      if (!neverMiss && !chance(mv.acc)) { this.emit({ t: 'log', msg: `💨 ${user.name}'s attack missed ${tgt.name}!` }); continue; }

      let eff = typeEffectiveness(mv.type, tgt.def.types);
      if (eff > 0 && eff < 1 && userAb && userAb.kind === 'pierce') { eff = 1; this.emit({ t: 'log', msg: `👑 ${user.name}'s supreme Haki cuts through the resistance!` }); }
      if (eff === 0) { this.emit({ t: 'log', msg: `🛡️ It doesn't affect ${tgt.name} at all!` }); continue; }

      const nHits = fx.multi ? randInt(fx.multi[0], fx.multi[1]) : 1;
      let dealt = 0, landedCrit = false;
      for (let h = 0; h < nHits; h++) {
        if (!tgt.alive) break;
        let critCh = 6.25 + (fx.critBoost || 0), critMult = 1.5;
        if (userAb && userAb.kind === 'critChance') critCh += userAb.bonus;
        if (userAb && userAb.kind === 'superCrit') { critCh += userAb.bonus; critMult = userAb.mult; }
        const isCrit = chance(critCh);
        if (isCrit) landedCrit = true;
        const A = this.effOff(user, userAb, mv.cat);
        const ignoreBuffs = (userAb && userAb.kind === 'ignoreBuffs');
        const D = fx.ignoreDef ? (mv.cat === 'special' ? tgt.baseSdef : tgt.baseDef) : this.effDef(tgt, mv.cat, ignoreBuffs);
        let dmg = ((2 * LEVEL / 5 + 2) * mv.pow * (A / D)) / 50 + 2;
        if (user.def.types.includes(mv.type)) dmg *= 1.5;
        dmg *= eff;
        if (isCrit) dmg *= critMult;
        dmg *= 0.85 + rngFloat() * 0.15;
        dmg *= spreadFactor;
        if (userAb && userAb.kind === 'typeBoost' && userAb.type === mv.type) dmg *= userAb.mult;
        if (userAb && userAb.kind === 'executioner' && tgt.hp <= tgt.maxHp / 2) dmg *= userAb.mult;
        if (userAb && userAb.kind === 'transform' && user.hp <= user.maxHp / 2) dmg *= userAb.out;
        if (tAb && tAb.kind === 'armorTypes' && tAb.types.includes(mv.type)) dmg *= tAb.mult;
        if (tAb && tAb.kind === 'scales' && tgt.hp > tgt.maxHp / 2) dmg *= tAb.mult;
        if (tAb && tAb.kind === 'transform' && tgt.hp <= tgt.maxHp / 2) dmg *= tAb.in;
        if (tgt.def.ability.kind === 'nullify') dmg *= tgt.def.ability.dmgIn;
        dmg = Math.max(1, Math.floor(dmg));
        const survAb = tAb && tAb.kind === 'survive';
        if (survAb && !tgt.usedSurvive && dmg >= tgt.hp) { dmg = tgt.hp - 1; tgt.usedSurvive = true; this.emit({ t: 'log', msg: `🌙 ${tgt.name} refuses to fall — ${tAb.name}!` }); }
        tgt.hp = Math.max(0, tgt.hp - dmg);
        dealt += dmg; grandTotal += dmg;
        this.emit({ t: 'damage', side: tk, slot: tp, amount: dmg, hp: tgt.hp, eff, crit: isCrit, moveType: mv.type });
      }
      if (nHits > 1) this.emit({ t: 'log', msg: `🌀 Hit ${nHits} times!` });
      if (landedCrit) this.emit({ t: 'log', msg: `💥 A critical hit!` });
      if (eff > 1) this.emit({ t: 'log', msg: `🔥 Super effective on ${tgt.name}!` });
      else if (eff < 1) this.emit({ t: 'log', msg: `🌫️ Not very effective on ${tgt.name}...` });

      if (dealt > 0 && tgt.alive) {
        let burnCh = (fx.burn || 0);
        if (userAb && userAb.kind === 'bonusBurn') burnCh += userAb.chance;
        if (burnCh && chance(burnCh)) this.applyStatus(tk, tp, 'burn');
        if (fx.poison && chance(fx.poison)) this.applyStatus(tk, tp, 'poison');
        if (fx.para && chance(fx.para)) this.applyStatus(tk, tp, 'para');
        if (fx.freeze && chance(fx.freeze)) this.applyStatus(tk, tp, 'freeze');
        if (fx.sleep && chance(fx.sleep)) this.applyStatus(tk, tp, 'sleep');
        let stunCh = (fx.stun || 0);
        if (userAb && userAb.kind === 'bonusStun') stunCh += userAb.chance;
        if (stunCh && chance(stunCh)) this.applyStun(tk, tp);
        if (fx.enemy && chance(fx.enemyChance !== undefined ? fx.enemyChance : 100))
          for (const [stat, d] of Object.entries(fx.enemy))
            if (this.changeStage(tk, tp, stat, d)) this.emit({ t: 'log', msg: `📉 ${tgt.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}!` });
        if (tAb && tAb.kind === 'thorns' && user.alive && chance(tAb.chance)) {
          if (tAb.status === 'stun') this.applyStun(uSk, uPos, `💘 ${tAb.name}!`);
          else this.applyStatus(uSk, uPos, tAb.status, `${tAb.name}!`);
        }
      }
      if (mv.type === 'FLAME' && tgt.status === 'freeze') { tgt.status = null; this.emit({ t: 'status', side: tk, slot: tp, status: null }); this.emit({ t: 'log', msg: `💧 The ice around ${tgt.name} melted!` }); }
    }

    // once per move: drain / recoil / the user's own stat changes
    if (grandTotal > 0) {
      let drainFrac = (fx.drain || 0) / 100;
      if (userAb && userAb.kind === 'lifesteal') drainFrac = Math.max(drainFrac, userAb.frac);
      if (drainFrac > 0 && user.alive) {
        const healed = Math.min(Math.max(1, Math.floor(grandTotal * drainFrac)), user.maxHp - user.hp);
        if (healed > 0) { user.hp += healed; this.emit({ t: 'heal', side: uSk, slot: uPos, amount: healed, hp: user.hp }); this.emit({ t: 'log', msg: `🩸 ${user.name} drained ${healed} HP!` }); }
      }
      if (fx.recoil && user.alive) {
        const rec = Math.max(1, Math.floor(grandTotal * fx.recoil / 100));
        user.hp = Math.max(0, user.hp - rec);
        this.emit({ t: 'damage', side: uSk, slot: uPos, amount: rec, hp: user.hp, eff: 1, crit: false, recoil: true });
        this.emit({ t: 'log', msg: `💢 ${user.name} is hit with recoil!` });
      }
      if (fx.self && user.alive) for (const [stat, d] of Object.entries(fx.self))
        if (this.changeStage(uSk, uPos, stat, d)) this.emit({ t: 'log', msg: `${d > 0 ? '📈' : '📉'} ${user.name}'s ${statLabel(stat)} ${d > 0 ? 'rose' : 'fell'}!` });
    }
  }

  endOfTurn() {
    if (this.trickRoom > 0 && --this.trickRoom === 0) this.emit({ t: 'log', msg: '🌀 The Trick Room collapsed — speed returns to normal.' });
    if (this.turn === STORM_TURN) this.emit({ t: 'log', msg: '🌊 The sky darkens... a New World storm closes in!' });
    const living = () => [].concat(
      this.livingPositions('player').map(p => ['player', p]),
      this.livingPositions('enemy').map(p => ['enemy', p]));
    if (this.turn > STORM_TURN) for (const [sk, pos] of living()) {
      const f = this.fighterAt(sk, pos);
      const d = Math.max(1, Math.floor(f.maxHp * 0.04 * (this.turn - STORM_TURN)));
      f.hp = Math.max(0, f.hp - d);
      this.emit({ t: 'damage', side: sk, slot: pos, amount: d, hp: f.hp, eff: 1, crit: false, dot: 'storm' });
      this.emit({ t: 'log', msg: `🌊 The storm batters ${f.name}!` });
    }
    for (const [sk, pos] of living()) {
      const f = this.fighterAt(sk, pos);
      if (f.status === 'burn') { const d = Math.max(1, Math.floor(f.maxHp / 16)); f.hp = Math.max(0, f.hp - d); this.emit({ t: 'damage', side: sk, slot: pos, amount: d, hp: f.hp, eff: 1, crit: false, dot: 'burn' }); this.emit({ t: 'log', msg: `🔥 ${f.name} is hurt by its burn!` }); }
      else if (f.status === 'poison') { const d = Math.max(1, Math.floor(f.maxHp / 8)); f.hp = Math.max(0, f.hp - d); this.emit({ t: 'damage', side: sk, slot: pos, amount: d, hp: f.hp, eff: 1, crit: false, dot: 'poison' }); this.emit({ t: 'log', msg: `☠️ ${f.name} is hurt by poison!` }); }
      const ab = this.abilityOf(sk, pos);
      if (ab && (ab.kind === 'regen' || ab.kind === 'immortal') && f.alive && f.hp > 0 && f.hp < f.maxHp) {
        const healed = Math.min(Math.floor(f.maxHp * ab.frac), f.maxHp - f.hp);
        if (healed > 0) { f.hp += healed; this.emit({ t: 'heal', side: sk, slot: pos, amount: healed, hp: f.hp }); this.emit({ t: 'log', msg: `🔵 ${f.name} regenerates ${healed} HP — ${ab.name}!` }); }
      }
    }
    for (const sk of ['player', 'enemy']) { this.sides[sk].crew.forEach(f => { if (f) f.protecting = false; }); this.sides[sk].redirect = null; this.sides[sk].wideGuard = false; }
    this.checkFaints();
  }

  checkFaints() {
    for (const sk of ['player', 'enemy']) for (let pos = 0; pos < DOUBLES_ACTIVE; pos++) {
      const f = this.fighterAt(sk, pos);
      if (!f || f.hp > 0 || f._fainted) continue;
      if (f.def.ability.kind === 'revive' && !f.usedRevive && this.abilityOf(sk, pos)) {
        f.usedRevive = true; f.hp = Math.floor(f.maxHp * f.def.ability.frac); f.status = null; f.stunned = false;
        this.emit({ t: 'heal', side: sk, slot: pos, amount: f.hp, hp: f.hp });
        this.emit({ t: 'log', msg: `🎻 ${f.name}'s soul returns to his bones — ${f.def.ability.name}!` });
        continue;
      }
      f._fainted = true; f.hp = 0; f.status = null;
      this.emit({ t: 'faint', side: sk, slot: pos, name: f.name });
      this.emit({ t: 'log', msg: `💀 ${f.name} is down!` });
      for (const rk of ['player', 'enemy']) this.livingPositions(rk).forEach(rp => {
        const rab = this.abilityOf(rk, rp);
        if (rab && rab.kind === 'rage' && this.changeStage(rk, rp, 'atk', 1))
          this.emit({ t: 'log', msg: `😈 ${this.fighterAt(rk, rp).name}'s ${rab.name} swells — Attack rose!` });
      });
    }
    this.checkWin();
  }
  checkWin() {
    if (this.over) return;
    const p = this.crewAlive('player'), e = this.crewAlive('enemy');
    if (!p && !e) { this.over = true; this.winner = 'draw'; this.emit({ t: 'end', winner: 'draw' }); }
    else if (!e) { this.over = true; this.winner = 'player'; this.emit({ t: 'end', winner: 'player' }); }
    else if (!p) { this.over = true; this.winner = 'enemy'; this.emit({ t: 'end', winner: 'enemy' }); }
  }

  /* fill emptied front-line positions: enemy auto, player by prompt */
  resolveReplacements() {
    if (this.over) return;
    for (let pos = 0; pos < DOUBLES_ACTIVE; pos++) {
      const f = this.fighterAt('enemy', pos);
      if ((!f || !f.alive) && this.benchIndices('enemy').length) {
        const idx = this.bestReplacement('enemy', pos);
        this.sides.enemy.field[pos] = idx;
        this.emit({ t: 'switch', side: 'enemy', slot: pos, name: this.sides.enemy.crew[idx].name });
        this.emit({ t: 'log', msg: `🏴 The enemy sends out ${this.sides.enemy.crew[idx].name}!` });
        this.onSwitchIn('enemy', pos);
      }
    }
    const need = [];
    for (let pos = 0; pos < DOUBLES_ACTIVE; pos++) { const f = this.fighterAt('player', pos); if ((!f || !f.alive) && this.benchIndices('player').length) need.push(pos); }
    if (need.length) { this.awaiting = { side: 'player', positions: need }; this.emit({ t: 'needReplace', positions: need }); }
  }

  /* player picks a bench fighter (crewIdx) to fill an empty position */
  submitReplace(pos, crewIdx) {
    this.events = [];
    if (!this.awaiting) return this.events;
    const s = this.sides.player;
    if (!s.crew[crewIdx] || !s.crew[crewIdx].alive || s.field.includes(crewIdx)) return this.events;
    s.field[pos] = crewIdx;
    this.emit({ t: 'switch', side: 'player', slot: pos, name: s.crew[crewIdx].name });
    this.emit({ t: 'log', msg: `🏴‍☠️ ${s.crew[crewIdx].name} takes the front!` });
    this.onSwitchIn('player', pos);
    const need = [];
    for (let p = 0; p < DOUBLES_ACTIVE; p++) { const f = this.fighterAt('player', p); if ((!f || !f.alive) && this.benchIndices('player').length) need.push(p); }
    this.awaiting = need.length ? { side: 'player', positions: need } : null;
    if (this.awaiting) this.emit({ t: 'needReplace', positions: need });
    return this.events;
  }

  estDamage(att, def, mv, attAb, defAb) {
    if (!mv || mv.pow === 0 || !def) return 0;
    if (defAb && defAb.kind === 'immuneType' && defAb.type === mv.type) return 0;
    let eff = typeEffectiveness(mv.type, def.def.types);
    if (eff > 0 && eff < 1 && attAb && attAb.kind === 'pierce') eff = 1;
    if (eff === 0) return 0;
    const sp = mv.cat === 'special';
    let A = (sp ? att.baseSatk : att.baseAtk) * att.stageMult(sp ? 'satk' : 'atk');
    if (attAb && (attAb.kind === 'lowHpBoost' || attAb.kind === 'lowHpAtk') && att.hp <= att.maxHp / 2) A *= attAb.mult;
    if (att.status === 'burn') A *= 0.75;
    let defMult = def.stageMult(sp ? 'sdef' : 'def');
    if (attAb && attAb.kind === 'ignoreBuffs' && defMult > 1) defMult = 1;
    const baseD = sp ? def.baseSdef : def.baseDef;
    const D = (mv.fx && mv.fx.ignoreDef) ? baseD : baseD * defMult;
    let dmg = ((2 * LEVEL / 5 + 2) * mv.pow * (A / D)) / 50 + 2;
    if (att.def.types.includes(mv.type)) dmg *= 1.5;
    dmg *= eff * 0.93;
    if (attAb && attAb.kind === 'typeBoost' && attAb.type === mv.type) dmg *= attAb.mult;
    if (attAb && attAb.kind === 'executioner' && def.hp <= def.maxHp / 2) dmg *= attAb.mult;
    if (attAb && attAb.kind === 'transform' && att.hp <= att.maxHp / 2) dmg *= attAb.out;
    if (defAb && defAb.kind === 'armorTypes' && defAb.types.includes(mv.type)) dmg *= defAb.mult;
    if (defAb && defAb.kind === 'scales' && def.hp > def.maxHp / 2) dmg *= defAb.mult;
    if (defAb && defAb.kind === 'transform' && def.hp <= def.maxHp / 2) dmg *= defAb.in;
    if (def.def.ability.kind === 'nullify') dmg *= def.def.ability.dmgIn;
    if (mv.fx && mv.fx.multi) dmg *= (mv.fx.multi[0] + mv.fx.multi[1]) / 2;
    return Math.max(1, Math.floor(dmg));
  }
  hitChance(mv, attAb, defAb) {
    let p = ((attAb && attAb.kind === 'neverMiss') || (mv.fx && mv.fx.neverMiss)) ? 1 : mv.acc / 100;
    if (defAb && defAb.kind === 'dodge') p *= 1 - defAb.chance / 100;
    return p;
  }
  bestExpected(a, b) {
    let abA = a.def.ability, abB = b.def.ability;
    if (abA && abA.kind === 'nullify' && abB && abB.kind !== 'nullify') abB = null;
    if (abB && abB.kind === 'nullify' && abA && abA.kind !== 'nullify') abA = null;
    let best = 0;
    for (const mv of a.moves) { if (mv.pow === 0) continue; const d = this.estDamage(a, b, mv, abA, abB) * this.hitChance(mv, abA, abB); if (d > best) best = d; }
    return best;
  }
  bestReplacement(sk, pos) {
    const bench = this.benchIndices(sk), opps = this.oppActives(sk);
    let best = bench[0], bestSc = -Infinity;
    for (const i of bench) {
      const f = this.sides[sk].crew[i];
      let sc = (f.hp / f.maxHp) * 0.3;
      for (const o of opps) sc += this.bestExpected(f, o.f) / Math.max(1, o.f.hp) - this.bestExpected(o.f, f) / Math.max(1, f.hp);
      if (sc > bestSc) { bestSc = sc; best = i; }
    }
    return best;
  }

  chooseAI(sk, pos) {
    const me = this.fighterAt(sk, pos), myAb = this.abilityOf(sk, pos);
    const opps = this.oppActives(sk), oSide = this.other(sk);
    if (!opps.length) return { type: 'move', idx: 0, target: null };
    let best = { score: -1, idx: 0, target: { side: oSide, pos: opps[0].pos } };
    const consider = (sc, idx, p) => { if (sc > best.score) best = { score: sc, idx, target: { side: oSide, pos: p } }; };
    const partner = this.partnerPos(sk, pos);
    for (let i = 0; i < me.moves.length; i++) {
      const mv = me.moves[i], fx = mv.fx || {};
      if (mv.pow > 0 && fx.spread) {
        // spread: value is the summed (capped) damage across every foe
        const factor = opps.length > 1 ? 0.75 : 1;
        let sc = 0;
        for (const o of opps) {
          const dAb = this.abilityOf(oSide, o.pos);
          const raw = this.estDamage(me, o.f, mv, myAb, dAb) * factor;
          sc += Math.min(raw, o.f.hp) * this.hitChance(mv, myAb, dAb);
          if (raw >= o.f.hp) sc += 35;
        }
        consider(sc, i, opps[0].pos);
      } else if (mv.pow > 0) {
        for (const o of opps) {
          const dAb = this.abilityOf(oSide, o.pos);
          const raw = this.estDamage(me, o.f, mv, myAb, dAb);
          let sc = Math.min(raw, o.f.hp) * this.hitChance(mv, myAb, dAb);
          if (raw >= o.f.hp) sc += 45;
          if (!o.f.status) sc += ((fx.burn || 0) + (fx.poison || 0) + (fx.para || 0) + (fx.freeze || 0) + (fx.sleep || 0)) * 0.4;
          consider(sc, i, o.pos);
        }
      } else {
        const tgt = opps[0];
        let sc = 0;
        if (fx.heal && me.hp < me.maxHp * 0.6) sc = Math.max(sc, Math.min(Math.floor(me.maxHp * fx.heal / 100), me.maxHp - me.hp) * 0.6);
        if (fx.self) sc = Math.max(sc, 16);
        if (fx.protect) sc = Math.max(sc, 9 / (me.protectStreak + 1));
        if (fx.team) sc = Math.max(sc, this.livingPositions(sk).length > 1 ? 30 : 14);
        if ((fx.allyHeal || fx.allyBuff) && partner != null) {
          const ally = this.fighterAt(sk, partner);
          let v = fx.allyBuff ? 18 : 0;
          if (fx.allyHeal) v = Math.max(v, (ally.maxHp - ally.hp) * (fx.allyHeal / 100) * 0.7);
          sc = Math.max(sc, v);
        }
        if (fx.redirect && partner != null) sc = Math.max(sc, 10);
        if (fx.wideGuard) sc = Math.max(sc, opps.length > 1 ? 16 / (me.protectStreak + 1) : 3);
        if (fx.trickRoom) sc = Math.max(sc, this.trickRoom > 0 ? 0 : (this.effSpd(me, myAb) < 90 ? 22 : 8));
        if ((fx.sleep || fx.stun) && !tgt.f.status && !tgt.f.stunned) sc = Math.max(sc, 26);
        if (fx.enemy) sc = Math.max(sc, 18);
        consider(sc, i, tgt.pos);
      }
    }
    return { type: 'move', idx: best.idx, target: best.target };
  }

  /* playerActions: [{ pos, type:'move', idx, target:{side,pos} } | { pos, type:'switch', toCrewIdx }] */
  playRound(playerActions) {
    this.events = [];
    if (this.over || this.awaiting) return this.events;
    this.turn++;
    this.emit({ t: 'turnStart', n: this.turn });

    for (const a of (playerActions || [])) if (a.type === 'switch') this.doSwitch('player', a.pos, a.toCrewIdx);

    const movers = [];
    const enq = (sk, pos, act) => {
      const f = this.fighterAt(sk, pos);
      if (!f || !f.alive || !act || act.type !== 'move') return;
      movers.push({ sk, pos, mv: f.moves[act.idx], tgt: act.target });
    };
    for (const a of (playerActions || [])) if (a.type === 'move') enq('player', a.pos, a);
    for (const pos of this.livingPositions('enemy')) enq('enemy', pos, this.chooseAI('enemy', pos));

    movers.sort((a, b) => {
      const pa = this.movePriority(this.abilityOf(a.sk, a.pos), a.mv);
      const pb = this.movePriority(this.abilityOf(b.sk, b.pos), b.mv);
      if (pa !== pb) return pb - pa;
      const sa = this.effSpd(this.fighterAt(a.sk, a.pos), this.abilityOf(a.sk, a.pos));
      const sb = this.effSpd(this.fighterAt(b.sk, b.pos), this.abilityOf(b.sk, b.pos));
      if (sa !== sb) return this.trickRoom > 0 ? sa - sb : sb - sa;
      return rngFloat() < 0.5 ? -1 : 1;
    });

    for (const m of movers) {
      if (this.over) break;
      const f = this.fighterAt(m.sk, m.pos);
      if (!f || !f.alive) continue;
      let tSk = m.tgt ? m.tgt.side : this.other(m.sk);
      let tPos = m.tgt ? m.tgt.pos : this.livingPositions(this.other(m.sk))[0];
      if (!this.fighterAt(tSk, tPos) || !this.fighterAt(tSk, tPos).alive) {
        const liv = this.livingPositions(this.other(m.sk));
        if (liv.length) { tSk = this.other(m.sk); tPos = liv[0]; }
      }
      // redirection: a single-target attack on a side with a live redirector is pulled onto it
      const fxm = m.mv.fx || {};
      if (m.mv.pow > 0 && !fxm.spread) {
        const rp = this.sides[tSk] && this.sides[tSk].redirect;
        if (rp != null && this.fighterAt(tSk, rp) && this.fighterAt(tSk, rp).alive) tPos = rp;
      }
      this.resolveMove(m.sk, m.pos, m.mv, tSk, tPos);
      this.checkFaints();
    }
    if (!this.over) this.endOfTurn();
    this.checkWin();
    if (!this.over) this.resolveReplacements();
    return this.events;
  }
}

/* ===================== TOURNAMENT MODE =====================
   Every fighter duels every other `reps` times (sides alternate
   for fairness). DOM-free so it runs headless; the UI drives it
   in chunks to keep the page responsive. */

function tournamentDuel(idA, idB) {
  const b = new Battle([idA], [idB]);
  let guard = 0;
  while (!b.over && guard < 200) {
    guard++;
    b.playTurn(b.chooseAI('player'));
  }
  return { winner: b.winner === 'player' ? idA : idB, turns: b.turn };
}

function createTournament(reps) {
  const ids = CHARACTERS.map(c => c.id);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  }
  const h2h = {}, wins = {}, losses = {};
  for (const id of ids) { h2h[id] = {}; wins[id] = 0; losses[id] = 0; }
  return { reps, pairs, idx: 0, h2h, wins, losses, pairTurns: {}, done: false };
}

/* Process up to `pairBudget` pairs (each pair = `reps` duels). Returns true when finished. */
function runTournamentChunk(state, pairBudget) {
  let n = 0;
  while (state.idx < state.pairs.length && n < pairBudget) {
    const [a, b] = state.pairs[state.idx];
    let aWins = 0, totalTurns = 0;
    for (let r = 0; r < state.reps; r++) {
      const res = r % 2 === 0 ? tournamentDuel(a, b) : tournamentDuel(b, a);
      if (res.winner === a) aWins++;
      totalTurns += res.turns;
    }
    state.h2h[a][b] = aWins;
    state.h2h[b][a] = state.reps - aWins;
    state.wins[a] += aWins;
    state.losses[a] += state.reps - aWins;
    state.wins[b] += state.reps - aWins;
    state.losses[b] += aWins;
    state.pairTurns[a + '|' + b] = totalTurns / state.reps;
    state.idx++;
    n++;
  }
  state.done = state.idx >= state.pairs.length;
  return state.done;
}

/* Rankings plus the most interesting series of the tournament. */
function computeTournamentStats(state) {
  const bstOfChar = c => c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd;
  const table = CHARACTERS.map(c => ({
    id: c.id,
    wins: state.wins[c.id],
    losses: state.losses[c.id],
    pct: state.wins[c.id] / Math.max(1, state.wins[c.id] + state.losses[c.id]),
    bst: bstOfChar(c),
  })).sort((x, y) => y.wins - x.wins || y.pct - x.pct || y.bst - x.bst);

  const half = state.reps / 2;
  let upset = null, deadlock = null, domination = null, marathon = null, blitz = null;
  for (const [a, b] of state.pairs) {
    const aw = state.h2h[a][b], bw = state.reps - aw;
    const bstA = bstOfChar(CHAR_BY_ID[a]), bstB = bstOfChar(CHAR_BY_ID[b]);
    const avgT = state.pairTurns[a + '|' + b];

    // upset: the lower-BST fighter takes the series despite a real gap
    const [hiId, loId, hiBst, loBst, loWins] = bstA >= bstB
      ? [a, b, bstA, bstB, bw] : [b, a, bstB, bstA, aw];
    if (loWins > half && hiBst - loBst >= 30) {
      const score = (hiBst - loBst) * (loWins - half);
      if (!upset || score > upset.score) {
        upset = { a: loId, b: hiId, aWins: loWins, bWins: state.reps - loWins, gap: hiBst - loBst, score };
      }
    }
    // deadlock: the closest series, heaviest names break ties
    const closeness = Math.abs(aw - half);
    const weight = bstA + bstB;
    if (!deadlock || closeness < deadlock.closeness ||
        (closeness === deadlock.closeness && weight > deadlock.weight)) {
      deadlock = { a, b, aWins: aw, bWins: bw, closeness, weight };
    }
    // domination: a clean sweep across the smallest stat gap
    if (aw === state.reps || bw === state.reps) {
      const sweeper = aw === state.reps ? a : b;
      const victim = aw === state.reps ? b : a;
      const gap = Math.abs(bstA - bstB);
      if (!domination || gap < domination.gap) {
        domination = { a: sweeper, b: victim, aWins: state.reps, bWins: 0, gap };
      }
    }
    if (!marathon || avgT > marathon.avgTurns) marathon = { a, b, aWins: aw, bWins: bw, avgTurns: avgT };
    if (!blitz || avgT < blitz.avgTurns) blitz = { a, b, aWins: aw, bWins: bw, avgTurns: avgT };
  }

  const rivalries = RIVALRIES.map(r => ({
    a: r.a, b: r.b, label: r.label,
    aWins: state.h2h[r.a][r.b], bWins: state.h2h[r.b][r.a],
  }));

  return { table, upset, deadlock, domination, marathon, blitz, rivalries };
}

function statLabel(s) {
  return { atk: 'Attack', def: 'Defense', satk: 'Sp. Atk', sdef: 'Sp. Def', spd: 'Speed' }[s] || s;
}
function statusEmoji(s) {
  return { burn: '🔥', poison: '☠️', para: '⚡', freeze: '🧊', sleep: '💤' }[s] || '✨';
}

if (typeof module !== 'undefined') {
  module.exports.Battle = Battle;
  module.exports.DoublesBattle = DoublesBattle;
  module.exports.Fighter = Fighter;
  module.exports.tournamentDuel = tournamentDuel;
  module.exports.createTournament = createTournament;
  module.exports.runTournamentChunk = runTournamentChunk;
  module.exports.computeTournamentStats = computeTournamentStats;
}
