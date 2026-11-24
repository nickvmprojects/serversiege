// Server Siege — bot faction brains
import { UNITS, CASTLE_TYPES, WIZARD_COST, UPGRADE_COST, REPAIR_COST, unitCost } from './data.js';
import { simulateBattle } from './battle.js';
import {
  facDef, modsOf, owned, neighbors, isFrontier, squadCount, cmdLimitOf, castleDefense,
  autoFormation, recruit, repair, upgrade, trainWizard, sendArmy, recallArmy, needsRepair,
  towerMaxOf,
} from './world.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const power = (sq) => { const u = UNITS[sq.type]; return sq.hp * u.dmg / u.cd; };

function predict(st, fid, squads, wiz, c, seed) {
  const att = { fid, mods: modsOf(fid), wiz, squads: autoFormation(clone(squads)) };
  const def = clone(castleDefense(st, c));
  return simulateBattle({ seed, att, def });
}

function foodBalance(st, fid) {
  const mods = modsOf(fid);
  let food = 0;
  for (const c of owned(st, fid)) food += CASTLE_TYPES[c.type].food;
  food *= (mods.food || 1);
  let up = 0;
  for (const c of owned(st, fid)) for (const s of c.squads) up += UNITS[s.type].food;
  for (const a of st.armies) if (a.owner === fid) for (const s of a.squads) up += UNITS[s.type].food;
  return food - up * (mods.upkeep || 1);
}

