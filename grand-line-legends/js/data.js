/* ============================================================
   GRAND LINE LEGENDS — Game Data
   Types, type chart, characters, moves, abilities, crews

   Balance philosophy: stat totals follow the manga's power
   hierarchy (Roger/Imu/Rocks > Emperors > Admirals > Warlords
   > crew support). Weaker fighters compensate with high-value
   status moves and utility abilities, not raw stats.
   Almost every damaging move carries a secondary effect or a
   chance of one — battles are decided by effects, not just HP.
   ============================================================ */

const TYPES = {
  SLASH:     { name: 'Slash',     color: '#7e93a8', text: '#fff' },
  STRIKE:    { name: 'Strike',    color: '#d97f35', text: '#fff' },
  SHOT:      { name: 'Shot',      color: '#8a9a3a', text: '#fff' },
  FLAME:     { name: 'Flame',     color: '#e8542f', text: '#fff' },
  ICE:       { name: 'Ice',       color: '#6cc3de', text: '#053040' },
  LIGHTNING: { name: 'Lightning', color: '#f0c93a', text: '#403005' },
  LIGHT:     { name: 'Light',     color: '#f7e27e', text: '#4a3c05' },
  DARKNESS:  { name: 'Darkness',  color: '#4a2d6e', text: '#fff' },
  RUBBER:    { name: 'Rubber',    color: '#e85a8a', text: '#fff' },
  POISON:    { name: 'Poison',    color: '#9a4ad4', text: '#fff' },
  SAND:      { name: 'Sand',      color: '#cfae62', text: '#403005' },
  SEA:       { name: 'Sea',       color: '#3a7bd4', text: '#fff' },
  TREMOR:    { name: 'Tremor',    color: '#9c4a38', text: '#fff' },
  BEAST:     { name: 'Beast',     color: '#a4703a', text: '#fff' },
  SOUL:      { name: 'Soul',      color: '#b09ae8', text: '#241a40' },
  HAKI:      { name: 'Haki',      color: '#33334a', text: '#fff' },
};

/* Attacker -> Defender multipliers. Missing entry = 1x.
   Lore rules baked in:
   - Physical types (Slash/Strike/Shot) deal half to intangible Logia
     elements (Flame, Lightning, Light, Sand, Sea).
   - Haki strikes the true body: 2x vs Logia elements, Rubber, Darkness, Tremor.
   - Rubber is IMMUNE to Lightning (Luffy vs Enel).
   - Sea douses Flame, clumps Sand, drains Rubber (devil-fruit bane).
   - Darkness drags in elemental users but its bearer is frail. */
const TYPE_CHART = {
  SLASH:     { BEAST: 2, RUBBER: 2, SHOT: 2, FLAME: 0.5, LIGHTNING: 0.5, LIGHT: 0.5, SAND: 0.5, SEA: 0.5, ICE: 0.5 },
  STRIKE:    { SLASH: 2, ICE: 2, RUBBER: 0.5, FLAME: 0.5, LIGHTNING: 0.5, LIGHT: 0.5, SAND: 0.5, SEA: 0.5 },
  SHOT:      { STRIKE: 2, BEAST: 2, SLASH: 0.5, RUBBER: 0.5, FLAME: 0.5, LIGHTNING: 0.5, LIGHT: 0.5, SAND: 0.5, SEA: 0.5 },
  FLAME:     { ICE: 2, BEAST: 2, POISON: 2, SEA: 0.5, FLAME: 0.5, SAND: 0.5 },
  ICE:       { SEA: 2, RUBBER: 2, BEAST: 2, FLAME: 0.5, ICE: 0.5 },
  LIGHTNING: { SEA: 2, SLASH: 2, RUBBER: 0, SAND: 0.5, LIGHTNING: 0.5 },
  LIGHT:     { DARKNESS: 2, SOUL: 2, LIGHT: 0.5 },
  DARKNESS:  { LIGHT: 2, SOUL: 2, FLAME: 2, LIGHTNING: 2, RUBBER: 2, HAKI: 0.5, DARKNESS: 0.5 },
  RUBBER:    { STRIKE: 2, SHOT: 2, SLASH: 0.5 },
  POISON:    { BEAST: 2, STRIKE: 2, SEA: 2, ICE: 0.5, POISON: 0.5, SAND: 0.5 },
  SAND:      { FLAME: 2, LIGHTNING: 2, BEAST: 2, SEA: 0.5 },
  SEA:       { FLAME: 2, SAND: 2, RUBBER: 2, POISON: 2, LIGHTNING: 0.5, ICE: 0.5, SEA: 0.5 },
  TREMOR:    { ICE: 2, SLASH: 2, SEA: 2, RUBBER: 0.5, TREMOR: 0.5 },
  BEAST:     { STRIKE: 2, SOUL: 0.5 },
  SOUL:      { BEAST: 2, HAKI: 0.5, DARKNESS: 0.5, SOUL: 0.5 },
  HAKI:      { FLAME: 2, LIGHTNING: 2, LIGHT: 2, SAND: 2, RUBBER: 2, DARKNESS: 2, TREMOR: 2, HAKI: 0.5 },
};

function typeEffectiveness(moveType, defenderTypes) {
  let mult = 1;
  for (const t of defenderTypes) {
    const row = TYPE_CHART[moveType];
    if (row && row[t] !== undefined) mult *= row[t];
  }
  return mult;
}

/* Damage class by type: martial / armament arts strike the body (Physical,
   uses Attack vs Defense); devil-fruit & elemental powers are Special (uses
   Sp. Atk vs Sp. Def). A move may override with its own `cat`. */
const TYPE_CATEGORY = {
  SLASH: 'physical', STRIKE: 'physical', SHOT: 'physical', RUBBER: 'physical',
  TREMOR: 'physical', BEAST: 'physical', HAKI: 'physical',
  FLAME: 'special', ICE: 'special', LIGHTNING: 'special', LIGHT: 'special',
  DARKNESS: 'special', POISON: 'special', SAND: 'special', SEA: 'special', SOUL: 'special',
};
function moveCategory(m) { return m.cat || TYPE_CATEGORY[m.type] || 'physical'; }

/* ---- Move effect fields ----
   pow: 0 = status move. acc: percent. prio: move priority.
   fx: { burn/poison/para/freeze/sleep/stun: % chance on hit,
         self:  {atk,def,spd} stage changes applied to user (always),
         enemy: {atk,def,spd} stage changes applied to target,
         enemyChance: % chance for enemy stat changes (default 100),
         heal: % of max HP restored to user,
         drain: % of damage dealt restored to user,
         recoil: % of damage dealt taken by user,
         multi: [min,max] hits, ignoreDef: true, critBoost: %, neverMiss: true } */

