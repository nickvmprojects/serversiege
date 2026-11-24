// Server Siege — static game data (no DOM here, so it can be tested in node)
export const VERSION = 'v0.1';

export const CHANGELOG = [
  { v: 'v0.1', notes: [
    'First playable build.',
    'Random map of 15 castles, 5 factions (you + 4 bots with personalities).',
    'Night / Morning / Evening day cycle. Armies march along roads (1-3 days).',
    'Battles: 3 lanes x 2 rows, counter triangle, siege vs towers & core.',
    'Outcomes: Repelled / Breached (wards down 2 days) / Routed (castle taken).',
    'Wizards are needed to attack. Lose the King and the game is over.',
    'Dominion: hold 8+ castles for 5 days to win. Or be the last one standing.',
    'Autosave every night.',
  ]},
];

// Battle timing: 1 tick = 0.5 s of battle time
export const TICK_LIMIT = 240;
export const DMG_SCALE = 0.5;   // global pace knob: lower = longer battles

// cls: melee > ranged > anti > melee ; siege > fortified
export const UNITS = {
  sword:    { name: 'Levy Swordsman', short: 'Swords',   cls: 'melee',  n: 10, hp: 32, dmg: 5,  cd: 4,  food: 1, gold: 30, mana: 0,  desc: 'Basic melee. Charges down archers.' },
  bow:      { name: 'Bowman',         short: 'Bows',     cls: 'ranged', n: 10, hp: 20, dmg: 4,  cd: 4,  food: 1, gold: 35, mana: 0,  desc: 'Basic ranged. Shoots over the front line. Shreds pikes.' },
  pike:     { name: 'Pikeman',        short: 'Pikes',    cls: 'anti',   n: 10, hp: 30, dmg: 4,  cd: 4,  food: 1, gold: 30, mana: 0,  desc: 'Anti-melee. Holds the line vs swords and knights.' },
  knight:   { name: 'Iron Knight',    short: 'Knights',  cls: 'melee',  n: 8,  hp: 70, dmg: 7,  cd: 4,  food: 2, gold: 70, mana: 0,  heavy: true, desc: 'Riot-armoured tank. Takes pikes better than swordsmen.' },
  halberd:  { name: 'Arc Halberdier', short: 'Arcs',     cls: 'anti',   n: 8,  hp: 40, dmg: 5,  cd: 5,  food: 2, gold: 60, mana: 10, stun: 0.3, desc: 'Spark-batons. Hits can stun melee squads.' },
  ballista: { name: 'Ballista',       short: 'Ballista', cls: 'siege',  n: 3,  hp: 25, dmg: 30, cd: 10, food: 2, gold: 90, mana: 0,  desc: 'Cracks towers and cores, splash on troops. Cannot fire from the front row.' },
  sentinel: { name: 'Old Sentinel',   short: 'Sentinel', cls: 'melee',  n: 6,  hp: 45, dmg: 5,  cd: 4,  food: 0, gold: 0,  mana: 0,  neutral: true, desc: 'Ancient guardian construct.' },
};

export const CLS_LABEL = { melee: 'Melee', ranged: 'Ranged', anti: 'Anti-melee', siege: 'Siege' };

// Damage multiplier attacker class -> target class
export function counterMult(att, tgtCls, tgtHeavy) {
  if (tgtCls === 'fort') return att === 'siege' ? 2.0 : 0.5;
  if (att === 'siege') return 0.6;            // splash makes up for it
  if (tgtCls === 'siege') return att === 'melee' ? 1.5 : 1.0;
  const beats = { melee: 'ranged', ranged: 'anti', anti: 'melee' };
  if (beats[att] === tgtCls) return (att === 'anti' && tgtHeavy) ? 1.2 : 1.5;
  if (beats[tgtCls] === att) return 0.75;
  return 1;
}

export const CASTLE_TYPES = {
  granary: { name: 'Granary', food: 16, gold: 5,  mana: 0,  recruit: ['sword', 'bow', 'pike'],      desc: 'Feeds armies. Recruits levies.' },
  forge:   { name: 'Forge',   food: 5,  gold: 16, mana: 0,  recruit: ['sword', 'knight', 'ballista'], desc: 'Gold and heavy arms.' },
  shrine:  { name: 'Shrine',  food: 6,  gold: 5,  mana: 12, recruit: ['pike', 'halberd'],            desc: 'A living data center. Mana and wizards.' },
};

