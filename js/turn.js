// Server Siege — day processing: bots plan, morning march, evening battles, night upkeep
import { UNITS, CASTLE_TYPES, MAJORITY, DOMINION_DAYS, coreMax, makeRng } from './data.js';
import { simulateBattle } from './battle.js';
import { runAI } from './ai.js';
import {
  facDef, modsOf, owned, castleDefense, news, fillSlots, mergeArmy, startReturn,
  nearestOwned, towerMaxOf, maxSquadHp,
} from './world.js';

const fname = (fid) => fid ? facDef(fid).name : 'the Old Guardians';

// Runs everything after the player taps "End night". Returns battle reports for the UI.
export function endNight(st) {
  const rng = makeRng(st.rngState || st.seed);
  const reports = [];

  // bots plan during the same night as the player
  for (const f of Object.values(st.factions)) if (!f.isPlayer && f.alive) runAI(st, f.id, rng);

  // ---- MORNING: everyone marches ----
  for (const a of [...st.armies]) {
    if (a.state === 'siege') continue;
    a.fresh = false;
    a.daysLeft--;
    if (a.daysLeft > 0) continue;
    const c = st.castles[a.to];
    if (c.owner === a.owner) { mergeArmy(st, a, c); continue; }
    if (a.wiz) {
      a.state = 'siege';
      if (a.owner === st.playerFid || c.owner === st.playerFid) news(st, `${fname(a.owner)} army arrives at ${c.name}.`, a.owner);
      continue;
    }
    // reinforcements arriving at a castle that is no longer ours
    if (a.state === 'march') { startReturn(st, a); a.state = 'return'; }
    else { st.armies = st.armies.filter(x => x !== a); news(st, `${fname(a.owner)} troops scatter with nowhere to go.`, a.owner); }
  }

  // ---- EVENING: battles ----
  const sieges = st.armies.filter(a => a.state === 'siege').sort((a, b) => a.id - b.id);
  for (const a of sieges) {
    if (!st.armies.includes(a)) continue;
    const c = st.castles[a.to];
    if (c.owner === a.owner) { mergeArmy(st, a, c); continue; }
    const player = st.playerFid;
    const involves = a.owner === player || c.owner === player;
    const def = castleDefense(st, c);
    const before = {
      att: JSON.parse(JSON.stringify(a.squads)), def: JSON.parse(JSON.stringify(c.squads)),
    };
    const r = simulateBattle({ seed: rng.int(1, 1e9), att: { fid: a.owner, mods: modsOf(a.owner), wiz: a.wiz, squads: a.squads }, def }, involves);
    const rep = {
      castleId: c.id, castleName: c.name, castleType: c.type, attFid: a.owner, defFid: c.owner,
      outcome: r.outcome, reason: r.reason, attLost: r.attLost, defLost: r.defLost, wiz: a.wiz,
      involves, battle: involves ? r : null, before,
    };
    applyBattle(st, a, c, r, rep);
    reports.push(rep);
  }

  // ---- NIGHT: upkeep, income, healing ----
  nightUpkeep(st);
  st.day++;
  checkEnd(st);
  st.rngState = rng.state();
  st.lastReports = reports.map(r => ({ ...r, battle: null, before: null }));
  return reports;
}

function applyBattle(st, a, c, r, rep) {
  const attF = a.owner, defF = c.owner;
  for (const e of r.att) { const s = a.squads.find(x => x.id === e.id); if (s) s.hp = e.hp; }
  a.squads = a.squads.filter(s => s.hp > 0.5);
  for (const e of r.def) { const s = c.squads.find(x => x.id === e.id); if (s) s.hp = e.hp; }
  c.squads = c.squads.filter(s => s.hp > 0.5);
  c.towers = r.towers.map(h => Math.max(0, h));
  c.core = Math.max(0, r.core);

  if (r.outcome === 'routed' && a.squads.length) {
    // defenders flee
    if (defF && c.squads.length) {
      const refuge = nearestOwned(st, c.id, defF);
      if (refuge) { c.squads.forEach(s => { s.row = null; s.lane = null; }); refuge.squads.push(...c.squads); fillSlots(refuge.squads); }
    }
    c.owner = attF;
    c.squads = [];
    c.wardsDown = 0;
    const tm = towerMaxOf(c);
    c.towers = [tm * 0.3, tm * 0.3, tm * 0.3];
    c.core = coreMax(c.lvl) * 0.4;
    // the army moves in; keep its formation
    c.squads = a.squads;
    const f = st.factions[attF];
    if (a.wiz === 'wiz') f.wizards++;
    if (a.wiz === 'king') f.kingHome = true;
    st.armies = st.armies.filter(x => x !== a);
    news(st, `${fname(attF)} ROUTED ${fname(defF)} and took ${c.name}!`, attF, 'big');
    return;
  }
  if (r.outcome === 'breached') c.wardsDown = 2;
  if (r.attWiped || !a.squads.length) {
    const f = st.factions[attF];
    if (a.wiz === 'king') { f.kingAlive = false; f.kingHome = false; rep.kingDied = true; }
    rep.wizDied = !!a.wiz;
    st.armies = st.armies.filter(x => x !== a);
    news(st, `${fname(attF)}'s army was wiped out at ${c.name}${a.wiz === 'king' ? ' — THE KING HAS FALLEN' : (a.wiz ? ', their wizard lost' : '')}.`, attF, 'bad');
    return;
  }
  const verb = r.outcome === 'breached' ? 'BREACHED' : 'was repelled from';
  if (r.reason === 'timeout') {
    news(st, `${fname(attF)} ${verb} ${c.name} and holds the siege.`, attF);
  } else {
    startReturn(st, a);
    news(st, `${fname(attF)} ${verb} ${c.name} and falls back.`, attF);
  }
}

