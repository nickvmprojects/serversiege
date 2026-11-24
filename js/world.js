// Server Siege — world state, helpers and player/bot actions (pure logic)
import {
  UNITS, CASTLE_TYPES, FACTIONS, WIZARD_COST, REPAIR_COST, UPGRADE_COST, MAX_TOWER_LVL,
  MAX_WIZARDS, cmdLimit, unitCost, towerStats, coreMax, makeRng, VERSION,
} from './data.js';
import { generateMap } from './mapgen.js';

export const SAVE_KEY = 'serversiege.save.v1';

export const facDef = (fid) => FACTIONS.find(f => f.id === fid);
export const modsOf = (fid) => (fid ? facDef(fid).mods : {});
export const castleById = (st, id) => st.castles[id];
export const owned = (st, fid) => st.castles.filter(c => c.owner === fid);
export const maxSquadHp = (type) => UNITS[type].n * UNITS[type].hp;
export const soldiersOf = (sq) => Math.ceil(sq.hp / UNITS[sq.type].hp);

export function neighbors(st, cid) {
  const out = [];
  for (const r of st.roads) {
    if (r.a === cid) out.push({ id: r.b, days: r.days });
    else if (r.b === cid) out.push({ id: r.a, days: r.days });
  }
  return out;
}
export function roadDays(st, a, b, fid) {
  const r = st.roads.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  if (!r) return null;
  return (modsOf(fid).slowMarch && r.days >= 3) ? r.days + 1 : r.days;
}
export function isFrontier(st, c) {
  return neighbors(st, c.id).some(n => st.castles[n.id].owner !== c.owner);
}

export function allSquads(st, fid) {
  const list = [];
  for (const c of owned(st, fid)) list.push(...c.squads);
  for (const a of st.armies) if (a.owner === fid) list.push(...a.squads);
  return list;
}
export const squadCount = (st, fid) => allSquads(st, fid).length;
export const cmdLimitOf = (st, fid) => cmdLimit(owned(st, fid).length);

export function towerMaxOf(c) { return towerStats(c.lvl, modsOf(c.owner)).max; }
export function castleDefense(st, c) {
  const ts = towerStats(c.lvl, modsOf(c.owner));
  return {
    fid: c.owner, mods: modsOf(c.owner),
    squads: c.squads,
    towers: c.towers.map(hp => ({ hp, max: ts.max, dmg: ts.dmg })),
    core: { hp: c.core, max: coreMax(c.lvl) },
    wardsDown: c.wardsDown > 0,
  };
}

export function news(st, text, fid = null, kind = 'info') {
  st.news.unshift({ day: st.day, text, fid, kind });
  if (st.news.length > 150) st.news.length = 150;
}

// ---------- formations ----------
const FRONT = (t) => ['melee', 'anti'].includes(UNITS[t].cls);
export function autoFormation(squads) {
  squads.forEach(s => { s.lane = null; s.row = null; });
  const fronts = squads.filter(s => FRONT(s.type)).sort((a, b) => (UNITS[b.type].heavy ? 1 : 0) - (UNITS[a.type].heavy ? 1 : 0) || b.hp - a.hp);
  const backs = squads.filter(s => !FRONT(s.type)).sort((a, b) => b.hp - a.hp);
  const lanes = [1, 0, 2];
  const free = (row) => lanes.find(l => !squads.some(s => s.row === row && s.lane === l));
  const place = (s, row) => { const l = free(row); if (l === undefined) return false; s.lane = l; s.row = row; return true; };
  for (const s of fronts) if (!place(s, 0)) place(s, 1);
  for (const s of backs) if (!place(s, 1)) { if (UNITS[s.type].cls !== 'siege') place(s, 0); }
  return squads;
}
// reserve squads step into empty slots
export function fillSlots(squads) {
  for (const s of squads.filter(s => s.row == null)) {
    const pref = FRONT(s.type) ? [0, 1] : [1, 0];
    let done = false;
    for (const row of pref) {
      if (UNITS[s.type].cls === 'siege' && row === 0) continue;
      for (const l of [1, 0, 2]) {
        if (!squads.some(o => o.row === row && o.lane === l)) { s.row = row; s.lane = l; done = true; break; }
      }
      if (done) break;
    }
  }
}
// move squad to slot (lane,row); swap if occupied; row null = reserve
export function moveSquad(squads, sqId, lane, row) {
  const s = squads.find(x => x.id === sqId);
  if (!s) return;
  if (row == null) { s.row = null; s.lane = null; return; }
  const o = squads.find(x => x.lane === lane && x.row === row && x.id !== sqId);
  if (o) { o.lane = s.lane; o.row = s.row; }
  s.lane = lane; s.row = row;
}