export const WIZARD_COST = { gold: 50, mana: 30, days: 2 };
export const REPAIR_COST = { mana: 20 };          // restores 35% of guardians & core
export const UPGRADE_COST = [null, { gold: 40, mana: 40 }, { gold: 70, mana: 70 }]; // lvl1->2, lvl2->3
export const MAX_TOWER_LVL = 3;
export const MAX_WIZARDS = 4;
export const MAJORITY = 8;
export const DOMINION_DAYS = 5;

export function cmdLimit(castleCount) { return 5 + 2 * castleCount; }

export const FACTIONS = [
  { id: 'ember',   name: 'Ember Clan',         color: '#ff6b35', start: 'forge',
    perk: '+20% siege damage', con: '+15% food upkeep',
    mods: { siegeDmg: 1.2, upkeep: 1.15 }, ai: { agg: 0.85, def: 0.3, exp: 0.5, opp: 0.4 }, style: 'Aggressive' },
  { id: 'cloud',   name: 'Order of the Cloud', color: '#5ec8ff', start: 'shrine',
    perk: '+25% mana', con: 'Granary troops cost +15%',
    mods: { mana: 1.25, levyCost: 1.15 }, ai: { agg: 0.35, def: 0.85, exp: 0.45, opp: 0.3 }, style: 'Defensive' },
  { id: 'rust',    name: 'Rust Barons',        color: '#e0b030', start: 'forge',
    perk: '+20% gold', con: 'Towers -20% HP',
    mods: { gold: 1.2, towerHp: 0.8 }, ai: { agg: 0.55, def: 0.4, exp: 0.4, opp: 0.95 }, style: 'Opportunist' },
  { id: 'green',   name: 'Greenline Commune',  color: '#7bd35a', start: 'granary',
    perk: '+30% food', con: 'Knights cost +20%',
    mods: { food: 1.3, knightCost: 1.2 }, ai: { agg: 0.45, def: 0.4, exp: 0.95, opp: 0.3 }, style: 'Expansionist' },
  { id: 'archive', name: 'Cold Archive',       color: '#b48cff', start: 'shrine',
    perk: 'Towers +25% HP & damage', con: '3-day roads take 4 days',
    mods: { tower: 1.25, slowMarch: true }, ai: { agg: 0.3, def: 0.9, exp: 0.35, opp: 0.5 }, style: 'Turtle' },
];
export const NEUTRAL_COLOR = '#7d8594';

export const CASTLE_NAMES = [
  'Ironvault', 'Old Azure', 'Port Kubernetes', 'Hollow Rack', 'Saint Uptime', 'Cachemoor',
  'Fort Latency', 'Bitwater', 'Coldstore', 'Ashgate', 'Lambda Keep', 'Mirrorfell', 'Packet Hollow',
  'Root Spire', 'Lagmere', "Kernel's Rest", 'Byteford', 'Nimbus Hold', 'Proxywick', 'Swapfield',
  'Gigaburg', 'Shardholm', 'Firewall Gate', 'Cronwick', 'Dockerdeep', 'Pingmoor',
];

export function unitCost(type, mods) {
  const u = UNITS[type];
  let g = u.gold;
  if (mods.levyCost && ['sword', 'bow', 'pike'].includes(type)) g *= mods.levyCost;
  if (mods.knightCost && type === 'knight') g *= mods.knightCost;
  return { gold: Math.round(g), mana: u.mana };
}

export function towerStats(lvl, mods = {}) {
  const t = mods.tower || 1;
  return {
    max: Math.round(300 * (1 + 0.4 * (lvl - 1)) * t * (mods.towerHp || 1)),
    dmg: 12 * (1 + 0.3 * (lvl - 1)) * t,
    cd: 4,
  };
}
export function coreMax(lvl) { return 600 + 150 * (lvl - 1); }

// Seeded RNG (mulberry32); state is a plain number stored in the save
export function makeRng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.state = () => s;
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return f;
}