const CHARACTERS = [
  /* ================= STRAW HAT PIRATES ================= */
  {
    id: 'luffy', name: 'Monkey D. Luffy', epithet: 'Straw Hat — Fifth Emperor', crew: 'Straw Hat Pirates',
    types: ['RUBBER', 'HAKI'],
    stats: { hp: 105, atk: 122, def: 85, spd: 112 },   // BST 424 — Emperor tier
    ability: { name: 'Gear Shift', desc: 'Below half HP, Attack and Speed rise 30%.', kind: 'lowHpBoost', mult: 1.3 },
    moves: [
      { name: 'Gum-Gum Jet Pistol', type: 'RUBBER', pow: 75, acc: 100, prio: 1 },
      { name: 'Gum-Gum Elephant Gun', type: 'RUBBER', pow: 105, acc: 95, fx: { stun: 20 } },
      { name: 'Red Hawk', type: 'FLAME', pow: 85, acc: 100, fx: { burn: 30 } },
      { name: 'Bajrang Gun', type: 'HAKI', pow: 130, acc: 85, fx: { recoil: 20 } },
    ],
  },
  {
    id: 'zoro', name: 'Roronoa Zoro', epithet: 'King of Hell', crew: 'Straw Hat Pirates',
    types: ['SLASH', 'HAKI'],
    stats: { hp: 95, atk: 124, def: 88, spd: 92 },     // BST 399
    ability: { name: 'Three-Sword Style', desc: 'Critical hit chance raised by 25%.', kind: 'critChance', bonus: 25 },
    moves: [
      { name: 'Oni Giri', type: 'SLASH', pow: 80, acc: 100, fx: { critBoost: 25 } },
      { name: 'Three Thousand Worlds', type: 'SLASH', pow: 110, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'King of Hell Slash', type: 'HAKI', pow: 95, acc: 95, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: 'Asura: Demon Nine Flash', type: 'SLASH', pow: 42, acc: 90, fx: { multi: [3, 3] } },
    ],
  },
  {
    id: 'nami', name: 'Nami', epithet: 'Cat Burglar', crew: 'Straw Hat Pirates',
    types: ['LIGHTNING', 'SEA'],
    stats: { hp: 72, atk: 82, def: 68, spd: 106 },     // BST 328 — support: weather control
    ability: { name: 'Weather Witch', desc: 'Her status moves always act first (+1 priority).', kind: 'statusPriority' },
    moves: [
      { name: 'Thunderbolt Tempo', type: 'LIGHTNING', pow: 90, acc: 95, fx: { para: 30 } },
      { name: 'Cyclone Tempo', type: 'SEA', pow: 0, acc: 90, fx: { enemy: { spd: -2 } } },
      { name: 'Mirage Tempo', type: 'SEA', pow: 0, acc: 100, fx: { self: { spd: 2 } } },
      { name: 'Zeus Breeze Tempo', type: 'LIGHTNING', pow: 115, acc: 85, fx: { para: 10 } },
    ],
  },
  {
    id: 'usopp', name: 'Usopp', epithet: 'God of Snipers', crew: 'Straw Hat Pirates',
    types: ['SHOT'],
    stats: { hp: 70, atk: 86, def: 64, spd: 86 },      // BST 306 — never-miss utility sniper
    ability: { name: "Sniper's Eye", desc: 'His moves never miss.', kind: 'neverMiss' },
    moves: [
      { name: 'Fire Bird Star', type: 'FLAME', pow: 85, acc: 100, fx: { burn: 30 } },
      { name: 'Lead Star', type: 'SHOT', pow: 75, acc: 100, fx: { stun: 20 } },
      { name: 'Sleep Star', type: 'BEAST', pow: 0, acc: 75, fx: { sleep: 100 } },
      { name: 'Sure-Kill Atlas Comet', type: 'SHOT', pow: 110, acc: 90, fx: { critBoost: 25 } },
    ],
  },
  {
    id: 'sanji', name: 'Vinsmoke Sanji', epithet: 'Black Leg', crew: 'Straw Hat Pirates',
    types: ['STRIKE', 'FLAME'],
    stats: { hp: 88, atk: 112, def: 82, spd: 112 },    // BST 394
    ability: { name: 'Diable Jambe', desc: 'Flame moves gain 30% power; cannot be burned.', kind: 'typeBoost', type: 'FLAME', mult: 1.3, burnImmune: true },
    moves: [
      { name: 'Premier Hachis', type: 'FLAME', pow: 90, acc: 100, fx: { burn: 20 } },
      { name: 'Anti-Manner Kick Course', type: 'STRIKE', pow: 105, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: 'Hell Memories', type: 'FLAME', pow: 120, acc: 85, fx: { burn: 30 } },
      { name: 'Sky Walk', type: 'STRIKE', pow: 0, acc: 100, fx: { self: { spd: 2 } } },
    ],
  },
  {
    id: 'chopper', name: 'Tony Tony Chopper', epithet: 'Cotton Candy Lover', crew: 'Straw Hat Pirates',
    types: ['BEAST'],
    stats: { hp: 84, atk: 84, def: 90, spd: 70 },      // BST 328 — doctor: heal + setup
    ability: { name: 'Monster Point', desc: 'Below half HP his Attack rises 50%.', kind: 'lowHpAtk', mult: 1.5 },
    moves: [
      { name: 'Heavy Gong', type: 'STRIKE', pow: 85, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'Kokutei Roseo', type: 'BEAST', pow: 80, acc: 100, fx: { stun: 20 } },
      { name: "Doctor's Care", type: 'BEAST', pow: 0, acc: 100, fx: { heal: 50 } },
      { name: 'Rumble Ball', type: 'BEAST', pow: 0, acc: 100, fx: { self: { atk: 2 } } },
    ],
  },
  {
    id: 'robin', name: 'Nico Robin', epithet: 'Devil Child', crew: 'Straw Hat Pirates',
    types: ['STRIKE', 'SOUL'],
    stats: { hp: 80, atk: 92, def: 74, spd: 86 },      // BST 332 — stun utility
    ability: { name: 'Demonio Fleur', desc: 'Her attacks have a 20% chance to stun with a sprouted grip.', kind: 'bonusStun', chance: 20 },
    moves: [
      { name: 'Clutch', type: 'STRIKE', pow: 85, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'Mil Fleur: Gigantesco Mano', type: 'STRIKE', pow: 115, acc: 85 },
      { name: 'Demonio Fleur', type: 'SOUL', pow: 95, acc: 95 },
      { name: 'Ojos Fleur', type: 'SOUL', pow: 0, acc: 100, fx: { enemy: { def: -2 } } },
    ],
  },
  {
    id: 'franky', name: 'Franky', epithet: 'Iron Man', crew: 'Straw Hat Pirates',
    types: ['SHOT', 'STRIKE'],
    stats: { hp: 96, atk: 98, def: 112, spd: 58 },     // BST 364 — armored wall
    ability: { name: 'BF-37 Armor', desc: 'Slash and Shot moves deal half damage to him.', kind: 'armorTypes', types: ['SLASH', 'SHOT'], mult: 0.5 },
    moves: [
      { name: 'Radical Beam', type: 'LIGHT', pow: 110, acc: 90, fx: { burn: 20 } },
      { name: 'Strong Right', type: 'STRIKE', pow: 80, acc: 100, fx: { stun: 20 } },
      { name: 'Franky Fireball', type: 'FLAME', pow: 85, acc: 95, fx: { burn: 20 } },
      { name: 'General Shield', type: 'STRIKE', pow: 0, acc: 100, fx: { self: { def: 2 } } },
    ],
  },
  {
    id: 'brook', name: 'Brook', epithet: 'Soul King', crew: 'Straw Hat Pirates',
    types: ['SOUL', 'SLASH'],
    stats: { hp: 76, atk: 94, def: 66, spd: 116 },     // BST 352 — fast disruptor + revive
    ability: { name: 'Yomi Yomi Revival', desc: 'Once per battle, revives at 30% HP upon fainting.', kind: 'revive', frac: 0.3 },
    moves: [
      { name: 'Soul Solid', type: 'ICE', pow: 85, acc: 100, fx: { freeze: 20 } },
      { name: "Phrase d'Armes", type: 'SLASH', pow: 90, acc: 100, fx: { critBoost: 25 } },
      { name: 'Nemuriuta Flanc', type: 'SOUL', pow: 0, acc: 75, fx: { sleep: 100 } },
      { name: 'Soul Parade', type: 'SOUL', pow: 80, acc: 100, fx: { drain: 50 } },
    ],
  },
  {
    id: 'jinbe', name: 'Jinbe', epithet: 'Knight of the Sea', crew: 'Straw Hat Pirates',
    types: ['SEA', 'STRIKE'],
    stats: { hp: 112, atk: 102, def: 108, spd: 66 },   // BST 388
    ability: { name: 'Fish-Man Karate', desc: 'Sea moves gain 30% power.', kind: 'typeBoost', type: 'SEA', mult: 1.3 },
    moves: [
      { name: 'Vagabond Drill', type: 'STRIKE', pow: 95, acc: 100, fx: { stun: 20 } },
      { name: 'Shark Brick Fist', type: 'SEA', pow: 90, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'Demon Brick Fist', type: 'SEA', pow: 120, acc: 85 },
      { name: 'Water Heart', type: 'SEA', pow: 0, acc: 100, fx: { heal: 50 } },
    ],
  },

  /* ================= MARINES & WORLD GOVERNMENT ================= */
  {
    id: 'garp', name: 'Monkey D. Garp', epithet: 'The Hero / The Fist', crew: 'Marines',
    types: ['STRIKE', 'HAKI'],
    stats: { hp: 112, atk: 132, def: 98, spd: 78 },    // BST 420 — the man who cornered Roger
    ability: { name: 'Fist of Love', desc: 'His attacks never miss.', kind: 'neverMiss' },
    moves: [
      { name: 'Galaxy Impact', type: 'HAKI', pow: 120, acc: 90, fx: { stun: 20 } },
      { name: 'Fist of Love', type: 'STRIKE', pow: 85, acc: 100, fx: { stun: 20 } },
      { name: 'Cannonball Toss', type: 'SHOT', pow: 90, acc: 95, fx: { burn: 20 } },
      { name: 'Blue Hole', type: 'STRIKE', pow: 110, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } },
    ],
  },
  {
    id: 'akainu', name: 'Sakazuki', epithet: 'Akainu — Red Dog', crew: 'Marines',
    types: ['FLAME', 'TREMOR'],
    stats: { hp: 105, atk: 128, def: 104, spd: 72 },   // BST 409 — Admiral tier
    ability: { name: 'Absolute Justice', desc: 'Deals 30% more damage to foes below half HP.', kind: 'executioner', mult: 1.3 },
    moves: [
      { name: 'Great Eruption', type: 'FLAME', pow: 110, acc: 90, fx: { burn: 20 } },
      { name: 'Meteor Volcano', type: 'FLAME', pow: 95, acc: 95, fx: { burn: 30 } },
      { name: 'Hellhound', type: 'BEAST', pow: 90, acc: 100, fx: { burn: 20 } },
      { name: 'Magma Fist', type: 'TREMOR', pow: 100, acc: 95, fx: { burn: 30 } },
    ],
  },
  {
    id: 'aokiji', name: 'Kuzan', epithet: 'Aokiji — Blue Pheasant', crew: 'Marines',
    types: ['ICE'],
    stats: { hp: 100, atk: 112, def: 100, spd: 86 },   // BST 398
    ability: { name: 'Ice Time', desc: 'Attackers who strike him have a 20% chance to freeze.', kind: 'thorns', status: 'freeze', chance: 20 },
    moves: [
      { name: 'Ice Age', type: 'ICE', pow: 110, acc: 90, fx: { freeze: 20 } },
      { name: 'Ice Saber', type: 'SLASH', pow: 90, acc: 100, fx: { freeze: 10 } },
      { name: 'Cold Snap', type: 'ICE', pow: 0, acc: 90, fx: { enemy: { spd: -2 } } },
      { name: 'Pheasant Beak', type: 'ICE', pow: 120, acc: 85, fx: { freeze: 20 } },
    ],
  },
  {
    id: 'kizaru', name: 'Borsalino', epithet: 'Kizaru — Yellow Monkey', crew: 'Marines',
    types: ['LIGHT'],
    stats: { hp: 90, atk: 106, def: 86, spd: 130 },    // BST 412 — fastest admiral
    ability: { name: 'Light Speed', desc: '25% chance to dodge any incoming move.', kind: 'dodge', chance: 25 },
    moves: [
      { name: 'Yasakani Sacred Jewel', type: 'LIGHT', pow: 42, acc: 90, fx: { multi: [2, 3] } },
      { name: 'Light Speed Kick', type: 'LIGHT', pow: 85, acc: 100, prio: 1 },
      { name: 'Ama no Murakumo', type: 'SLASH', pow: 90, acc: 100, fx: { critBoost: 25 } },
      { name: 'Yata Mirror', type: 'LIGHT', pow: 0, acc: 100, fx: { self: { satk: 1, spd: 1 } } },
    ],
  },
  {
    id: 'magellan', name: 'Magellan', epithet: 'Warden of Impel Down', crew: 'World Government',
    types: ['POISON'],
    stats: { hp: 110, atk: 108, def: 104, spd: 56 },   // BST 378
    ability: { name: 'Venom Demon Body', desc: 'Attackers who strike him have a 30% chance to be poisoned.', kind: 'thorns', status: 'poison', chance: 30 },
    moves: [
      { name: 'Hydra', type: 'POISON', pow: 95, acc: 100, fx: { poison: 30 } },
      { name: 'Noxious Cloud', type: 'POISON', pow: 0, acc: 90, fx: { poison: 100 } },
      { name: 'Kinjite: Venom Demon', type: 'POISON', pow: 125, acc: 80, fx: { poison: 30 } },
      { name: 'Poison Blowfish', type: 'POISON', pow: 80, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } },
    ],
  },

  /* ================= WARLORDS ================= */
  {
    id: 'mihawk', name: 'Dracule Mihawk', epithet: "Hawk Eyes — World's Strongest Swordsman", crew: 'Seven Warlords',
    types: ['SLASH', 'HAKI'],
    stats: { hp: 90, atk: 138, def: 84, spd: 98 },     // BST 410 — apex duelist
    ability: { name: "World's Strongest Sword", desc: 'Crit chance +15% and his crits deal 2.5x damage.', kind: 'superCrit', bonus: 15, mult: 2.5 },
    moves: [
      { name: "World's Strongest Slash", type: 'SLASH', pow: 125, acc: 85, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: 'Black Blade Cross', type: 'HAKI', pow: 95, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'Air-Splitting Slash', type: 'SLASH', pow: 90, acc: 100, fx: { critBoost: 25 } },
      { name: "Hawk's Gaze", type: 'SLASH', pow: 0, acc: 100, fx: { enemy: { def: -2 } } },
    ],
  },
  {
    id: 'crocodile', name: 'Crocodile', epithet: 'Desert King', crew: 'Seven Warlords',
    types: ['SAND'],
    stats: { hp: 92, atk: 106, def: 92, spd: 82 },     // BST 372
    ability: { name: 'Desert Drought', desc: 'His attacks dehydrate, healing him for 25% of damage dealt.', kind: 'lifesteal', frac: 0.25 },
    moves: [
      { name: 'Desert Spada', type: 'SAND', pow: 95, acc: 100, fx: { enemy: { spd: -1 }, enemyChance: 20 } },
      { name: 'Sables', type: 'SAND', pow: 85, acc: 100, fx: { enemy: { spd: -1 }, enemyChance: 30 } },
      { name: 'Desert Girasole', type: 'SAND', pow: 115, acc: 85, fx: { stun: 20 } },
      { name: 'Poison Hook', type: 'SLASH', pow: 85, acc: 100, fx: { poison: 30 } },
    ],
  },
  {
    id: 'doflamingo', name: 'Donquixote Doflamingo', epithet: 'Heavenly Demon', crew: 'Seven Warlords',
    types: ['SLASH', 'SOUL'],
    stats: { hp: 92, atk: 112, def: 86, spd: 102 },    // BST 392
    ability: { name: 'Puppet Strings', desc: 'His attacks have a 15% chance to stun the foe like a puppet.', kind: 'bonusStun', chance: 15 },
    moves: [
      { name: 'Overheat', type: 'FLAME', pow: 95, acc: 95, fx: { burn: 20 } },
      { name: 'God Thread', type: 'SLASH', pow: 115, acc: 85, fx: { critBoost: 25 } },
      { name: 'Parasite', type: 'SOUL', pow: 0, acc: 65, fx: { stun: 100 } },
      { name: 'Athlete', type: 'SLASH', pow: 85, acc: 100, fx: { critBoost: 25 } },
    ],
  },
  {
    id: 'hancock', name: 'Boa Hancock', epithet: 'Pirate Empress', crew: 'Seven Warlords',
    types: ['HAKI', 'SOUL'],
    stats: { hp: 82, atk: 106, def: 78, spd: 112 },    // BST 378
    ability: { name: 'Love-Love Charm', desc: 'Attackers who strike her have a 15% chance to be stunned, smitten.', kind: 'thorns', status: 'stun', chance: 15 },
    moves: [
      { name: 'Pistol Kiss', type: 'SOUL', pow: 85, acc: 100, fx: { stun: 10 } },
      { name: 'Perfume Femur', type: 'HAKI', pow: 95, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'Slave Arrow', type: 'SOUL', pow: 105, acc: 90, fx: { stun: 20 } },
      { name: 'Mero Mero Mellow', type: 'SOUL', pow: 0, acc: 100, fx: { enemy: { atk: -2 } } },
    ],
  },
  {
    id: 'law', name: 'Trafalgar Law', epithet: 'Surgeon of Death', crew: 'Heart Pirates',
    types: ['SLASH', 'SOUL'],
    stats: { hp: 86, atk: 102, def: 82, spd: 98 },     // BST 368 — tactician
    ability: { name: 'ROOM', desc: 'His attacks ignore the foe\'s defensive stat boosts.', kind: 'ignoreBuffs' },
    moves: [
      { name: 'Countershock', type: 'LIGHTNING', pow: 95, acc: 100, fx: { para: 20 } },
      { name: 'Gamma Knife', type: 'SOUL', pow: 110, acc: 90, fx: { ignoreDef: true } },
      { name: 'Mes', type: 'SLASH', pow: 0, acc: 90, fx: { enemy: { atk: -2 } } },
      { name: 'Shambles', type: 'SOUL', pow: 0, acc: 100, fx: { self: { def: 1, spd: 1 } } },
    ],
  },

  /* ================= EMPERORS & LEGENDS ================= */
  {
    id: 'shanks', name: 'Shanks', epithet: 'Red-Haired', crew: 'Red Hair Pirates',
    types: ['HAKI'],
    stats: { hp: 100, atk: 128, def: 100, spd: 108 },  // BST 436 — Emperor, Roger's heir
    ability: { name: "Conqueror's Aura", desc: 'On entering battle, the foe\'s Attack falls 1 stage.', kind: 'intimidate' },
    moves: [
      { name: 'Divine Departure', type: 'HAKI', pow: 115, acc: 95, fx: { stun: 20 } },
      { name: 'Red-Haired Slash', type: 'SLASH', pow: 95, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: "Conqueror's Burst", type: 'HAKI', pow: 90, acc: 100, fx: { stun: 20 } },
      { name: "Gryphon's Edge", type: 'SLASH', pow: 105, acc: 90, fx: { critBoost: 25 } },
    ],
  },
  {
    id: 'whitebeard', name: 'Edward Newgate', epithet: 'Whitebeard — Strongest Man', crew: 'Whitebeard Pirates',
    types: ['TREMOR'],
    stats: { hp: 138, atk: 138, def: 96, spd: 58 },    // BST 430 — clashed evenly with Roger
    ability: { name: 'Strongest Man Alive', desc: 'Once per battle, survives a knockout blow with 1 HP.', kind: 'survive' },
    moves: [
      { name: 'Seaquake', type: 'TREMOR', pow: 120, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'Quake Bubble Punch', type: 'TREMOR', pow: 95, acc: 100, fx: { stun: 20 } },
      { name: 'Murakumogiri', type: 'SLASH', pow: 90, acc: 100, fx: { critBoost: 25 } },
      { name: 'Island Shaker', type: 'TREMOR', pow: 140, acc: 75, fx: { self: { def: -1 } } },
    ],
  },
  {
    id: 'ace', name: 'Portgas D. Ace', epithet: 'Fire Fist', crew: 'Whitebeard Pirates',
    types: ['FLAME'],
    stats: { hp: 88, atk: 112, def: 78, spd: 102 },    // BST 380
    ability: { name: 'Mera Mera Blaze', desc: 'All his damaging moves gain +20% burn chance.', kind: 'bonusBurn', chance: 20 },
    moves: [
      { name: 'Fire Fist', type: 'FLAME', pow: 100, acc: 95, fx: { burn: 20 } },
      { name: 'Firefly Light: Fiery Doll', type: 'FLAME', pow: 80, acc: 100, fx: { burn: 30 } },
      { name: 'Cross Fire', type: 'FLAME', pow: 90, acc: 100, fx: { critBoost: 25 } },
      { name: 'Flame Pillar', type: 'FLAME', pow: 120, acc: 85, fx: { burn: 30 } },
    ],
  },
  {
    id: 'marco', name: 'Marco', epithet: 'Marco the Phoenix', crew: 'Whitebeard Pirates',
    types: ['FLAME', 'SOUL'],
    stats: { hp: 100, atk: 92, def: 102, spd: 98 },    // BST 392 — immortal bird, low burst
    ability: { name: 'Blue Phoenix Flames', desc: 'Regenerates 12% of max HP at the end of each turn.', kind: 'regen', frac: 0.12 },
    moves: [
      { name: 'Phoenix Brand', type: 'FLAME', pow: 90, acc: 100, fx: { drain: 25 } },
      { name: 'Talon Strike', type: 'BEAST', pow: 85, acc: 100, fx: { critBoost: 25 } },
      { name: 'Regeneration Flames', type: 'SOUL', pow: 0, acc: 100, fx: { heal: 50 } },
      { name: 'Bluebird', type: 'FLAME', pow: 110, acc: 90, fx: { burn: 20 } },
    ],
  },
  {
    id: 'blackbeard', name: 'Marshall D. Teach', epithet: 'Blackbeard', crew: 'Blackbeard Pirates',
    types: ['DARKNESS', 'TREMOR'],
    stats: { hp: 130, atk: 126, def: 82, spd: 64 },    // BST 402 — two devil fruits
    ability: { name: 'Black Hole', desc: 'Nullifies the foe\'s ability — but darkness pulls attacks in, so he takes 20% more damage.', kind: 'nullify', dmgIn: 1.2 },
    moves: [
      { name: 'Black Hole', type: 'DARKNESS', pow: 95, acc: 100, fx: { enemy: { spd: -1 }, enemyChance: 20 } },
      { name: 'Kurouzu', type: 'DARKNESS', pow: 85, acc: 100, fx: { drain: 30 } },
      { name: 'Blackquake Fist', type: 'TREMOR', pow: 115, acc: 90, fx: { stun: 20 } },
      { name: 'Liberation', type: 'DARKNESS', pow: 125, acc: 80, fx: { enemy: { def: -1 }, enemyChance: 20 } },
    ],
  },
  {
    id: 'kaido', name: 'Kaido', epithet: 'Strongest Creature', crew: 'Beasts Pirates',
    types: ['BEAST', 'FLAME'],
    stats: { hp: 132, atk: 130, def: 110, spd: 62 },   // BST 434
    ability: { name: 'Indestructible Scales', desc: 'Takes 30% less damage while above half HP.', kind: 'scales', mult: 0.7 },
    moves: [
      { name: 'Boro Breath', type: 'FLAME', pow: 110, acc: 90, fx: { burn: 20 } },
      { name: 'Thunder Bagua', type: 'STRIKE', pow: 95, acc: 100, fx: { stun: 20 } },
      { name: 'Ragnaraku', type: 'HAKI', pow: 115, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'Dragon Twister', type: 'BEAST', pow: 100, acc: 95, fx: { enemy: { spd: -1 }, enemyChance: 20 } },
    ],
  },
  {
    id: 'bigmom', name: 'Charlotte Linlin', epithet: 'Big Mom', crew: 'Big Mom Pirates',
    types: ['SOUL', 'LIGHTNING'],
    stats: { hp: 126, atk: 120, def: 116, spd: 52 },   // BST 414
    ability: { name: 'Soul Pocus', desc: 'Steals lifespan — heals 20% of all damage she deals.', kind: 'lifesteal', frac: 0.2 },
    moves: [
      { name: 'Soul Pocus', type: 'SOUL', pow: 95, acc: 100, fx: { drain: 40 } },
      { name: 'Zeus Bolt', type: 'LIGHTNING', pow: 105, acc: 90, fx: { para: 20 } },
      { name: 'Lifespan Tithe', type: 'SOUL', pow: 0, acc: 90, fx: { enemy: { atk: -1, def: -1 } } },
      { name: 'Napoleon Maser Saber', type: 'SLASH', pow: 110, acc: 90, fx: { critBoost: 25 } },
    ],
  },
  {
    id: 'enel', name: 'Enel', epithet: 'God of Skypiea', crew: 'God\'s Army',
    types: ['LIGHTNING'],
    stats: { hp: 76, atk: 116, def: 66, spd: 128 },    // BST 386 — glass cannon prophet
    ability: { name: 'Mantra', desc: 'Foresees attacks — 20% chance to dodge any incoming move.', kind: 'dodge', chance: 20 },
    moves: [
      { name: 'El Thor', type: 'LIGHTNING', pow: 110, acc: 90, fx: { para: 20 } },
      { name: 'Defibrillation', type: 'LIGHTNING', pow: 0, acc: 100, fx: { heal: 40 } },
      { name: '200 Million Volt Amaru', type: 'LIGHTNING', pow: 130, acc: 80, fx: { para: 20 } },
      { name: 'Goro Goro Flash', type: 'LIGHTNING', pow: 75, acc: 100, prio: 1 },
    ],
  },
  {
    id: 'buggy', name: 'Buggy', epithet: 'Genius Jester', crew: 'Cross Guild',
    types: ['SLASH', 'SHOT'],
    stats: { hp: 68, atk: 72, def: 58, spd: 92 },      // BST 290 — pure clown luck
    ability: { name: 'Chop-Chop Fruit', desc: 'Blades pass right through him — immune to Slash moves.', kind: 'immuneType', type: 'SLASH' },
    moves: [
      { name: 'Buggy Ball', type: 'SHOT', pow: 100, acc: 90, fx: { burn: 20 } },
      { name: 'Muggy Ball', type: 'SHOT', pow: 85, acc: 100, fx: { burn: 30 } },
      { name: 'Circus Knife Toss', type: 'SLASH', pow: 80, acc: 100, fx: { critBoost: 25 } },
      { name: 'Chop-Chop Escape', type: 'SLASH', pow: 0, acc: 100, fx: { heal: 25, self: { spd: 1 } } },
    ],
  },

  /* ================= GODS OF THE FINAL SAGA ================= */
  {
    id: 'roger', name: 'Gol D. Roger', epithet: 'The Pirate King', crew: 'Roger Pirates',
    types: ['HAKI'],
    stats: { hp: 110, atk: 138, def: 102, spd: 112 },  // BST 462 — no fruit, pure supreme Haki
    ability: { name: "Pirate King's Haki", desc: 'Supreme Armament pierces all defenses — his moves are never resisted (below-1x becomes 1x).', kind: 'pierce' },
    moves: [
      { name: 'Kamusari', type: 'HAKI', pow: 120, acc: 95, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: "Ace's Edge", type: 'SLASH', pow: 95, acc: 100, fx: { critBoost: 25 } },
      { name: 'Clash of Kings', type: 'HAKI', pow: 95, acc: 100, fx: { stun: 20 } },
      { name: 'Voice of All Things', type: 'SOUL', pow: 0, acc: 100, fx: { enemy: { spd: -2 } } },
    ],
  },
  {
    id: 'rocks', name: 'Rocks D. Xebec', epithet: 'Captain of the Rocks Pirates', crew: 'Rocks Pirates',
    types: ['DARKNESS', 'HAKI'],
    stats: { hp: 122, atk: 140, def: 86, spd: 98 },    // BST 446 — demonized at God Valley
    ability: { name: 'Demonized Ambition', desc: 'Corrupted by Domi Reversi — whenever any fighter falls, his Attack rises 1 stage.', kind: 'rage' },
    moves: [
      { name: "Demon's Rampage", type: 'DARKNESS', pow: 115, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } },
      { name: 'God Valley Cataclysm', type: 'HAKI', pow: 130, acc: 80, fx: { recoil: 15 } },
      { name: "Davy's Grudge", type: 'DARKNESS', pow: 90, acc: 100, fx: { drain: 30 } },
      { name: 'King of the World', type: 'HAKI', pow: 0, acc: 100, fx: { self: { atk: 2 } } },
    ],
  },
  {
    id: 'imu', name: 'Imu', epithet: 'Ruler of the Empty Throne', crew: 'World Government',
    types: ['DARKNESS', 'SOUL'],
    stats: { hp: 118, atk: 112, def: 128, spd: 96 },   // BST 454 — the Akuma no Mi
    ability: { name: 'Akuma no Mi', desc: 'Immortal sovereign — regenerates 10% HP each turn and cannot be burned or poisoned.', kind: 'immortal', frac: 0.1 },
    moves: [
      { name: 'Omen Legion', type: 'SOUL', pow: 95, acc: 100, fx: { stun: 20 } },
      { name: 'Domi Reversi', type: 'DARKNESS', pow: 0, acc: 90, fx: { enemy: { atk: -2 } } },
      { name: 'Mother Flame', type: 'LIGHT', pow: 130, acc: 80, fx: { burn: 20 } },
      { name: 'Spider of the Void', type: 'DARKNESS', pow: 90, acc: 100, fx: { stun: 20 } },
    ],
  },
  {
    id: 'loki', name: 'Loki', epithet: 'The Accursed Prince of Elbaph', crew: 'Elbaph',
    types: ['BEAST', 'LIGHTNING'],
    stats: { hp: 130, atk: 128, def: 98, spd: 66 },    // BST 422 — Nidhöggr + Ragnir
    ability: { name: 'Nidhöggr Awakening', desc: 'Below half HP the black dragon wakes — deals 25% more and takes 15% less damage.', kind: 'transform', out: 1.25, in: 0.85 },
    moves: [
      { name: 'Nidhöggr Breath', type: 'LIGHTNING', pow: 120, acc: 85, fx: { para: 20 } },
      { name: 'Ragnir Thunderbolt', type: 'LIGHTNING', pow: 95, acc: 100, fx: { para: 30 } },
      { name: 'World Tree Crash', type: 'BEAST', pow: 105, acc: 95, fx: { stun: 20 } },
      { name: 'Curse of the Accursed', type: 'DARKNESS', pow: 0, acc: 90, fx: { enemy: { atk: -1, spd: -1 } } },
    ],
  },
];

