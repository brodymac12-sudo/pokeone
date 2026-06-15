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

class Fighter {
  constructor(charDef) {
    this.def = charDef;
    const rs = realStats(charDef.stats);
    this.maxHp = rs.hp;
    this.hp = rs.hp;
    this.baseAtk = rs.atk;
    this.baseDef = rs.def;
    this.baseSpd = rs.spd;
    this.stages = { atk: 0, def: 0, spd: 0 };
    this.status = null;       // burn | poison | para | freeze | sleep
    this.sleepTurns = 0;
    this.stunned = false;     // skips next action
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
  /* playerIds / enemyIds: arrays of character ids */
  constructor(playerIds, enemyIds) {
    this.sides = {
      player: { crew: playerIds.map(id => new Fighter(CHAR_BY_ID[id])), active: 0, isAI: false },
      enemy: { crew: enemyIds.map(id => new Fighter(CHAR_BY_ID[id])), active: 0, isAI: true },
    };
    this.turn = 0;
    this.over = false;
    this.winner = null;
    this.awaitingReplace = false;
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

  effAtk(sideKey) {
    const f = this.active(sideKey);
    let v = f.baseAtk * f.stageMult('atk');
    const ab = this.abilityOf(sideKey);
    if (ab) {
      if (ab.kind === 'lowHpBoost' && f.hp <= f.maxHp / 2) v *= ab.mult;
      if (ab.kind === 'lowHpAtk' && f.hp <= f.maxHp / 2) v *= ab.mult;
    }
    if (f.status === 'burn') v *= 0.75;
    return v;
  }
  effDef(sideKey, ignoreBuffs) {
    const f = this.active(sideKey);
    let mult = f.stageMult('def');
    if (ignoreBuffs && mult > 1) mult = 1;
    return f.baseDef * mult;
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
    if (playerAction.type === 'move') movers.push({ side: 'player', mv: this.active('player').def.moves[playerAction.idx] });
    if (enemyAction.type === 'move') movers.push({ side: 'enemy', mv: this.active('enemy').def.moves[enemyAction.idx] });
    movers.sort((a, b) => {
      const pa = this.movePriority(a.side, a.mv), pb = this.movePriority(b.side, b.mv);
      if (pa !== pb) return pb - pa;
      const sa = this.effSpd(a.side), sb = this.effSpd(b.side);
      if (sa !== sb) return sb - sa;
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
    old.stages = { atk: 0, def: 0, spd: 0 };
    old.stunned = false;
    side.active = idx;
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

    this.emit({ t: 'log', msg: `${userKey === 'player' ? '▶' : '◀'} ${user.name} used ${mv.name}!`, move: mv, side: userKey });
    this.emit({ t: 'anim', kind: 'attack', side: userKey, moveType: mv.type, status: mv.pow === 0 });

    const fx = mv.fx || {};
    const userAb = this.abilityOf(userKey);
    const targetAb = this.abilityOf(targetKey);

    /* ---- status (no-damage) moves ---- */
    if (mv.pow === 0) {
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
      if (fx.enemy || fx.sleep || fx.stun) {
        if (!target.alive) { this.emit({ t: 'log', msg: 'But there was no target...' }); return; }
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

      const A = this.effAtk(userKey);
      const ignoreBuffs = (userAb && userAb.kind === 'ignoreBuffs');
      const D = fx.ignoreDef ? this.active(targetKey).baseDef : this.effDef(targetKey, ignoreBuffs);

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
    let A = att.baseAtk * att.stageMult('atk');
    if (attAb && (attAb.kind === 'lowHpBoost' || attAb.kind === 'lowHpAtk') && att.hp <= att.maxHp / 2) A *= attAb.mult;
    if (att.status === 'burn') A *= 0.75;
    let defMult = def.stageMult('def');
    if (attAb && attAb.kind === 'ignoreBuffs' && defMult > 1) defMult = 1;
    const D = (mv.fx && mv.fx.ignoreDef) ? def.baseDef : def.baseDef * defMult;
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
    for (const mv of a.def.moves) {
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

    for (let i = 0; i < me.def.moves.length; i++) {
      const mv = me.def.moves[i];
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

    /* ---- switch consideration ---- */
    if (!lateStorm) {
      const curScore = this.matchupScore(me, opp);
      let bestIdx = -1, bestGain = 0;
      side.crew.forEach((f, i) => {
        if (!f.alive || i === side.active) return;
        const incoming = this.bestExpected(opp, f);     // free hit on the switch-in
        if (incoming >= f.hp) return;                   // never switch into a KO
        const gain = this.matchupScore(f, opp) - curScore - (incoming / f.maxHp) * 0.55;
        if (gain > bestGain) { bestGain = gain; bestIdx = i; }
      });
      if (bestIdx >= 0 && bestGain > 0.38 && curScore < -0.12 && opp.hp > opp.maxHp * 0.3) {
        options.push({ action: { type: 'switch', idx: bestIdx }, score: 40 + bestGain * 110 });
      }
    }

    /* ---- jittered argmax with slight imperfection ---- */
    for (const o of options) o.score *= 0.93 + rngFloat() * 0.14;
    options.sort((a, b) => b.score - a.score);
    if (options.length > 1 && rngFloat() < 0.1) return options[1].action;
    return options[0].action;
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

function statLabel(s) { return s === 'atk' ? 'Attack' : s === 'def' ? 'Defense' : 'Speed'; }
function statusEmoji(s) {
  return { burn: '🔥', poison: '☠️', para: '⚡', freeze: '🧊', sleep: '💤' }[s] || '✨';
}

if (typeof module !== 'undefined') {
  module.exports.Battle = Battle;
  module.exports.Fighter = Fighter;
  module.exports.tournamentDuel = tournamentDuel;
  module.exports.createTournament = createTournament;
  module.exports.runTournamentChunk = runTournamentChunk;
  module.exports.computeTournamentStats = computeTournamentStats;
}