// ---------- new game ----------
export function newGame(playerFid, seed = (Date.now() % 1e9)) {
  const rng = makeRng(seed);
  const map = generateMap(rng, 15, FACTIONS.length);
  const fids = [playerFid, ...rng.shuffle(FACTIONS.map(f => f.id).filter(id => id !== playerFid))];
  const st = {
    version: VERSION, day: 1, seed, rngState: 0, playerFid, nextId: 1,
    factions: {}, castles: [], roads: map.roads, armies: [], news: [], result: null,
    lastReports: [],
  };
  // castle types: starts use the faction's preferred type, rest balanced 5/5/5
  const typeCount = { granary: 0, forge: 0, shrine: 0 };
  const startOf = {};
  map.starts.forEach((node, i) => { startOf[node] = fids[i]; typeCount[facDef(fids[i]).start]++; });
  const pool = [];
  for (const t of Object.keys(typeCount)) for (let i = typeCount[t]; i < 5; i++) pool.push(t);
  rng.shuffle(pool);
  map.nodes.forEach((n, i) => {
    const fid = startOf[i] || null;
    const lvl = fid ? 2 : map.tiers[i];   // capitals start with level-2 guardians
    const c = {
      id: i, name: n.name, x: Math.round(n.x), y: Math.round(n.y),
      type: fid ? facDef(fid).start : pool.pop(),
      owner: fid, lvl, tier: map.tiers[i], wardsDown: 0, squads: [],
      towers: [], core: coreMax(lvl),
    };
    const tmax = towerStats(lvl, modsOf(fid)).max;
    c.towers = [tmax, tmax, tmax];
    if (fid) {
      c.squads = [mkSquad(st, 'sword'), mkSquad(st, 'pike'), mkSquad(st, 'bow')];
    } else {
      const n = [0, 1, 3, 4][c.tier];
      for (let k = 0; k < n; k++) c.squads.push(mkSquad(st, 'sentinel'));
    }
    autoFormation(c.squads);
    st.castles.push(c);
  });
  for (const fid of fids) {
    st.factions[fid] = {
      id: fid, isPlayer: fid === playerFid, alive: true,
      food: 40, gold: 120, mana: 30, wizards: 1, wizTraining: [],
      kingAlive: true, kingHome: true, dominion: 0, lastIncome: null,
    };
  }
  st.rngState = rng.state();
  news(st, 'The old machines stir. Five factions march for the data centers.', null, 'big');
  return st;
}

export function mkSquad(st, type) {
  return { id: st.nextId++, type, hp: maxSquadHp(type), lane: null, row: null };
}

// ---------- actions (return {ok, msg}) ----------
const fail = (msg) => ({ ok: false, msg });
const OK = (msg = '') => ({ ok: true, msg });

export function canRecruit(st, fid, cid, type) {
  const c = st.castles[cid], f = st.factions[fid];
  if (!c || c.owner !== fid) return fail('Not your castle');
  if (!CASTLE_TYPES[c.type].recruit.includes(type)) return fail('Not recruitable here');
  if (squadCount(st, fid) >= cmdLimitOf(st, fid)) return fail('Command limit reached');
  const cost = unitCost(type, modsOf(fid));
  if (f.gold < cost.gold) return fail('Not enough gold');
  if (f.mana < cost.mana) return fail('Not enough mana');
  return OK();
}
export function recruit(st, fid, cid, type) {
  const chk = canRecruit(st, fid, cid, type);
  if (!chk.ok) return chk;
  const c = st.castles[cid], f = st.factions[fid];
  const cost = unitCost(type, modsOf(fid));
  f.gold -= cost.gold; f.mana -= cost.mana;
  const s = mkSquad(st, type);
  c.squads.push(s); fillSlots(c.squads);
  return OK(`${UNITS[type].name} recruited`);
}

export function repairCost(c) { return REPAIR_COST.mana; }
export function needsRepair(c) {
  const tm = towerMaxOf(c);
  return c.towers.some(h => h < tm) || c.core < coreMax(c.lvl);
}
export function repair(st, fid, cid) {
  const c = st.castles[cid], f = st.factions[fid];
  if (c.owner !== fid) return fail('Not your castle');
  if (c.wardsDown > 0) return fail('Wards are down — cannot repair yet');
  if (!needsRepair(c)) return fail('Already at full strength');
  if (f.mana < REPAIR_COST.mana) return fail('Not enough mana');
  f.mana -= REPAIR_COST.mana;
  const tm = towerMaxOf(c), cm = coreMax(c.lvl);
  c.towers = c.towers.map(h => Math.min(tm, h + tm * 0.35));
  c.core = Math.min(cm, c.core + cm * 0.35);
  return OK('Guardians patched');
}
export function upgrade(st, fid, cid) {
  const c = st.castles[cid], f = st.factions[fid];
  if (c.owner !== fid) return fail('Not your castle');
  if (c.lvl >= MAX_TOWER_LVL) return fail('Max level');
  if (c.wardsDown > 0) return fail('Wards are down');
  const cost = UPGRADE_COST[c.lvl];
  if (f.gold < cost.gold || f.mana < cost.mana) return fail('Not enough resources');
  f.gold -= cost.gold; f.mana -= cost.mana;
  c.lvl++;
  const tm = towerMaxOf(c);
  c.towers = [tm, tm, tm];
  c.core = coreMax(c.lvl);
  return OK(`Guardians upgraded to level ${c.lvl}`);
}
export function trainWizard(st, fid, cid) {
  const c = st.castles[cid], f = st.factions[fid];
  if (c.owner !== fid || c.type !== 'shrine') return fail('Wizards train at your Shrines');
  if (f.wizards + f.wizTraining.length >= MAX_WIZARDS) return fail(`Max ${MAX_WIZARDS} wizards`);
  if (f.gold < WIZARD_COST.gold || f.mana < WIZARD_COST.mana) return fail('Not enough resources');
  f.gold -= WIZARD_COST.gold; f.mana -= WIZARD_COST.mana;
  f.wizTraining.push(WIZARD_COST.days);
  return OK(`Wizard in training (${WIZARD_COST.days} days)`);
}