/* ---- Expanded movepools ----
   Each fighter's `moves` array begins with their 4 canonical signature
   moves (the default loadout). Below we append two more thematic moves
   plus a universal Protect, growing every pool to 7 so players can pick
   any 4 in the crew builder. Battles default to the first 4, so the
   power hierarchy and existing balance are unchanged unless the player
   customizes a moveset. */
const EXTRA_MOVES = {
  luffy:      [{ name: 'Gum-Gum Gatling', type: 'RUBBER', pow: 38, acc: 100, fx: { multi: [2, 4] } }, { name: 'Gear Fourth: Kong Gun', type: 'HAKI', pow: 115, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } }],
  zoro:       [{ name: 'Tatsumaki', type: 'SLASH', pow: 90, acc: 95, fx: { enemy: { spd: -1 }, enemyChance: 20 } }, { name: 'Black Rope Dragon Twister', type: 'SLASH', pow: 100, acc: 90, fx: { critBoost: 25 } }],
  nami:       [{ name: 'Rain Tempo', type: 'SEA', pow: 0, acc: 100, fx: { self: { def: 1, spd: 1 } } }, { name: 'Thunder Lance Tempo', type: 'LIGHTNING', pow: 100, acc: 90, fx: { para: 20 } }],
  usopp:      [{ name: 'Pop Green: Devil', type: 'BEAST', pow: 90, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 30 } }, { name: 'Impact Wolf', type: 'STRIKE', pow: 80, acc: 100, fx: { stun: 20 } }],
  sanji:      [{ name: 'Concasse', type: 'STRIKE', pow: 100, acc: 90, fx: { stun: 20 } }, { name: 'Ifrit Jambe', type: 'FLAME', pow: 120, acc: 85, fx: { burn: 30 } }],
  chopper:    [{ name: 'Guard Point', type: 'BEAST', pow: 0, acc: 100, fx: { self: { def: 2 } } }, { name: 'Horn Point', type: 'BEAST', pow: 85, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 20 } }],
  robin:      [{ name: 'Cien Fleur: Wing', type: 'STRIKE', pow: 90, acc: 100, fx: { stun: 15 } }, { name: 'Spider Web', type: 'SOUL', pow: 0, acc: 100, fx: { enemy: { spd: -2 } } }],
  franky:     [{ name: 'Coup de Vent', type: 'SHOT', pow: 110, acc: 85, fx: { enemy: { def: -1 }, enemyChance: 20 } }, { name: 'Franky Rocket', type: 'SHOT', pow: 80, acc: 100, fx: { stun: 20 } }],
  brook:      [{ name: 'Gavotte Bond en Avant', type: 'SLASH', pow: 105, acc: 90, fx: { critBoost: 25 } }, { name: 'Swallow Bond à Terre', type: 'SLASH', pow: 90, acc: 95, fx: { enemy: { spd: -1 }, enemyChance: 20 } }],
  jinbe:      [{ name: 'Karakusagawara Seiken', type: 'SEA', pow: 110, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } }, { name: 'Onigawara Seiken', type: 'STRIKE', pow: 95, acc: 100, fx: { stun: 20 } }],
  garp:       [{ name: 'Iron Fist Meteor', type: 'STRIKE', pow: 110, acc: 90, fx: { stun: 20 } }, { name: 'Karma Cannon', type: 'HAKI', pow: 100, acc: 95, fx: { enemy: { def: -1 }, enemyChance: 20 } }],
  akainu:     [{ name: 'Dai Funka', type: 'FLAME', pow: 120, acc: 85, fx: { burn: 30 } }, { name: 'Ryusei Kazan', type: 'FLAME', pow: 40, acc: 95, fx: { multi: [2, 3], burn: 10 } }],
  aokiji:     [{ name: 'Ice Block: Partisan', type: 'ICE', pow: 95, acc: 100, fx: { freeze: 10 } }, { name: 'Frozen Lake', type: 'ICE', pow: 0, acc: 100, fx: { enemy: { spd: -2 } } }],
  kizaru:     [{ name: 'Amaterasu', type: 'LIGHT', pow: 120, acc: 85, fx: { burn: 20 } }, { name: 'Eight-Span Crow Mirror', type: 'LIGHT', pow: 0, acc: 100, fx: { self: { spd: 2 } } }],
  magellan:   [{ name: 'Venom Road', type: 'POISON', pow: 105, acc: 90, fx: { poison: 30 } }, { name: 'Doku Fugu', type: 'POISON', pow: 90, acc: 100, fx: { enemy: { spd: -1 }, enemyChance: 30 } }],
  mihawk:     [{ name: 'Kokuto Yoru', type: 'SLASH', pow: 115, acc: 90, fx: { critBoost: 25 } }, { name: 'Crescent Moon Slash', type: 'SLASH', pow: 95, acc: 100, fx: { enemy: { spd: -1 }, enemyChance: 20 } }],
  crocodile:  [{ name: 'Ground Death', type: 'SAND', pow: 110, acc: 90, fx: { enemy: { spd: -1 }, enemyChance: 30 } }, { name: 'Desert Encierro', type: 'SAND', pow: 0, acc: 100, fx: { enemy: { atk: -1, spd: -1 } } }],
  doflamingo: [{ name: 'Off White Shield', type: 'SLASH', pow: 0, acc: 100, fx: { self: { def: 2 } } }, { name: 'Five-Color String', type: 'SLASH', pow: 100, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } }],
  hancock:    [{ name: 'Snake Strike', type: 'SOUL', pow: 90, acc: 100, fx: { stun: 10 } }, { name: "Salome's Coil", type: 'HAKI', pow: 100, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 20 } }],
  law:        [{ name: 'Takt', type: 'SOUL', pow: 90, acc: 100, fx: { stun: 15 } }, { name: 'Amputate', type: 'SLASH', pow: 110, acc: 85, fx: { ignoreDef: true } }],
  shanks:     [{ name: 'Sovereign Presence', type: 'HAKI', pow: 0, acc: 100, fx: { enemy: { atk: -2 } } }, { name: "Hawkeye's Rival", type: 'SLASH', pow: 100, acc: 90, fx: { critBoost: 25 } }],
  whitebeard: [{ name: 'Tsunami', type: 'TREMOR', pow: 110, acc: 90, fx: { enemy: { spd: -1 }, enemyChance: 20 } }, { name: 'Trident Quake', type: 'TREMOR', pow: 95, acc: 100, fx: { stun: 20 } }],
  ace:        [{ name: 'Entei', type: 'FLAME', pow: 110, acc: 90, fx: { burn: 30 } }, { name: 'Shinka: Shiranui', type: 'FLAME', pow: 40, acc: 95, fx: { multi: [2, 3], burn: 10 } }],
  marco:      [{ name: 'Phoenix Talons', type: 'BEAST', pow: 95, acc: 95, fx: { critBoost: 25 } }, { name: 'Rebirth Embers', type: 'SOUL', pow: 0, acc: 100, fx: { self: { def: 1, spd: 1 } } }],
  blackbeard: [{ name: 'Black Vortex', type: 'DARKNESS', pow: 100, acc: 90, fx: { drain: 30 } }, { name: 'Quake Cannon', type: 'TREMOR', pow: 120, acc: 85, fx: { stun: 20 } }],
  kaido:      [{ name: 'Kaifu', type: 'HAKI', pow: 110, acc: 90, fx: { stun: 20 } }, { name: 'Blast Breath', type: 'FLAME', pow: 95, acc: 95, fx: { burn: 30 } }],
  bigmom:     [{ name: 'Prometheus Blaze', type: 'FLAME', pow: 105, acc: 90, fx: { burn: 20 } }, { name: 'Ikoku Sovereignty', type: 'SOUL', pow: 110, acc: 85, fx: { drain: 30 } }],
  enel:       [{ name: 'Mamaragan', type: 'LIGHTNING', pow: 120, acc: 85, fx: { para: 20 } }, { name: 'Vari', type: 'LIGHTNING', pow: 40, acc: 95, fx: { multi: [2, 3], para: 10 } }],
  buggy:      [{ name: 'Chop-Chop Cannon', type: 'SHOT', pow: 95, acc: 90, fx: { burn: 20 } }, { name: 'Chop-Chop Festival', type: 'SLASH', pow: 40, acc: 90, fx: { multi: [2, 3] } }],
  roger:      [{ name: 'Divine Edge', type: 'HAKI', pow: 110, acc: 90, fx: { stun: 20 } }, { name: "Oro Jackson's Wake", type: 'SLASH', pow: 100, acc: 90, fx: { critBoost: 25 } }],
  rocks:      [{ name: "Tyrant's Grip", type: 'DARKNESS', pow: 100, acc: 90, fx: { drain: 30 } }, { name: 'Ambition of the Strongest', type: 'HAKI', pow: 120, acc: 85, fx: { enemy: { def: -1 }, enemyChance: 30 } }],
  imu:        [{ name: 'Holy Light', type: 'LIGHT', pow: 110, acc: 90, fx: { burn: 20 } }, { name: "Throne's Decree", type: 'SOUL', pow: 95, acc: 100, fx: { enemy: { atk: -1 }, enemyChance: 30 } }],
  loki:       [{ name: 'Dragon Maw', type: 'BEAST', pow: 110, acc: 90, fx: { stun: 20 } }, { name: 'Storm of Elbaph', type: 'LIGHTNING', pow: 95, acc: 95, fx: { para: 30 } }],
};