export function runAI(st, fid, rng) {
  const f = st.factions[fid];
  if (!f.alive) return;
  const P = facDef(fid).ai;
  const mine = owned(st, fid);
  if (!mine.length) return;

  // who is running away with the map?
  let leader = null, leaderCount = 0;
  for (const g of Object.values(st.factions)) {
    if (!g.alive || g.id === fid) continue;
    const n = owned(st, g.id).length;
    if (n > leaderCount) { leader = g.id; leaderCount = n; }
  }
  if (leaderCount < 6) leader = null;

  // 1. wizards
  const wantWiz = P.agg > 0.6 ? 3 : 2;
  if (f.wizards + f.wizTraining.length < wantWiz) {
    const shrine = mine.find(c => c.type === 'shrine');
    if (shrine && f.gold >= WIZARD_COST.gold + 20) trainWizard(st, fid, shrine.id);
  }

  // 2. recall hopeless sieges
  for (const a of st.armies.filter(a => a.owner === fid && a.state === 'siege')) {
    const c = st.castles[a.to];
    if (c.owner === fid) continue;
    const r = predict(st, fid, a.squads, a.wiz, c, rng.int(1, 1e9));
    if (r.outcome === 'repelled' || r.attWiped) recallArmy(st, fid, a.id);
  }

  // 3. attacks
  const busyTargets = new Set(st.armies.filter(a => a.owner === fid && a.state !== 'return').map(a => a.to));
  let attacksLeft = 1 + (P.agg > 0.7 ? 1 : 0);
  const hasShrine = mine.some(c => c.type === 'shrine');
  const foodPoor = (f.lastIncome && f.lastIncome.food < 2) || f.food < 15;
  const options = [];
  for (const c of mine) {
    const slotted = c.squads.filter(s => s.row != null);
    if (slotted.length < 2) continue;
    const keep = slotted.length >= 4 ? Math.round(P.def * 2) : (P.def > 0.6 ? 1 : 0);
    const sorted = [...c.squads].sort((a, b) => power(b) - power(a));
    const sendSq = sorted.slice(0, Math.max(0, c.squads.length - keep)).slice(0, 6);
    if (sendSq.length < 2) continue;
    for (const n of neighbors(st, c.id)) {
      const t = st.castles[n.id];
      if (t.owner === fid || busyTargets.has(t.id)) continue;
      if (f.wizards < 1) continue;
      const r = predict(st, fid, sendSq, 'wiz', t, rng.int(1, 1e9));
      let score = r.outcome === 'routed' ? 1 : (r.outcome === 'breached' ? 0.6 : 0);
      if (r.attWiped) score = 0;
      if (score === 0) continue;
      score *= t.owner ? (0.6 + P.agg) : (0.6 + P.exp);
      if (t.wardsDown > 0) score += P.opp * 0.6;
      if (leader && t.owner === leader) score += 0.5;
      if (t.type === 'granary' && foodPoor) score += 0.4;
      if (t.type === 'shrine' && !hasShrine) score += 0.4;
      score -= n.days * 0.08;
      score += rng() * 0.15;
      const need = r.outcome === 'routed' ? 0.4 : 0.85 - P.agg * 0.4 - P.opp * 0.2;
      if (score >= need) options.push({ score, from: c.id, to: t.id, ids: sendSq.map(s => s.id) });
    }
  }
  options.sort((a, b) => b.score - a.score);
  const usedFrom = new Set();
  for (const o of options) {
    if (attacksLeft <= 0 || f.wizards < 1) break;
    if (usedFrom.has(o.from) || busyTargets.has(o.to)) continue;
    const res = sendArmy(st, fid, o.from, o.ids, 'wiz', o.to);
    if (res.ok) { attacksLeft--; usedFrom.add(o.from); busyTargets.add(o.to); }
  }

  // 4. repairs and upgrades (frontier first)
  const byFront = owned(st, fid).sort((a, b) => (isFrontier(st, b) ? 1 : 0) - (isFrontier(st, a) ? 1 : 0));
  for (const c of byFront) {
    const tm = towerMaxOf(c);
    const avg = c.towers.reduce((s, h) => s + h, 0) / (3 * tm);
    if (c.wardsDown === 0 && avg < 0.75 && needsRepair(c) && f.mana >= REPAIR_COST.mana) repair(st, fid, c.id);
  }
  if (P.def > 0.6 || f.gold > 300) {
    for (const c of byFront) {
      if (!isFrontier(st, c) || c.lvl >= 3) continue;
      const cost = UPGRADE_COST[c.lvl];
      if (f.gold >= cost.gold + (P.def > 0.6 ? 60 : 200) && f.mana >= cost.mana) { upgrade(st, fid, c.id); break; }
    }
  }

  // 5. recruit
  for (const c of byFront) {
    const front = isFrontier(st, c);
    const desired = front ? Math.min(6, 3 + Math.round(P.def * 3)) : 1;
    let guard = 0;
    while (c.squads.length < desired && squadCount(st, fid) < cmdLimitOf(st, fid) && guard++ < 6) {
      if (foodBalance(st, fid) < 0 && f.food < 25) break;
      const opts = CASTLE_TYPES[c.type].recruit.filter(t => {
        const cost = unitCost(t, modsOf(fid));
        if (t === 'ballista' && (P.agg < 0.5 || f.gold < 160)) return false;
        return f.gold >= cost.gold + 25 && f.mana >= cost.mana;
      });
      if (!opts.length) break;
      // balance: prefer what the garrison lacks
      const have = (cls) => c.squads.filter(s => UNITS[s.type].cls === cls).length;
      const pick = rng() < 0.6 ? opts.sort((a, b) => have(UNITS[a].cls) - have(UNITS[b].cls))[0] : rng.pick(opts);
      if (!recruit(st, fid, c.id, pick).ok) break;
    }
  }

  // 6. consolidate: interior castles push spare troops to the front
  for (const c of owned(st, fid)) {
    if (isFrontier(st, c) || c.squads.length <= 1) continue;
    const dest = neighbors(st, c.id).map(n => st.castles[n.id]).filter(x => x.owner === fid)
      .sort((a, b) => (isFrontier(st, b) ? 1 : 0) - (isFrontier(st, a) ? 1 : 0) || a.squads.length - b.squads.length)[0];
    if (!dest || dest.squads.length >= 6) continue;
    const spare = c.squads.slice(1, 1 + Math.min(c.squads.length - 1, 6 - dest.squads.length)).map(s => s.id);
    if (spare.length) sendArmy(st, fid, c.id, spare, null, dest.id);
  }
}
