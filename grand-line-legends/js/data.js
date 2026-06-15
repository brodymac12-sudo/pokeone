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
      { name: 'Yata Mirror', type: 'LIGHT', pow: 0, acc: 100, fx: { self: { atk: 1, spd: 1 } } },
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

const CHAR_BY_ID = {};
for (const c of CHARACTERS) CHAR_BY_ID[c.id] = c;

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

/* Real stats at battle level */
function realStats(base) {
  return {
    hp: base.hp + 60 + 50,          // chunky HP pools
    atk: base.atk + 5,
    def: base.def + 5,
    spd: base.spd + 5,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { TYPES, TYPE_CHART, typeEffectiveness, CHARACTERS, CHAR_BY_ID, PRESET_CREWS, RIVALRIES, CREW_SIZE, LEVEL, realStats };
}