/* Universal tactical move available to every fighter. */
const PROTECT_MOVE = { name: 'Protect', type: 'HAKI', pow: 0, acc: 100, prio: 4, fx: { protect: true } };

/* ---- Doubles (2v2) moves ----
   Tagged `doubles: true` and appended after Protect, so they sit late in the
   pool: the default loadout (first 4 = signature moves) is unchanged, and the
   single-battle/tournament balance is untouched. The crew builder only offers
   these in 2v2 mode, and the doubles AI builds doubles-aware loadouts. They
   define the 2v2 meta:
     • spread  — strikes BOTH foes (0.75x with two targets)
     • team    — rallies your whole side (speed/attack control)
     • allyHeal/allyBuff — support your partner
     • redirect — draw the foes' single-target attacks onto a tank */
const DOUBLES_MOVES = {
  // spread attackers
  enel:       [{ name: 'Mamaragan Deluge', type: 'LIGHTNING', pow: 90, acc: 90, doubles: true, fx: { spread: true, para: 20 } }],
  akainu:     [{ name: 'Meteor Volcano Rain', type: 'FLAME', pow: 90, acc: 90, doubles: true, fx: { spread: true, burn: 20 } }],
  aokiji:     [{ name: 'Ice Age: Glacial Sweep', type: 'ICE', pow: 85, acc: 90, doubles: true, fx: { spread: true, freeze: 10 } }],
  kizaru:     [{ name: 'Yasakani Barrage', type: 'LIGHT', pow: 90, acc: 90, doubles: true, fx: { spread: true } }],
  whitebeard: [{ name: 'Seaquake Shockwave', type: 'TREMOR', pow: 95, acc: 90, doubles: true, fx: { spread: true, enemy: { def: -1 }, enemyChance: 20 } }],
  bigmom:     [{ name: 'Indra Thunderclap', type: 'LIGHTNING', pow: 90, acc: 90, doubles: true, fx: { spread: true, para: 10 } }],
  magellan:   [{ name: 'Venom Fog', type: 'POISON', pow: 70, acc: 95, doubles: true, fx: { spread: true, poison: 30 } }],
  crocodile:  [{ name: 'Desert Storm', type: 'SAND', pow: 85, acc: 90, doubles: true, fx: { spread: true, enemy: { spd: -1 }, enemyChance: 20 } }],
  kaido:      [{ name: 'Boro Breath: Sweep', type: 'FLAME', pow: 90, acc: 90, doubles: true, fx: { spread: true, burn: 20 } }],
  buggy:      [{ name: 'Buggy Ball Barrage', type: 'SHOT', pow: 80, acc: 90, doubles: true, fx: { spread: true, burn: 10 } }],
  imu:        [{ name: 'Mother Flame: Cataclysm', type: 'LIGHT', pow: 100, acc: 85, doubles: true, fx: { spread: true, burn: 20 } }],
  doflamingo: [{ name: 'Birdcage', type: 'SLASH', pow: 80, acc: 95, doubles: true, fx: { spread: true, enemy: { spd: -1 }, enemyChance: 20 } }],
  // team rally (speed / attack control)
  nami:       [{ name: 'Tailwind Tempo', type: 'SEA', pow: 0, acc: 100, doubles: true, fx: { team: { spd: 2 } } }],
  shanks:     [{ name: "Conqueror's Command", type: 'HAKI', pow: 0, acc: 100, doubles: true, fx: { team: { atk: 1 } } }],
  // partner support
  chopper:    [{ name: 'Cure-All Pulse', type: 'BEAST', pow: 0, acc: 100, doubles: true, fx: { allyHeal: 50 } }],
  marco:      [{ name: 'Phoenix Grace', type: 'FLAME', pow: 0, acc: 100, doubles: true, fx: { allyHeal: 35, allyBuff: { def: 1 } } }],
  law:        [{ name: 'Scan & Mend', type: 'SOUL', pow: 0, acc: 100, doubles: true, fx: { allyHeal: 30, allyBuff: { spd: 1 } } }],
  robin:      [{ name: 'Mil Fleur: Shelter', type: 'SOUL', pow: 0, acc: 100, doubles: true, fx: { allyBuff: { def: 1, spd: 1 } } }],
  // tanks that draw fire
  jinbe:      [{ name: "Knight's Vanguard", type: 'SEA', pow: 0, acc: 100, prio: 3, doubles: true, fx: { redirect: true, self: { def: 1 } } }],
  franky:     [{ name: 'Fortress Mode', type: 'STRIKE', pow: 0, acc: 100, prio: 3, doubles: true, fx: { redirect: true, self: { def: 1 } } }],
};