export function sendArmy(st, fid, cid, squadIds, wiz, targetId) {
  const c = st.castles[cid], f = st.factions[fid], tgt = st.castles[targetId];
  if (c.owner !== fid) return fail('Not your castle');
  const days = roadDays(st, cid, targetId, fid);
  if (days == null) return fail('No road there');
  const squads = c.squads.filter(s => squadIds.includes(s.id));
  if (!squads.length) return fail('Pick at least one squad');
  if (tgt.owner !== fid && !wiz) return fail('An attack needs a wizard');
  if (wiz === 'wiz' && f.wizards < 1) return fail('No wizard available');
  if (wiz === 'king' && !(f.kingAlive && f.kingHome)) return fail('The King is not available');
  if (wiz === 'wiz') f.wizards--;
  if (wiz === 'king') f.kingHome = false;
  c.squads = c.squads.filter(s => !squadIds.includes(s.id));
  fillSlots(c.squads);
  autoFormation(squads);
  const army = { id: st.nextId++, owner: fid, squads, wiz: wiz || null, from: cid, to: targetId,
    daysLeft: days, total: days, state: 'march', fresh: true };
  st.armies.push(army);
  return OK(`Army sets out for ${tgt.name} (${days} day${days > 1 ? 's' : ''})`);
}
function returnWizard(st, army) {
  const f = st.factions[army.owner];
  if (army.wiz === 'wiz') f.wizards++;
  if (army.wiz === 'king') f.kingHome = true;
  army.wiz = null;
}
export function cancelArmy(st, fid, armyId) {
  const a = st.armies.find(x => x.id === armyId);
  if (!a || a.owner !== fid || !a.fresh) return fail('Cannot cancel');
  const c = st.castles[a.from];
  a.squads.forEach(s => { s.row = null; s.lane = null; });
  c.squads.push(...a.squads); fillSlots(c.squads);
  returnWizard(st, a);
  st.armies = st.armies.filter(x => x !== a);
  return OK('Orders cancelled');
}
export function recallArmy(st, fid, armyId) {
  const a = st.armies.find(x => x.id === armyId);
  if (!a || a.owner !== fid || a.state !== 'siege') return fail('Cannot recall');
  startReturn(st, a);
  return OK('Army falls back');
}
export function startReturn(st, a) {
  const here = a.to;
  a.to = a.from; a.from = here;
  a.daysLeft = a.total = roadDays(st, a.from, a.to, a.owner) || 1;
  a.state = 'return'; a.fresh = false;
}
export function mergeArmy(st, a, c) {
  a.squads.forEach(s => { s.row = null; s.lane = null; });
  c.squads.push(...a.squads); fillSlots(c.squads);
  returnWizard(st, a);
  st.armies = st.armies.filter(x => x !== a);
}

// nearest castle owned by fid, by road hops (excluding `fromId` itself)
export function nearestOwned(st, fromId, fid) {
  const seen = new Set([fromId]);
  let frontier = [fromId];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) for (const n of neighbors(st, id)) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (st.castles[n.id].owner === fid) return st.castles[n.id];
      next.push(n.id);
    }
    frontier = next;
  }
  return null;
}

export function armyPos(st, a) {
  const A = st.castles[a.from], B = st.castles[a.to];
  if (a.state === 'siege') {
    const dx = A.x - B.x, dy = A.y - B.y, d = Math.hypot(dx, dy) || 1;
    return { x: B.x + dx / d * 78, y: B.y + dy / d * 78 };
  }
  const t = a.fresh ? 0.18 : Math.min(0.85, Math.max(0.15, 1 - a.daysLeft / a.total + 0.5 / a.total));
  return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
}

export function saveGame(st) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) { /* storage unavailable */ } }
export function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