function nightUpkeep(st) {
  const domMax = (fid) => Math.max(0, ...Object.values(st.factions).filter(g => g.alive && g.id !== fid).map(g => g.dominion));
  for (const f of Object.values(st.factions)) {
    if (!f.alive) continue;
    const mods = modsOf(f.id);
    const drain = Math.max(0.5, 1 - 0.06 * domMax(f.id));
    let food = 0, gold = 0, mana = 0;
    for (const c of owned(st, f.id)) {
      const T = CASTLE_TYPES[c.type];
      food += T.food; gold += T.gold; mana += T.mana;
    }
    food = Math.round(food * (mods.food || 1) * drain);
    gold = Math.round(gold * (mods.gold || 1) * drain);
    mana = Math.round(mana * (mods.mana || 1) * drain);
    let upkeep = 0;
    const all = [...owned(st, f.id).flatMap(c => c.squads), ...st.armies.filter(a => a.owner === f.id).flatMap(a => a.squads)];
    for (const s of all) upkeep += UNITS[s.type].food;
    upkeep = Math.round(upkeep * (mods.upkeep || 1));
    f.food += food - upkeep; f.gold += gold; f.mana += mana;
    f.lastIncome = { food: food - upkeep, foodGross: food, upkeep, gold, mana, drain };
    if (f.food < 0) {
      f.food = 0;
      for (const s of all) s.hp = Math.max(UNITS[s.type].hp, s.hp - maxSquadHp(s.type) * 0.1);
      news(st, `${fname(f.id)} troops go hungry — deserters slip away in the night.`, f.id, f.isPlayer ? 'bad' : 'info');
    }
    f.wizTraining = f.wizTraining.map(d => d - 1);
    const done = f.wizTraining.filter(d => d <= 0).length;
    if (done) { f.wizards += done; if (f.isPlayer) news(st, `A new wizard has finished training.`, f.id, 'good'); }
    f.wizTraining = f.wizTraining.filter(d => d > 0);
  }
  for (const c of st.castles) {
    const tm = towerMaxOf(c), cm = coreMax(c.lvl);
    if (c.wardsDown === 0) {
      const rate = c.owner ? 0.05 : 0.1;
      c.towers = c.towers.map(h => Math.min(tm, h + tm * rate));
      c.core = Math.min(cm, c.core + cm * rate);
    }
    for (const s of c.squads) s.hp = Math.min(maxSquadHp(s.type), s.hp + maxSquadHp(s.type) * 0.1);
    if (c.wardsDown > 0) c.wardsDown--;
  }
  for (const f of Object.values(st.factions)) {
    if (!f.alive) continue;
    const n = owned(st, f.id).length;
    const field = st.armies.filter(a => a.owner === f.id);
    if (n === 0 && !field.length) {
      f.alive = false;
      news(st, `${fname(f.id)} has been wiped from the map.`, f.id, 'big');
      continue;
    }
    if (n === 0) {
      // homeless: the court rides with its last army (full Wandering Court comes later)
      if (f.kingHome && f.kingAlive) {
        const a = field.find(x => x.wiz !== 'king');
        if (a) { if (a.wiz === 'wiz') f.wizards++; a.wiz = 'king'; f.kingHome = false; }
      }
      if (!f.homelessNoted) { f.homelessNoted = true; news(st, `${fname(f.id)} has no castle left — its last army fights on.`, f.id, f.isPlayer ? 'bad' : 'info'); }
      f.dominion = 0;
      continue;
    }
    f.homelessNoted = false;
    if (n >= MAJORITY) {
      f.dominion++;
      news(st, `${fname(f.id)} holds the majority — Dominion ${f.dominion}/${DOMINION_DAYS}.`, f.id, f.isPlayer ? 'good' : 'bad');
    } else f.dominion = 0;
  }
}

function checkEnd(st) {
  if (st.result) return;
  const me = st.factions[st.playerFid];
  if (!me.kingAlive) { st.result = { win: false, text: 'Your King has fallen. The kingdom scatters to the winds.' }; return; }
  if (!me.alive) { st.result = { win: false, text: 'Your last castle and your last army have fallen.' }; return; }
  for (const f of Object.values(st.factions)) {
    if (f.alive && f.dominion >= DOMINION_DAYS) {
      st.result = f.isPlayer
        ? { win: true, text: 'Dominion! The data centers sing your name.' }
        : { win: false, text: `${facDef(f.id).name} achieved Dominion over the land.` };
      return;
    }
  }
  if (Object.values(st.factions).filter(f => f.alive).length === 1) {
    st.result = { win: true, text: 'Last faction standing. The realm is yours.' };
  }
}