/* Field-control moves. Trick Room flips the turn order for a few turns
   (a boon to slow heavyweights) and works in any mode. Wide Guard shields
   the whole side from a spread attack for the turn — a 2v2-only tool. */
const FIELD_MOVES = {
  bigmom:     [{ name: 'Soul Reversal', type: 'SOUL', pow: 0, acc: 100, prio: -1, fx: { trickRoom: true } }],
  magellan:   [{ name: 'Venom Dominion', type: 'POISON', pow: 0, acc: 100, prio: -1, fx: { trickRoom: true } }],
  kaido:      [{ name: 'Beast King Roar', type: 'HAKI', pow: 0, acc: 100, prio: -1, fx: { trickRoom: true } }],
  imu:        [{ name: 'Reverse the Throne', type: 'DARKNESS', pow: 0, acc: 100, prio: -1, fx: { trickRoom: true } }],
  whitebeard: [{ name: 'Gura Bubble Wall', type: 'TREMOR', pow: 0, acc: 100, prio: -1, fx: { trickRoom: true } }],
};
const WIDE_GUARD = {
  franky:     [{ name: 'Iron Wall', type: 'STRIKE', pow: 0, acc: 100, prio: 3, doubles: true, fx: { wideGuard: true } }],
  whitebeard: [{ name: "Pops' Aegis", type: 'TREMOR', pow: 0, acc: 100, prio: 3, doubles: true, fx: { wideGuard: true } }],
  hancock:    [{ name: 'Salome Shield', type: 'HAKI', pow: 0, acc: 100, prio: 3, doubles: true, fx: { wideGuard: true } }],
  jinbe:      [{ name: 'Sea-Wall Stance', type: 'SEA', pow: 0, acc: 100, prio: 3, doubles: true, fx: { wideGuard: true } }],
};

