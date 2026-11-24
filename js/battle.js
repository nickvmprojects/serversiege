// Server Siege — battle simulation (pure logic, no DOM)
import { UNITS, TICK_LIMIT, DMG_SCALE, counterMult, makeRng } from './data.js';

const ADVANCES = { melee: true, anti: true };

/*
 opts = {
   seed,
   att: { fid, mods, wiz: 'king'|'wiz'|null, squads: [{id,type,hp,lane,row}] },
   def: { fid, mods, squads: [...], towers: [{hp,max,dmg}], core: {hp,max}, wardsDown: bool },
 }
 Returns a result object; when record=true it also holds per-tick frames for replay.
*/
export function simulateBattle(opts, record = false) {
  const rng = makeRng(opts.seed);
  const ents = [];
  const sides = { A: opts.att, D: opts.def };
  for (const side of ['A', 'D']) {
    for (const sq of sides[side].squads) {
      if (sq.row == null || sq.hp <= 0) continue;
      const u = UNITS[sq.type];
      ents.push({ id: 's' + sq.id, sqId: sq.id, side, kind: 'squad', type: sq.type, u,
        lane: sq.lane, row: sq.row, hp: sq.hp, maxHp: u.n * u.hp, cd: 1 + Math.floor(rng() * u.cd), stun: 0, alive: true });
    }
  }
  const wardMult = opts.def.wardsDown ? 0.6 : 1;
  const towers = opts.def.towers.map((t, i) => ({ id: 't' + i, side: 'D', kind: 'tower', lane: i,
    hp: t.hp, maxHp: t.max, dmg: t.dmg * wardMult, cd: 1 + Math.floor(rng() * 4), alive: t.hp > 0 }));
  const core = { id: 'core', side: 'D', kind: 'core', hp: opts.def.core.hp, maxHp: opts.def.core.max, alive: opts.def.core.hp > 0 };

  const squadsOf = (side) => ents.filter(e => e.side === side && e.alive);
  const at = (side, lane, row) => ents.find(e => e.alive && e.side === side && e.lane === lane && e.row === row);
  const laneOrder = (lane) => [lane, lane - 1, lane + 1, lane - 2, lane + 2].filter(l => l >= 0 && l <= 2);
  const soldiers = (e) => Math.ceil(e.hp / e.u.hp);
  const attStart = squadsOf('A').reduce((s, e) => s + e.hp, 0);
  const defStartCount = squadsOf('D').length;
  const attMods = opts.att.mods || {};
  const king = opts.att.wiz === 'king';

  let events = [];
  const frames = [];
  const initInfo = record ? {
    ents: ents.map(e => ({ id: e.id, side: e.side, type: e.type, maxHp: e.maxHp, hp: Math.round(e.hp), p: e.lane * 2 + e.row })),
    towers: towers.map(t => ({ id: t.id, maxHp: t.maxHp, hp: Math.round(t.hp) })),
    core: { maxHp: core.maxHp, hp: Math.round(core.hp) },
    wiz: opts.att.wiz || null,
  } : null;

  function damage(tgt, amount) {
    tgt.hp -= amount;
    if (tgt.hp <= 0) { tgt.hp = 0; tgt.alive = false; events.push({ k: 'die', t: tgt.id }); }
  }

  function structureTarget(lane) {
    const t = towers[lane];
    if (t.alive) return t;
    return core.alive ? core : null;
  }

  function pickTarget(e) {
    const cls = e.u.cls;
    const enemy = e.side === 'A' ? 'D' : 'A';
    if (cls === 'siege') {
      if (e.row === 0) return null;                 // too close to fire
      if (e.side === 'A') {
        for (const l of laneOrder(e.lane)) if (towers[l].alive) return towers[l];
        return core.alive ? core : null;
      }
      for (const l of laneOrder(e.lane)) { const t = at(enemy, l, 0) || at(enemy, l, 1); if (t) return t; }
      return null;
    }
    if (cls === 'ranged') {
      for (const l of laneOrder(e.lane)) { const t = at(enemy, l, 0) || at(enemy, l, 1); if (t) return t; }
      return e.side === 'A' ? structureTarget(e.lane) : null;
    }
    // melee / anti: only fights from the front row, in its own lane
    if (e.row !== 0) return null;
    const t = at(enemy, e.lane, 0) || at(enemy, e.lane, 1);
    if (t) return t;
    return e.side === 'A' ? structureTarget(e.lane) : null;
  }

  function attack(e, tgt) {
    const isStruct = tgt.kind !== 'squad';
    const mult = isStruct ? counterMult(e.u.cls, 'fort') : counterMult(e.u.cls, tgt.u.cls, tgt.u.heavy);
    let dmg = soldiers(e) * e.u.dmg * mult * DMG_SCALE * (0.85 + rng() * 0.3);
    const mods = e.side === 'A' ? attMods : (opts.def.mods || {});
    if (e.u.cls === 'siege' && mods.siegeDmg) dmg *= mods.siegeDmg;
    if (e.side === 'A' && king) dmg *= 1.15;
    let stunned = false;
    if (e.u.stun && !isStruct && tgt.u.cls === 'melee' && rng() < e.u.stun) { tgt.stun = 2; stunned = true; }
    events.push({ k: 'hit', a: e.id, t: tgt.id, d: Math.round(dmg), c: mult > 1.01 ? 1 : (mult < 0.99 ? -1 : 0), s: stunned ? 1 : 0 });
    damage(tgt, dmg);
    if (e.u.cls === 'siege' && !isStruct) {            // splash to the other row of that lane
      const other = at(tgt.side, tgt.lane, tgt.row === 0 ? 1 : 0);
      if (other) { const sd = dmg * 0.5; events.push({ k: 'hit', a: e.id, t: other.id, d: Math.round(sd), c: 0, s: 0 }); damage(other, sd); }
    }
  }

  function act(e) {
    if (e.stun > 0) { e.stun--; return; }
    if (e.cd > 0) e.cd--;
    const cls = e.u.cls;
    // back-row fighters step up when their front slot opens
    if (e.row === 1 && ADVANCES[cls] && !at(e.side, e.lane, 0)) { e.row = 0; events.push({ k: 'move', t: e.id }); return; }
    // siege stuck in the front row steps back if it can
    if (cls === 'siege' && e.row === 0 && !at(e.side, e.lane, 1)) { e.row = 1; events.push({ k: 'move', t: e.id }); return; }
    if (e.cd > 0) return;
    const tgt = pickTarget(e);
    if (tgt) { attack(e, tgt); e.cd = e.u.cd + (rng() < 0.3 ? 1 : 0); return; }
    // defenders in the front row with nobody in their lane shift to a busy lane
    if (e.side === 'D' && ADVANCES[cls] && e.row === 0) {
      for (const l of laneOrder(e.lane)) {
        if (l === e.lane) continue;
        if ((at('A', l, 0) || at('A', l, 1)) && !at('D', l, 0)) { e.lane = l; events.push({ k: 'move', t: e.id }); return; }
      }
    }
  }

  function towerAct(t) {
    if (!t.alive) return;
    if (t.cd > 0) { t.cd--; return; }
    let tgt = null;
    for (const l of [t.lane, t.lane - 1, t.lane + 1]) {
      if (l < 0 || l > 2) continue;
      tgt = at('A', l, 0) || at('A', l, 1);
      if (tgt) break;
    }
    if (!tgt) return;
    const dmg = t.dmg * DMG_SCALE * (0.85 + rng() * 0.3);
    events.push({ k: 'hit', a: t.id, t: tgt.id, d: Math.round(dmg), c: 0, s: 0 });
    damage(tgt, dmg);
    t.cd = 4;
  }

  function wizardAct(tick) {
    if (!opts.att.wiz || tick % 12 !== 11) return;
    const alive = squadsOf('A').filter(e => e.hp < e.maxHp);
    if (!alive.length) return;
    alive.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    const e = alive[0];
    const amt = Math.min(e.maxHp - e.hp, e.maxHp * (king ? 0.25 : 0.15));
    e.hp += amt;
    events.push({ k: 'heal', t: e.id, d: Math.round(amt) });
  }

  let reason = 'timeout';
  let tick = 0;
  for (; tick < TICK_LIMIT; tick++) {
    events = [];
    const order = rng.shuffle(ents.filter(e => e.alive));
    for (const e of order) if (e.alive) act(e);
    for (const t of towers) towerAct(t);
    wizardAct(tick);
    if (record) frames.push({
      h: ents.map(e => Math.round(e.hp)),
      p: ents.map(e => e.lane * 2 + e.row),
      st: ents.map(e => e.stun > 0 ? 1 : 0),
      tw: towers.map(t => Math.round(t.hp)),
      c: Math.round(core.hp),
      ev: events,
    });
    if (!core.alive) { reason = 'core'; break; }
    const attAlive = squadsOf('A');
    if (!attAlive.length) { reason = 'wiped'; break; }
    if (attAlive.reduce((s, e) => s + e.hp, 0) / attStart < 0.2) { reason = 'retreat'; break; }
  }

  const towersDown = towers.filter(t => !t.alive).length;
  const defAlive = squadsOf('D').length;
  const attAlive = squadsOf('A').length;
  let outcome;
  if (!core.alive) outcome = 'routed';
  else if (core.hp / core.maxHp < 0.5 || towersDown >= 2 || (defStartCount > 0 && defAlive === 0 && attAlive > 0)) outcome = 'breached';
  else outcome = 'repelled';

  const lost = (side) => {
    let n = 0;
    for (const sq of sides[side].squads) {
      if (sq.row == null) continue;
      const e = ents.find(x => x.sqId === sq.id && x.side === side);
      if (!e) continue;
      n += Math.ceil(sq.hp / e.u.hp) - Math.ceil(e.hp / e.u.hp);
    }
    return n;
  };

  return {
    outcome, reason, ticks: tick + 1,
    att: ents.filter(e => e.side === 'A').map(e => ({ id: e.sqId, hp: e.hp, lane: e.lane, row: e.row })),
    def: ents.filter(e => e.side === 'D').map(e => ({ id: e.sqId, hp: e.hp, lane: e.lane, row: e.row })),
    towers: towers.map(t => t.hp),
    core: core.hp,
    attLost: lost('A'), defLost: lost('D'),
    attWiped: attAlive === 0,
    frames: record ? frames : null,
    init: initInfo,
  };
}