for (const c of CHARACTERS) {
  if (EXTRA_MOVES[c.id]) c.moves.push(...EXTRA_MOVES[c.id].map(m => ({ ...m })));
  c.moves.push({ ...PROTECT_MOVE });
  if (FIELD_MOVES[c.id]) c.moves.push(...FIELD_MOVES[c.id].map(m => ({ ...m })));
  if (DOUBLES_MOVES[c.id]) c.moves.push(...DOUBLES_MOVES[c.id].map(m => ({ ...m })));
  if (WIDE_GUARD[c.id]) c.moves.push(...WIDE_GUARD[c.id].map(m => ({ ...m })));
}

/* ---- Physical / Special stat split ----
   Each fighter declares an offensive style and a defensive bias; we split
   the base atk into Attack/Sp.Atk and base def into Defense/Sp.Def around
   those leanings. The PRIMARY offense keeps the old Attack value (so a
   fighter's main moves hit as hard as before) and average defense is
   preserved — the split adds matchup depth without upending the hierarchy.
   off: 'phys' | 'spec' | 'mixed' ; bulk: 'phys' | 'spec' | 'even'. */
const STYLE = {
  luffy: { off: 'phys', bulk: 'even' }, zoro: { off: 'phys', bulk: 'even' },
  nami: { off: 'spec', bulk: 'even' }, usopp: { off: 'phys', bulk: 'even' },
  sanji: { off: 'phys', bulk: 'even' }, chopper: { off: 'phys', bulk: 'phys' },
  robin: { off: 'phys', bulk: 'even' }, franky: { off: 'phys', bulk: 'phys' },
  brook: { off: 'spec', bulk: 'spec' }, jinbe: { off: 'spec', bulk: 'phys' },
  garp: { off: 'phys', bulk: 'phys' }, akainu: { off: 'spec', bulk: 'phys' },
  aokiji: { off: 'spec', bulk: 'even' }, kizaru: { off: 'spec', bulk: 'spec' },
  magellan: { off: 'spec', bulk: 'phys' }, mihawk: { off: 'phys', bulk: 'even' },
  crocodile: { off: 'spec', bulk: 'even' }, doflamingo: { off: 'phys', bulk: 'even' },
  hancock: { off: 'spec', bulk: 'spec' }, law: { off: 'spec', bulk: 'even' },
  shanks: { off: 'phys', bulk: 'even' }, whitebeard: { off: 'phys', bulk: 'phys' },
  ace: { off: 'spec', bulk: 'even' }, marco: { off: 'spec', bulk: 'spec' },
  blackbeard: { off: 'spec', bulk: 'even' }, kaido: { off: 'phys', bulk: 'phys' },
  bigmom: { off: 'spec', bulk: 'even' }, enel: { off: 'spec', bulk: 'spec' },
  buggy: { off: 'phys', bulk: 'even' }, roger: { off: 'phys', bulk: 'even' },
  rocks: { off: 'spec', bulk: 'even' }, imu: { off: 'spec', bulk: 'spec' },
  loki: { off: 'spec', bulk: 'phys' },
};
function deriveStats(c) {
  const s = c.stats, st = STYLE[c.id] || { off: 'mixed', bulk: 'even' };
  const r = v => Math.round(v);
  let atk, satk;
  if (st.off === 'phys') { atk = s.atk; satk = r(s.atk * 0.6); }
  else if (st.off === 'spec') { satk = s.atk; atk = r(s.atk * 0.6); }
  else { atk = r(s.atk * 0.92); satk = r(s.atk * 0.92); }
  let def, sdef;
  if (st.bulk === 'phys') { def = r(s.def * 1.12); sdef = r(s.def * 0.88); }
  else if (st.bulk === 'spec') { sdef = r(s.def * 1.12); def = r(s.def * 0.88); }
  else { def = s.def; sdef = s.def; }
  c.stats = { hp: s.hp, atk, def, satk, sdef, spd: s.spd };
}
for (const c of CHARACTERS) deriveStats(c);

/* tag every move with its damage class */
for (const c of CHARACTERS) for (const m of c.moves) m.cat = moveCategory(m);

/* ============================================================
   AWAKENINGS — One Piece's answer to Mega Evolution.
   Once per battle a side may awaken ONE of these fighters: it gains
   stat boosts, may change typing, swaps to a stronger awakened ability,
   and unlocks a brand-new moveset. The transformation lasts the battle.
   `stats` values are flat boosts added to the fighter's battle stats. */
const AWAKENINGS = {
  luffy: {
    name: 'Gear 5 · Sun God Nika', types: ['RUBBER', 'HAKI'],
    stats: { atk: 32, spd: 30, def: 14, sdef: 10 },
    ability: { name: 'Liberation', kind: 'dodge', chance: 25, desc: 'Cartoon freedom — 25% chance to dodge any attack.' },
    moves: [
      { name: 'Gum-Gum Dawn Whip', type: 'RUBBER', pow: 100, acc: 100, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: 'Gum-Gum Giant', type: 'RUBBER', pow: 120, acc: 95, fx: { stun: 20 } },
      { name: 'Bajrang Gun', type: 'HAKI', pow: 145, acc: 90, fx: { recoil: 15 } },
      { name: 'Gum-Gum Lightning', type: 'HAKI', pow: 95, acc: 100, fx: { stun: 30 } },
    ],
  },
  zoro: {
    name: 'King of Hell · Asura', types: ['SLASH', 'SOUL'],
    stats: { atk: 32, spd: 16, satk: 10, sdef: 8 },
    ability: { name: 'Demon Asura', kind: 'superCrit', bonus: 25, mult: 2.5, desc: 'Nine-sword demon — +25% crit chance, crits deal 2.5×.' },
    moves: [
      { name: 'Asura: Makyusen', type: 'SLASH', pow: 130, acc: 90, fx: { critBoost: 25 } },
      { name: 'King of Hell: Three Worlds', type: 'HAKI', pow: 120, acc: 90, fx: { stun: 20 } },
      { name: 'Black Rope: Dragon Twister', type: 'SLASH', pow: 110, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: 'Death Lion Song', type: 'SOUL', pow: 95, acc: 100, fx: { critBoost: 25 } },
    ],
  },
  sanji: {
    name: 'Ifrit Jambe · Exoskeleton', types: ['STRIKE', 'FLAME'],
    stats: { atk: 26, spd: 26, def: 12, satk: 12 },
    ability: { name: 'Exoskeleton', kind: 'typeBoost', type: 'FLAME', mult: 1.5, burnImmune: true, desc: 'Blue-flame Ifrit — Flame moves +50%, immune to burn.' },
    moves: [
      { name: 'Ifrit Jambe: Premier Hachis', type: 'FLAME', pow: 115, acc: 100, fx: { burn: 30 } },
      { name: 'Diable: Concasse', type: 'STRIKE', pow: 115, acc: 95, fx: { stun: 20 } },
      { name: 'Hell Memories', type: 'FLAME', pow: 130, acc: 90, fx: { burn: 30 } },
      { name: 'Sky Walk', type: 'STRIKE', pow: 0, acc: 100, fx: { self: { spd: 2 } } },
    ],
  },
  law: {
    name: 'Awakening · Puncture Wille', types: ['SLASH', 'SOUL'],
    stats: { satk: 32, spd: 22, def: 12, sdef: 10 },
    ability: { name: 'K-Room', kind: 'ignoreBuffs', desc: 'Awakened ROOM — attacks ignore the foe\'s defensive boosts.' },
    moves: [
      { name: 'Puncture Wille', type: 'SOUL', pow: 130, acc: 90, fx: { ignoreDef: true } },
      { name: 'Countershock', type: 'LIGHTNING', pow: 100, acc: 100, fx: { para: 30 } },
      { name: 'Gamma Knife', type: 'SOUL', pow: 115, acc: 90, fx: { ignoreDef: true } },
      { name: 'Silent Shock', type: 'SLASH', pow: 95, acc: 100, fx: { stun: 20 } },
    ],
  },
  doflamingo: {
    name: 'Awakening · String City', types: ['SLASH', 'SOUL'],
    stats: { atk: 26, spd: 22, def: 16, sdef: 10 },
    ability: { name: 'String City', kind: 'bonusStun', chance: 30, desc: 'Awakened strings — 30% chance to puppet-stun on every hit.' },
    moves: [
      { name: 'God Thread: Awakened', type: 'SLASH', pow: 120, acc: 90, fx: { critBoost: 25 } },
      { name: 'White Snake', type: 'SLASH', pow: 105, acc: 95, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: 'Spider Web', type: 'SOUL', pow: 95, acc: 100, fx: { stun: 20 } },
      { name: 'Off-White Bulwark', type: 'SLASH', pow: 0, acc: 100, fx: { self: { def: 2 } } },
    ],
  },
  kaido: {
    name: 'Hybrid · Azure Dragon', types: ['BEAST', 'TREMOR'],
    stats: { atk: 30, def: 16, sdef: 12, satk: 10 },
    ability: { name: 'Sky Dragon Hide', kind: 'scales', mult: 0.6, desc: 'Indestructible dragon — takes 40% less damage above half HP.' },
    moves: [
      { name: 'Dragon Twister: Tempest', type: 'BEAST', pow: 115, acc: 95, fx: { enemy: { spd: -1 }, enemyChance: 30 } },
      { name: 'Boro Breath', type: 'FLAME', pow: 110, acc: 90, fx: { burn: 30 } },
      { name: 'Raimei Hakke', type: 'STRIKE', pow: 105, acc: 95, fx: { stun: 30 } },
      { name: 'Conqueror Kaifu', type: 'HAKI', pow: 125, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 30 } },
    ],
  },
  crocodile: {
    name: 'Awakening · Desert Empire', types: ['SAND', 'TREMOR'],
    stats: { satk: 30, def: 16, spd: 14, sdef: 10 },
    ability: { name: 'Desert Empire', kind: 'lifesteal', frac: 0.4, desc: 'Awakened drought — heals 40% of all damage dealt.' },
    moves: [
      { name: 'Ground Death', type: 'SAND', pow: 115, acc: 95, fx: { enemy: { spd: -1 }, enemyChance: 30 } },
      { name: 'Desert Spada: Pesado', type: 'TREMOR', pow: 130, acc: 90, fx: { stun: 20 } },
      { name: 'Sables: Requiem', type: 'SAND', pow: 100, acc: 95, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: 'Barjan', type: 'SAND', pow: 95, acc: 100, fx: { poison: 30 } },
    ],
  },
  shanks: {
    name: 'Supreme King · Conqueror Advent', types: ['SLASH', 'HAKI'],
    stats: { atk: 30, spd: 22, def: 14, sdef: 8 },
    ability: { name: 'Supreme Conqueror', kind: 'superCrit', bonus: 20, mult: 2.5, desc: 'Haki-charged blade — +20% crit chance, crits deal 2.5×.' },
    moves: [
      { name: 'Divine Departure', type: 'HAKI', pow: 130, acc: 90, fx: { stun: 20 } },
      { name: 'Gryphon Supreme Slash', type: 'SLASH', pow: 120, acc: 90, fx: { critBoost: 25 } },
      { name: 'Conqueror Advent', type: 'HAKI', pow: 100, acc: 95, fx: { enemy: { atk: -1, def: -1 }, enemyChance: 50 } },
      { name: 'Red Force', type: 'SLASH', pow: 110, acc: 95, fx: { critBoost: 25 } },
    ],
  },
  roger: {
    name: 'Pirate King · Final Will', types: ['SLASH', 'HAKI'],
    stats: { atk: 30, spd: 22, def: 14, sdef: 10 },
    // keeps his signature Pirate King's Haki (pierce) — no ability override
    moves: [
      { name: 'Divine Two-Sword Slash', type: 'SLASH', pow: 125, acc: 90, fx: { critBoost: 25 } },
      { name: 'Kamusari: Supreme', type: 'HAKI', pow: 135, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 40 } },
      { name: 'Clash of Kings', type: 'HAKI', pow: 105, acc: 95, fx: { stun: 30 } },
      { name: 'Inherited Will', type: 'SLASH', pow: 110, acc: 95, fx: { critBoost: 25 } },
    ],
  },
  rocks: {
    name: 'God Valley Demon · Domi Reversi', types: ['DARKNESS', 'HAKI'],
    stats: { satk: 30, atk: 14, spd: 18, def: 12 },
    ability: { name: 'Demon Sovereign', kind: 'lifesteal', frac: 0.3, desc: 'Devours the fallen — heals 30% of all damage dealt.' },
    moves: [
      { name: 'God Valley Cataclysm', type: 'HAKI', pow: 135, acc: 85, fx: { recoil: 12 } },
      { name: "Demon's Rampage", type: 'DARKNESS', pow: 120, acc: 90, fx: { enemy: { def: -1 }, enemyChance: 30 } },
      { name: "Davy's Grudge", type: 'DARKNESS', pow: 105, acc: 95, fx: { drain: 40 } },
      { name: 'Tyrant Ambition', type: 'HAKI', pow: 100, acc: 100, fx: { stun: 20 } },
    ],
  },
  imu: {
    name: 'Ruler of the Void · True Form', types: ['DARKNESS', 'LIGHT'],
    stats: { satk: 30, sdef: 16, def: 12, spd: 14 },
    ability: { name: 'Eternal Throne', kind: 'immortal', frac: 0.15, desc: 'Immortal sovereign — regenerates 15% HP each turn; immune to burn & poison.' },
    moves: [
      { name: 'Mother Flame: Apocalypse', type: 'LIGHT', pow: 130, acc: 90, fx: { burn: 20 } },
      { name: 'Spider of the Void', type: 'DARKNESS', pow: 110, acc: 95, fx: { stun: 20 } },
      { name: 'Holy Decree', type: 'SOUL', pow: 100, acc: 95, fx: { enemy: { atk: -1 }, enemyChance: 50 } },
      { name: 'Void Devourer', type: 'DARKNESS', pow: 105, acc: 95, fx: { drain: 30 } },
    ],
  },
};
const CHAR_BY_ID = {};
for (const c of CHARACTERS) CHAR_BY_ID[c.id] = c;
for (const id in AWAKENINGS) {
  const aw = AWAKENINGS[id];
  if (aw.moves) for (const m of aw.moves) m.cat = moveCategory(m);
  if (CHAR_BY_ID[id]) CHAR_BY_ID[id].awaken = aw;
}

/* Preset pirate crews (teams of 4) */
const PRESET_CREWS = [
  { id: 'strawhats',  name: 'Straw Hat Pirates',   flag: '👒', desc: 'The future Pirate King and his monsters.', members: ['luffy', 'zoro', 'sanji', 'jinbe'] },
  { id: 'sunnycrew',  name: 'Sunny Crew',          flag: '🌻', desc: 'The heart and brains of the Thousand Sunny.', members: ['nami', 'usopp', 'chopper', 'robin'] },
  { id: 'marines',    name: 'Marine Headquarters', flag: '⚓', desc: 'Absolute Justice, served at admiral rank.', members: ['garp', 'akainu', 'aokiji', 'kizaru'] },
  { id: 'warlords',   name: 'Seven Warlords',      flag: '🗡️', desc: 'Government dogs with teeth of their own.', members: ['mihawk', 'crocodile', 'doflamingo', 'hancock'] },
  { id: 'emperors',   name: 'Four Emperors',       flag: '👑', desc: 'The rulers of the New World.', members: ['shanks', 'kaido', 'bigmom', 'blackbeard'] },
  { id: 'whitebeard', name: 'Whitebeard Pirates',  flag: '🌙', desc: 'Family of the strongest man in the world.', members: ['whitebeard', 'ace', 'marco', 'jinbe'] },
  { id: 'outlaws',    name: 'Grand Line Outlaws',  flag: '💀', desc: 'A god, a warden, a surgeon, and a clown.', members: ['enel', 'magellan', 'law', 'buggy'] },
  { id: 'soulsteel',  name: 'Soul & Steel',        flag: '🎻', desc: 'Music, machines, and stolen lifespans.', members: ['brook', 'franky', 'bigmom', 'marco'] },
  { id: 'voidthrone', name: 'Throne of the Void',  flag: '👁️', desc: 'The immortal ruler and the demons of God Valley.', members: ['imu', 'rocks', 'roger', 'loki'] },
];

/* Famous rivalries surfaced on the tournament screen, with lore labels. */
const RIVALRIES = [
  { a: 'roger', b: 'whitebeard', label: 'Summit of the Old Era' },
  { a: 'garp', b: 'roger', label: 'The Hero vs the Pirate King' },
  { a: 'zoro', b: 'mihawk', label: 'The Student and the Master' },
  { a: 'luffy', b: 'kaido', label: 'Onigashima Rematch' },
  { a: 'ace', b: 'akainu', label: 'The Marineford Grudge' },
  { a: 'imu', b: 'rocks', label: 'God Valley, Again' },
  { a: 'luffy', b: 'blackbeard', label: 'Inherited Will of D.' },
  { a: 'aokiji', b: 'akainu', label: 'Duel on Punk Hazard' },
];

const CREW_SIZE = 4;
const LEVEL = 50;

/* Real stats at a given battle level. Every stat scales proportionally, so
   level 50 reproduces the original values exactly and lower-level fighters
   are weaker across the board (used by Story Mode's progression). */
function realStats(base, level) {
  const L = level || LEVEL;
  const k = L / LEVEL;                    // combat stats scale linearly with level
  const kh = 0.35 + 0.65 * k;             // HP falls off more gently, so rookie
  const s = v => Math.max(1, Math.floor(v * k));   // duels still last a few turns
  return {
    hp: Math.max(12, Math.floor((base.hp + 60 + 50) * kh)),   // chunky HP pools
    atk: s(base.atk + 5),
    def: s(base.def + 5),
    satk: s(base.satk + 5),
    sdef: s(base.sdef + 5),
    spd: s(base.spd + 5),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { TYPES, TYPE_CHART, TYPE_CATEGORY, moveCategory, typeEffectiveness, CHARACTERS, CHAR_BY_ID, PRESET_CREWS, RIVALRIES, CREW_SIZE, LEVEL, realStats };
}
