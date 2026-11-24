// Server Siege — user interface
import {
  VERSION, CHANGELOG, UNITS, CLS_LABEL, CASTLE_TYPES, FACTIONS, NEUTRAL_COLOR, WIZARD_COST, REPAIR_COST,
  UPGRADE_COST, MAX_TOWER_LVL, MAJORITY, DOMINION_DAYS, unitCost, coreMax, makeRng,
} from './data.js';
import {
  facDef, modsOf, owned, neighbors, roadDays, squadCount, cmdLimitOf, towerMaxOf, maxSquadHp, soldiersOf,
  newGame, saveGame, loadGame, clearSave, canRecruit, recruit, repair, upgrade, trainWizard, sendArmy,
  cancelArmy, recallArmy, moveSquad, armyPos, needsRepair,
} from './world.js';
import { endNight } from './turn.js';
import { ICON, TYPE_COLOR, castleSVG } from './icons.js';
import { MAP_W, MAP_H } from './mapgen.js';

const $ = (s) => document.querySelector(s);
let st = null;
let ui = { sel: null, armySel: null, mode: null, squadSel: null, msg: '', msgBad: false, edit: null };
let decoCache = null;

const colorOf = (fid) => (fid ? facDef(fid).color : NEUTRAL_COLOR);
const nameOf = (fid) => (fid ? facDef(fid).name : 'Old Guardians');
const me = () => st.factions[st.playerFid];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function showOverlay(html) { const o = $('#overlay'); o.innerHTML = html; o.classList.remove('hidden'); o.scrollTop = 0; }
function hideOverlay() { $('#overlay').classList.add('hidden'); $('#overlay').innerHTML = ''; }

// ---------------- shared bits ----------------
function bar(r, cls = '') {
  r = Math.max(0, Math.min(1, r || 0));
  return `<div class="bar ${cls} ${r < 0.35 ? 'low' : ''}"><i style="width:${(r * 100).toFixed(1)}%"></i></div>`;
}
function squadCard(sq, color, extra = '') {
  const u = UNITS[sq.type];
  return `<div class="sq ${ui.squadSel === sq.id ? 'sel' : ''} ${extra}" style="--sqc:${color}" data-act="sq" data-id="${sq.id}">
    <div class="top">${ICON[sq.type]}<span>${u.short}</span><span class="n">×${soldiersOf(sq)}</span></div>${bar(sq.hp / maxSquadHp(sq.type))}</div>`;
}
const STRONG = { melee: 'Strong vs Ranged · weak vs Anti-melee', ranged: 'Strong vs Anti-melee · weak vs Melee', anti: 'Strong vs Melee · weak vs Ranged', siege: 'Strong vs towers & core · weak vs Melee' };
function squadInfo(list) {
  const s = list.find((x) => x.id === ui.squadSel);
  if (!s) return '';
  const u = UNITS[s.type];
  const warn = u.cls === 'siege' && s.row === 0 ? '<div class="warn">⚠ Siege cannot fire from the front row.</div>' : '';
  return `<div class="card" style="margin-top:6px;padding:8px"><b>${u.name}</b> <span class="sub">${CLS_LABEL[u.cls]}${u.heavy ? ' · heavy' : ''}</span>
    <div class="sub">${soldiersOf(s)}/${u.n} soldiers · HP ${Math.round(s.hp)}/${maxSquadHp(s.type)} · eats ${u.food}🌾/night</div>
    <div style="font-size:12px;margin-top:3px">${u.desc}</div><div class="sub">${STRONG[u.cls]}</div>${warn}</div>`;
}
function formationGrid(squads, color, editable) {
  const can = editable && ui.squadSel != null && squads.some((s) => s.id === ui.squadSel);
  const slot = (lane, row) => {
    const s = squads.find((x) => x.lane === lane && x.row === row);
    return `<div class="slot ${can ? 'can' : ''}" data-act="slot" data-lane="${lane}" data-row="${row}">${s ? squadCard(s, color) : ''}</div>`;
  };
  let h = '<div class="formation"><div class="lbl">▲ Front row</div>';
  for (let l = 0; l < 3; l++) h += slot(l, 0);
  h += '<div class="lbl">Back row</div>';
  for (let l = 0; l < 3; l++) h += slot(l, 1);
  h += '</div>';
  const res = squads.filter((s) => s.row == null);
  if (res.length || can) {
    h += `<h3>Reserve <span class="sub">(doesn't fight, fills gaps after losses)</span></h3><div class="reserve ${can ? 'can' : ''}" data-act="slot" data-lane="" data-row="">${res.map((s) => squadCard(s, color)).join('') || '<span class="sub">Tap here to move a squad to reserve</span>'}</div>`;
  }
  return h + squadInfo(squads);
}
function guardianBars(c) {
  const tm = towerMaxOf(c), cm = coreMax(c.lvl);
  return `<div class="gbars">${c.towers.map((h, i) => `<div class="gbar">Tower ${'LMR'[i]}${bar(h / tm)}</div>`).join('')}
    <div class="gbar">Core ${Math.round(c.core)}/${cm}${bar(c.core / cm, 'core')}</div></div>
    ${c.wardsDown > 0 ? `<div class="warn" style="margin-top:4px">⚠ Wards down for ${plural(c.wardsDown, 'more night')}: towers weakened, no repairs.</div>` : ''}`;
}
function projIncome(fid) {
  const mods = modsOf(fid);
  const domMax = Math.max(0, ...Object.values(st.factions).filter((g) => g.alive && g.id !== fid).map((g) => g.dominion));
  const drain = Math.max(0.5, 1 - 0.06 * domMax);
  let food = 0, gold = 0, mana = 0, up = 0;
  for (const c of owned(st, fid)) { const T = CASTLE_TYPES[c.type]; food += T.food; gold += T.gold; mana += T.mana; up += c.squads.reduce((s, q) => s + UNITS[q.type].food, 0); }
  for (const a of st.armies) if (a.owner === fid) up += a.squads.reduce((s, q) => s + UNITS[q.type].food, 0);
  return {
    food: Math.round(food * (mods.food || 1) * drain) - Math.round(up * (mods.upkeep || 1)),
    gold: Math.round(gold * (mods.gold || 1) * drain), mana: Math.round(mana * (mods.mana || 1) * drain),
  };
}
const sgn = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---------------- top bar ----------------
function renderTop() {
  const f = me();
  const inc = projIncome(st.playerFid);
  const counts = FACTIONS.filter((x) => st.factions[x.id].alive).map((x) => {
    const n = owned(st, x.id).length, d = st.factions[x.id].dominion;
    return `<span class="chip ${d ? 'dom' : ''}" style="border-color:${x.color};color:${x.color}" title="${x.name}">${x.id === st.playerFid ? '★' : '■'} ${n}${d ? ` ◆${d}/${DOMINION_DAYS}` : ''}</span>`;
  }).join('');
  const neutral = st.castles.filter((c) => !c.owner).length;
  $('#topbar').innerHTML = `
    <div class="tb-row"><div class="tb-day">Day ${st.day} · <span class="phase">🌙 Night</span></div>
      <button class="tb-menu small" data-act="menu">☰</button></div>
    <div class="tb-row"><div class="row" style="gap:4px">${counts}<span class="chip" style="color:${NEUTRAL_COLOR}">◇ ${neutral}</span></div>
      <span class="sub">Majority: ${MAJORITY}</span></div>
    <div class="tb-res">
      <span>🌾${f.food}<span class="d ${inc.food < 0 ? 'neg' : ''}">${sgn(inc.food)}</span></span>
      <span>🪙${f.gold}<span class="d">${sgn(inc.gold)}</span></span>
      <span>🔮${f.mana}<span class="d">${sgn(inc.mana)}</span></span>
      <span>🧙${f.wizards}${f.wizTraining.length ? `<span class="d">+${f.wizTraining.length}</span>` : ''}</span>
      <span>${f.kingAlive ? (f.kingHome ? '👑' : '👑<span class="d">away</span>') : '💀'}</span>
      <span>⚔${squadCount(st, st.playerFid)}/${cmdLimitOf(st, st.playerFid)}</span>
    </div>`;
}

// ---------------- map ----------------
function svgDefs() {
  return `<defs>
    <radialGradient id="bgg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#162036"/><stop offset="1" stop-color="#05070c"/></radialGradient>
    ${Object.entries(TYPE_COLOR).map(([t, c]) => `<radialGradient id="glow-${t}"><stop offset="0" stop-color="${c}" stop-opacity="0.45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('')}
  </defs>`;
}
function deco() {
  if (decoCache && decoCache.seed === st.seed) return decoCache.svg;
  const rng = makeRng(st.seed + 99);
  let h = '';
  for (let i = 0; i < 26; i++) {
    let x = rng() * MAP_W, y = rng() * MAP_H;
    let d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
    for (let k = 0; k < 4; k++) {
      if (rng() < 0.5) x += (rng() - 0.5) * 260; else y += (rng() - 0.5) * 260;
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    h += `<path d="${d}" stroke="#3ff0ff" stroke-opacity="0.07" stroke-width="3" fill="none"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="6" fill="none" stroke="#3ff0ff" stroke-opacity="0.12" stroke-width="2"/>`;
  }
  decoCache = { seed: st.seed, svg: h };
  return h;
}
function sendTargets() {
  if (!ui.mode || ui.mode.kind !== 'send') return [];
  return neighbors(st, ui.mode.from).map((n) => n.id);
}
function renderMap() {
  const svg = $('#map');
  svg.setAttribute('viewBox', `0 0 ${MAP_W} ${MAP_H}`);
  const targets = sendTargets();
  let h = svgDefs() + `<rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="url(#bgg)" data-act="bg"/>` + deco();
  for (const r of st.roads) {
    const A = st.castles[r.a], B = st.castles[r.b];
    const hl = ui.mode && ui.mode.kind === 'send' && ((r.a === ui.mode.from && targets.includes(r.b)) || (r.b === ui.mode.from && targets.includes(r.a)));
    h += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#1d2433" stroke-width="13" stroke-linecap="round"/>
      <line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${hl ? '#3ff0ff' : '#5a6680'}" stroke-width="${hl ? 4 : 3}" stroke-dasharray="12 10"/>`;
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    for (let k = 0; k < r.days; k++) h += `<circle cx="${mx + (k - (r.days - 1) / 2) * 15}" cy="${my}" r="5.5" fill="#d8cca8" stroke="#05070b" stroke-width="2"/>`;
  }
  for (const c of st.castles) {
    const col = colorOf(c.owner);
    const isT = targets.includes(c.id);
    h += `<g transform="translate(${c.x} ${c.y}) scale(1.25)" data-act="castle" data-id="${c.id}">
      ${isT ? `<circle r="70" fill="none" stroke="#3ff0ff" stroke-width="5" class="${ui.mode.target === c.id ? '' : 'c-target'}"/>` : ''}
      ${isT && ui.mode.target === c.id ? `<g transform="translate(-40 -40)"><circle r="17" fill="#3ff0ff" stroke="#05070b" stroke-width="3"/><path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#05070b" stroke-width="4" stroke-linecap="round"/></g>` : ''}
      ${ui.sel === c.id ? `<circle r="64" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="14 10" class="c-sel"/>` : ''}
      ${castleSVG(c.type, col, c.lvl)}
      ${c.wardsDown > 0 ? `<path class="wards" d="M-22 -12 l9 9 -7 6 11 12 -6 5" stroke="#ff3b3b" stroke-width="5" fill="none" stroke-linecap="round"/>` : ''}
      <g transform="translate(40 -40)"><circle r="16" fill="#0b0f17" stroke="${col}" stroke-width="3"/><text y="6.5" text-anchor="middle" font-size="19" fill="#fff" font-family="monospace" font-weight="bold">${c.squads.length}</text></g>
      <text class="c-name" y="64">${esc(c.name)}</text>
      <circle r="62" fill="transparent"/></g>`;
  }
  for (const a of st.armies) {
    const p = armyPos(st, a), col = colorOf(a.owner);
    const siege = a.state === 'siege';
    h += `<g transform="translate(${p.x.toFixed(0)} ${p.y.toFixed(0)}) scale(1.3)" data-act="army" data-id="${a.id}">
      ${siege ? `<circle r="27" fill="none" stroke="#ff3b3b" stroke-width="4" stroke-dasharray="6 5" class="c-target"/>` : ''}
      ${ui.armySel === a.id ? `<circle r="30" fill="none" stroke="#fff" stroke-width="3"/>` : ''}
      <circle r="21" fill="${col}" stroke="#05070b" stroke-width="4"/>
      <path d="M-9 -9 L9 9 M9 -9 L-9 9" stroke="#05070b" stroke-width="4" stroke-linecap="round"/>
      ${a.wiz ? `<circle cx="16" cy="-16" r="8" fill="${a.wiz === 'king' ? '#ffd54a' : '#b48cff'}" stroke="#05070b" stroke-width="2"/>` : ''}
      ${!siege ? `<text y="42" text-anchor="middle" class="c-name" style="font-size:20px">${a.state === 'return' ? '↩' : ''}${a.daysLeft}d</text>` : ''}
      <circle r="30" fill="transparent"/></g>`;
  }
  svg.innerHTML = h;
}

// ---------------- sheet panels ----------------
function newsItem(n) {
  return `<li class="${n.kind}" style="--nc:${n.fid ? colorOf(n.fid) : '#556'}"><span class="dd">D${n.day}</span>${esc(n.text)}</li>`;
}
function newsPanel() {
  return `<h2>Chronicle</h2><div class="sub">Tap a castle to manage it. Your castles have a ★ chip colour in the top bar.</div>
    <ul class="news" style="margin-top:8px">${st.news.slice(0, 30).map(newsItem).join('')}</ul>`;
}
function msgLine() { return ui.msg ? `<div class="msg ${ui.msgBad ? 'bad' : 'good'}">${esc(ui.msg)}</div>` : ''; }
function ownCastlePanel(c) {
  const f = me(), T = CASTLE_TYPES[c.type], mods = modsOf(st.playerFid);
  ui.edit = { kind: 'castle', id: c.id, editable: true };
  const upCost = c.lvl < MAX_TOWER_LVL ? UPGRADE_COST[c.lvl] : null;
  const fresh = st.armies.filter((a) => a.owner === st.playerFid && a.fresh && a.from === c.id);
  const prod = [T.food ? `🌾${Math.round(T.food * (mods.food || 1))}` : '', T.gold ? `🪙${Math.round(T.gold * (mods.gold || 1))}` : '', T.mana ? `🔮${Math.round(T.mana * (mods.mana || 1))}` : ''].filter(Boolean).join(' ');
  return `<h2>${esc(c.name)}<span class="tag" style="color:${TYPE_COLOR[c.type]}">${T.name}</span><span class="tag">Guardians Lv${c.lvl}</span></h2>
    <div class="sub">${T.desc} Produces ${prod} per night.</div>
    ${guardianBars(c)}
    <div class="btns">
      <button class="primary" data-act="send">⚔ Muster army</button>
      <button data-act="repair" ${c.wardsDown || !needsRepair(c) || f.mana < REPAIR_COST.mana ? 'disabled' : ''}>🛠 Patch +35% · ${REPAIR_COST.mana}🔮</button>
      ${upCost ? `<button data-act="upgrade" ${f.gold < upCost.gold || f.mana < upCost.mana || c.wardsDown ? 'disabled' : ''}>⬆ Lv${c.lvl + 1} · ${upCost.gold}🪙 ${upCost.mana}🔮</button>` : ''}
      ${c.type === 'shrine' ? `<button class="cyan" data-act="trainwiz">🧙 Train wizard · ${WIZARD_COST.gold}🪙 ${WIZARD_COST.mana}🔮</button>` : ''}
    </div>${msgLine()}
    ${fresh.length ? `<h3>Leaving at dawn</h3>${fresh.map((a) => `<div class="row" style="margin-bottom:4px"><span>${plural(a.squads.length, 'squad')} ${a.wiz === 'king' ? '👑' : a.wiz ? '🧙' : ''} → ${esc(st.castles[a.to].name)}</span><button class="small" data-act="cancelarmy" data-id="${a.id}">Cancel</button></div>`).join('')}` : ''}
    <h3>Garrison · tap a squad, then a slot</h3>${formationGrid(c.squads, colorOf(st.playerFid), true)}
    <h3>Recruit here · ${squadCount(st, st.playerFid)}/${cmdLimitOf(st, st.playerFid)} squads</h3>
    <div class="recruit">${T.recruit.map((t) => {
      const u = UNITS[t], cost = unitCost(t, mods), ok = canRecruit(st, st.playerFid, c.id, t).ok;
      return `<div class="rc">${ICON[t]}<div class="info"><div class="nm">${u.name} <span class="sub">${CLS_LABEL[u.cls]}</span></div><div class="ds">${u.desc}</div></div>
        <div class="cost">${cost.gold}🪙${cost.mana ? ` ${cost.mana}🔮` : ''}<br><span class="sub">🌾${u.food}/night</span></div>
        <button class="small" data-act="recruit" data-type="${t}" ${ok ? '' : 'disabled'}>+</button></div>`;
    }).join('')}</div>`;
}
function armiesAt(c) {
  return st.armies.filter((a) => a.state === 'siege' && a.to === c.id);
}
function otherCastlePanel(c) {
  ui.edit = { kind: 'castle', id: c.id, editable: false };
  const col = colorOf(c.owner);
  const links = neighbors(st, c.id).filter((n) => st.castles[n.id].owner === st.playerFid)
    .map((n) => `${esc(st.castles[n.id].name)} (${plural(roadDays(st, n.id, c.id, st.playerFid), 'day')})`);
  const here = armiesAt(c);
  return `<h2 style="color:${col}">${esc(c.name)}<span class="tag" style="color:${TYPE_COLOR[c.type]}">${CASTLE_TYPES[c.type].name}</span><span class="tag">Guardians Lv${c.lvl}</span></h2>
    <div class="sub">Held by <b style="color:${col}">${nameOf(c.owner)}</b>${c.owner ? ` · ${facDef(c.owner).style}` : ' · automated defences'}</div>
    <div class="sub">${links.length ? `Reachable from: ${links.join(', ')}` : 'Not next to any of your castles.'}</div>
    ${guardianBars(c)}
    ${here.length ? `<h3>Sieging it now</h3>${here.map((a) => `<div class="row" style="margin-bottom:4px"><span style="color:${colorOf(a.owner)}">■</span><span>${nameOf(a.owner)}: ${plural(a.squads.length, 'squad')}</span><button class="small" data-act="selarmy" data-id="${a.id}">View</button></div>`).join('')}` : ''}
    <h3>Garrison</h3>${formationGrid(c.squads, col, false)}`;
}
function armyPanel(a) {
  const mine = a.owner === st.playerFid;
  ui.edit = { kind: 'army', id: a.id, editable: mine };
  const to = st.castles[a.to], from = st.castles[a.from];
  const status = a.state === 'siege' ? `Besieging <b>${esc(to.name)}</b> — attacks again tomorrow evening`
    : a.state === 'return' ? `Falling back to <b>${esc(to.name)}</b> · ${plural(a.daysLeft, 'day')} left`
    : a.fresh ? `Leaves <b>${esc(from.name)}</b> at dawn for <b>${esc(to.name)}</b> · ${plural(a.daysLeft, 'day')}`
    : `Marching to <b>${esc(to.name)}</b> · ${plural(a.daysLeft, 'day')} left`;
  return `<h2 style="color:${colorOf(a.owner)}">${mine ? 'Your army' : nameOf(a.owner) + ' army'} ${a.wiz === 'king' ? '👑' : a.wiz ? '🧙' : ''}</h2>
    <div class="sub">${status}</div>
    <div class="btns">
      ${mine && a.fresh ? `<button data-act="cancelarmy" data-id="${a.id}">Cancel orders</button>` : ''}
      ${mine && a.state === 'siege' ? `<button data-act="recall" data-id="${a.id}">↩ Fall back</button>` : ''}
      <button data-act="closepanel">Close</button>
    </div>${msgLine()}
    <h3>${mine ? 'Battle formation · tap a squad, then a slot' : 'Formation'}</h3>${formationGrid(a.squads, colorOf(a.owner), mine)}`;
}
function sendValidation() {
  const m = ui.mode, c = st.castles[m.from], f = me();
  if (!m.ids.length) return 'Pick at least one squad.';
  if (m.target == null) return 'Tap a glowing castle on the map.';
  const t = st.castles[m.target];
  if (t.owner !== st.playerFid && !m.wiz) return 'Attacks need a wizard or the King to break the wards.';
  if (m.wiz === 'wiz' && f.wizards < 1) return 'No wizard available.';
  return '';
}
function sendPanel() {
  const m = ui.mode, c = st.castles[m.from], f = me();
  const col = colorOf(st.playerFid);
  const err = sendValidation();
  const t = m.target != null ? st.castles[m.target] : null;
  const leaving = c.squads.length - m.ids.length;
  return `<h2>Muster at ${esc(c.name)}</h2>
    <div class="sub">Pick squads and a leader, then tap a glowing castle. Armies leave at dawn.</div>
    <h3>Squads (${m.ids.length} picked)</h3>
    <div class="reserve">${c.squads.map((s) => squadCard(s, col, `pick ${m.ids.includes(s.id) ? 'on' : ''}`).replace('data-act="sq"', 'data-act="pick"')).join('')}</div>
    <h3>Leader</h3>
    <div class="segs">
      <button class="${!m.wiz ? 'on' : ''}" data-act="wiz" data-w="">None</button>
      <button class="${m.wiz === 'wiz' ? 'on' : ''}" data-act="wiz" data-w="wiz" ${f.wizards < 1 ? 'disabled' : ''}>🧙 Wizard (${f.wizards})</button>
      <button class="${m.wiz === 'king' ? 'on' : ''}" data-act="wiz" data-w="king" ${!(f.kingAlive && f.kingHome) ? 'disabled' : ''}>👑 King</button>
    </div>
    ${m.wiz === 'king' ? '<div class="warn" style="margin-top:4px">👑 +15% army damage and stronger healing. If this army is wiped out, the King dies and the game ends.</div>' : ''}
    ${m.wiz === 'wiz' ? '<div class="sub" style="margin-top:4px">🧙 Heals your squads in battle. Lost if the army is wiped out.</div>' : ''}
    <h3>Destination</h3>
    <div>${t ? `<b style="color:${colorOf(t.owner)}">${esc(t.name)}</b> · ${nameOf(t.owner)} · ${plural(roadDays(st, c.id, t.id, st.playerFid), 'day')} march` : '<span class="sub">Tap a glowing castle on the map ↑</span>'}</div>
    ${leaving === 0 && m.ids.length ? '<div class="warn">⚠ This leaves the castle with no garrison.</div>' : ''}
    <div class="btns"><button class="primary" data-act="confirmsend" ${err ? 'disabled' : ''}>Send army</button><button data-act="cancelsend">Cancel</button></div>
    ${err ? `<div class="msg warn">${err}</div>` : ''}`;
}
function renderSheet() {
  const el = $('#sheet');
  const key = JSON.stringify([ui.sel, ui.armySel, ui.mode && ui.mode.kind]);
  const keep = key === renderSheet._key ? el.scrollTop : 0;
  renderSheet._key = key;
  let html;
  if (ui.mode && ui.mode.kind === 'send') html = sendPanel();
  else if (ui.armySel != null && st.armies.find((a) => a.id === ui.armySel)) html = armyPanel(st.armies.find((a) => a.id === ui.armySel));
  else if (ui.sel != null) { ui.armySel = null; const c = st.castles[ui.sel]; html = c.owner === st.playerFid ? ownCastlePanel(c) : otherCastlePanel(c); }
  else { ui.armySel = null; ui.edit = null; html = newsPanel(); }
  el.innerHTML = html;
  el.scrollTop = keep;
}
function renderActions() {
  $('#actionbar').innerHTML = `<button data-act="chronicle">📜 Chronicle</button><button class="primary" data-act="endnight">End night ▶</button>`;
}
function render() { renderTop(); renderMap(); renderSheet(); renderActions(); }

// ---------------- squad editing ----------------
function editList() {
  if (!ui.edit) return null;
  if (ui.edit.kind === 'castle') return st.castles[ui.edit.id].squads;
  const a = st.armies.find((x) => x.id === ui.edit.id);
  return a ? a.squads : null;
}
function onSquad(id) {
  const list = editList();
  if (ui.edit && ui.edit.editable && ui.squadSel != null && ui.squadSel !== id && list && list.some((s) => s.id === ui.squadSel)) {
    const tgt = list.find((s) => s.id === id);
    if (tgt) {
      if (tgt.row == null) { // swapping with a reserve squad
        const a = list.find((s) => s.id === ui.squadSel);
        tgt.lane = a.lane; tgt.row = a.row; a.lane = null; a.row = null;
      } else moveSquad(list, ui.squadSel, tgt.lane, tgt.row);
      ui.squadSel = null; saveGame(st); renderSheet(); return;
    }
  }
  ui.squadSel = ui.squadSel === id ? null : id;
  renderSheet();
}
function onSlot(el) {
  if (!ui.edit || !ui.edit.editable || ui.squadSel == null) return;
  const list = editList();
  if (!list || !list.some((s) => s.id === ui.squadSel)) return;
  const lane = el.getAttribute('data-lane'), row = el.getAttribute('data-row');
  if (row === '') moveSquad(list, ui.squadSel, null, null);
  else moveSquad(list, ui.squadSel, +lane, +row);
  ui.squadSel = null; saveGame(st); renderSheet();
}

// ---------------- actions ----------------
function result(res) { ui.msg = res.msg; ui.msgBad = !res.ok; if (res.ok) saveGame(st); render(); }

function onCastleTap(id) {
  if (ui.mode && ui.mode.kind === 'send') {
    if (id === ui.mode.from) return;
    if (!sendTargets().includes(id)) { toast('No road from here to there.'); return; }
    ui.mode.target = id; render(); return;
  }
  ui.sel = id; ui.armySel = null; ui.squadSel = null; ui.msg = '';
  render();
}

const ACTS = {
  castle: (el) => onCastleTap(+el.getAttribute('data-id')),
  army: (el) => { if (ui.mode) return; ui.armySel = +el.getAttribute('data-id'); ui.squadSel = null; ui.msg = ''; render(); },
  selarmy: (el) => ACTS.army(el),
  bg: () => { if (ui.mode) return; ui.sel = null; ui.armySel = null; ui.squadSel = null; render(); },
  sq: (el) => onSquad(+el.getAttribute('data-id')),
  slot: (el) => onSlot(el),
  closepanel: () => { ui.armySel = null; ui.squadSel = null; render(); },
  chronicle: () => { ui.sel = null; ui.armySel = null; ui.mode = null; render(); },
  recruit: (el) => result(recruit(st, st.playerFid, ui.sel, el.getAttribute('data-type'))),
  repair: () => result(repair(st, st.playerFid, ui.sel)),
  upgrade: () => result(upgrade(st, st.playerFid, ui.sel)),
  trainwiz: () => result(trainWizard(st, st.playerFid, ui.sel)),
  cancelarmy: (el) => { const r = cancelArmy(st, st.playerFid, +el.getAttribute('data-id')); ui.armySel = null; result(r); },
  recall: (el) => result(recallArmy(st, st.playerFid, +el.getAttribute('data-id'))),
  send: () => {
    const c = st.castles[ui.sel], f = me();
    if (!c.squads.length) { ui.msg = 'No squads here to send.'; ui.msgBad = true; render(); return; }
    const slotted = c.squads.filter((s) => s.row != null);
    const keep = slotted.length >= 3 ? slotted.slice().sort((a, b) => a.hp - b.hp)[0].id : null;
    ui.mode = { kind: 'send', from: c.id, ids: slotted.filter((s) => s.id !== keep).map((s) => s.id), wiz: f.wizards > 0 ? 'wiz' : null, target: null };
    ui.squadSel = null; render();
  },
  pick: (el) => { const id = +el.getAttribute('data-id'); const m = ui.mode; m.ids = m.ids.includes(id) ? m.ids.filter((x) => x !== id) : [...m.ids, id]; renderSheet(); },
  wiz: (el) => { ui.mode.wiz = el.getAttribute('data-w') || null; renderSheet(); },
  cancelsend: () => { ui.mode = null; render(); },
  confirmsend: () => {
    const m = ui.mode;
    const r = sendArmy(st, st.playerFid, m.from, m.ids, m.wiz, m.target);
    if (r.ok) { ui.mode = null; toast(r.msg); }
    result(r);
  },
  endnight: () => doEndNight(),
  menu: () => showMenu(),
  closeov: () => { hideOverlay(); if (!st) showTitle(); },
  newgame: () => showFactionPick(),
  continue: () => { st = loadGame(); if (!st) return showTitle(); resetUi(); hideOverlay(); render(); },
  pickfaction: (el) => startGame(el.getAttribute('data-fid')),
  howto: () => showHowTo(),
  whatsnew: () => showWhatsNew(),
  totitle: () => { st = null; showTitle(); },
  abandon: (el) => {
    if (el.getAttribute('data-sure') !== '1') { el.setAttribute('data-sure', '1'); el.textContent = 'Tap again to abandon this game'; return; }
    clearSave(); st = null; showFactionPick();
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTS[el.getAttribute('data-act')];
  if (fn) { ev.stopPropagation(); fn(el); }
});

function resetUi() {
  ui = { sel: null, armySel: null, mode: null, squadSel: null, msg: '', msgBad: false, edit: null };
  const home = owned(st, st.playerFid)[0];
  if (home) ui.sel = home.id;
  decoCache = null;
}

// ---------------- screens ----------------
function titleArt() {
  return `<svg viewBox="-120 -90 240 150" width="260" height="160">${svgDefs()}
    <g transform="translate(-62 8) scale(0.8)">${castleSVG('forge', '#ff6b35', 2)}</g>
    <g transform="translate(62 8) scale(0.8)">${castleSVG('granary', '#7bd35a', 2)}</g>
    <g transform="translate(0 -6) scale(1.15)">${castleSVG('shrine', '#5ec8ff', 3)}</g></svg>`;
}
function showTitle() {
  const save = loadGame();
  const canContinue = save && !save.result && save.version === VERSION;
  showOverlay(`<div class="ov"><div class="title-logo"><h1>SERVER SIEGE</h1><div class="tl">THE DATA CENTERS ARE WAKING</div></div>
    <div class="title-art">${titleArt()}</div>
    <div class="menu">
      ${canContinue ? `<button class="primary" data-act="continue">Continue · Day ${save.day}<br><span class="sub" style="color:#ffd9c0">${nameOf(save.playerFid)}</span></button>` : ''}
      <button class="${canContinue ? '' : 'primary'}" data-act="newgame">New game</button>
      <button data-act="howto">How to play</button>
      <button data-act="whatsnew">What's new</button>
    </div>
    ${save && !canContinue && !save.result ? '<div class="ver">An old save from a previous version was found; it may not load correctly.</div>' : ''}
    <div class="ver">${VERSION}</div></div>`);
}
function showFactionPick() {
  showOverlay(`<div class="ov"><h2 style="text-align:center;font-size:24px">Choose your faction</h2>
    <div class="sub" style="text-align:center">The other four are run by bots with their own personalities.</div>
    ${FACTIONS.map((f) => `<div class="fcard" style="--fc:${f.color}" data-act="pickfaction" data-fid="${f.id}">
      <h2>${f.name}</h2><div class="sub">Bot style: ${f.style} · Starts with a ${CASTLE_TYPES[f.start].name}</div>
      <div class="pp good">✓ ${f.perk}</div><div class="pp bad">✗ ${f.con}</div></div>`).join('')}
    <button data-act="closeov">Back</button></div>`);
}
function startGame(fid) {
  st = newGame(fid);
  saveGame(st);
  resetUi(); hideOverlay(); render();
  toast('Night 1. Recruit, then muster an army and pick a target.');
}
function showMenu() {
  showOverlay(`<div class="ov"><h2 style="text-align:center">Menu</h2><div class="menu">
    <button class="primary" data-act="closeov">Resume</button>
    <button data-act="howto">How to play</button>
    <button data-act="whatsnew">What's new</button>
    <button data-act="totitle">Title screen</button>
    <button data-act="abandon">Abandon game</button></div><div class="ver">${VERSION} · autosaves every night</div></div>`);
}
function showHowTo() {
  showOverlay(`<div class="ov"><div class="card prose"><h2>How to play</h2>
    <p><b>Goal.</b> Hold ${MAJORITY}+ of the 15 castles for ${DOMINION_DAYS} nights in a row (Dominion), or be the last faction standing. While someone holds the majority, everyone else's income drains.</p>
    <p><b>Each day:</b> 🌙 <b>Night</b> you give orders → 🌅 <b>Morning</b> armies march (road pips = days) → ⚔ <b>Evening</b> battles happen at castles. You watch your own battles; the rest show up in the Chronicle.</p>
    <p><b>Attacking needs a wizard</b> (or the King) to break a castle's wards. Wizards train at Shrines. If an army is wiped out, its wizard dies. If the King dies, you lose.</p>
    <p><b>Battles:</b> 3 lanes × 2 rows. Front-row fighters hit their own lane; back-row fighters step up when the front opens. Ranged shoot over the front line. <b>Melee beats Ranged beats Anti-melee beats Melee.</b> Siege smashes towers and the core but can't fire from the front row.</p>
    <p><b>Outcomes:</b> <b>Routed</b> = core destroyed, castle captured. <b>Breached</b> = wards down for 2 nights (weaker towers, no repairs) — hit it again! <b>Repelled</b> = the attack failed. An army still standing at nightfall keeps up the siege.</p>
    <p><b>Economy:</b> 🌾 food feeds troops (hunger makes them desert), 🪙 gold recruits, 🔮 mana patches and upgrades guardians and trains wizards. Granaries, Forges and Shrines each recruit different troops. More castles = higher squad limit.</p>
    <p><b>Neutral castles</b> are guarded by Old Sentinels — tougher the farther they sit from the factions. Capture one and its guardian system becomes yours, damaged.</p>
    </div><button class="primary" data-act="closeov">Got it</button></div>`);
}
function showWhatsNew() {
  showOverlay(`<div class="ov"><div class="card prose"><h2>What's new</h2>
    ${CHANGELOG.map((c) => `<h3>${c.v}</h3><ul>${c.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`).join('')}
    </div><button class="primary" data-act="closeov">Close</button></div>`);
}

// ---------------- end of night, battles, report ----------------
function doEndNight() {
  if (st.result) return showResult();
  ui.mode = null;
  const day = st.day;
  const reports = endNight(st);
  saveGame(st);
  const mine = reports.filter((r) => r.involves && r.battle);
  let i = 0;
  const next = () => {
    if (i < mine.length) { showBattle(mine[i++], next); return; }
    showReport(day, reports);
  };
  next();
}

const OUT_TXT = { routed: 'ROUTED', breached: 'BREACHED', repelled: 'REPELLED' };
function showBattle(rep, next) {
  const b = rep.battle, init = b.init;
  const attC = colorOf(rep.attFid), defC = colorOf(rep.defFid);
  const youAtt = rep.attFid === st.playerFid;
  const cell = (side, row, lane) => `<div class="bv-cell" id="bc-${side}-${row}-${lane}"></div>`;
  const rowHtml = (side, row) => `<div class="bv-row">${[0, 1, 2].map((l) => cell(side, row, l)).join('')}</div>`;
  showOverlay(`<div class="bv">
    <div class="bv-head"><span style="color:${attC}">${nameOf(rep.attFid)}</span> ⚔ <span style="color:${defC}">${esc(rep.castleName)}</span>
      <div class="vs">${youAtt ? 'You attack' : 'You defend'} · defenders on top · ${nameOf(rep.defFid)}</div></div>
    <div class="bv-field" id="bvf">
      <div class="bv-core" id="bv-core">${ICON.core}<span>CORE</span>${bar(init.core.hp / init.core.maxHp, 'core')}</div>
      <div class="bv-row">${init.towers.map((t, i) => `<div class="bv-cell"><div class="tw ${t.hp <= 0 ? 'dead' : ''}" id="bv-${t.id}"><div class="row">${ICON.tower}<span>Tower ${'LMR'[i]}</span></div>${bar(t.hp / t.maxHp)}</div></div>`).join('')}</div>
      ${rowHtml('D', 1)}${rowHtml('D', 0)}<div class="bv-mid"></div>${rowHtml('A', 0)}${rowHtml('A', 1)}
      <div class="bv-wiz" id="bv-wiz">${init.wiz ? `${ICON[init.wiz]}<span>${init.wiz === 'king' ? 'The King' : 'Wizard'} supports the attack</span>` : ''}</div>
    </div>
    <div class="bv-ctl"><div class="segs" id="bv-speed"><button data-sp="1" class="on">1×</button><button data-sp="2">2×</button><button data-sp="3">4×</button></div>
      <button id="bv-skip">Skip ⏭</button><span class="t" id="bv-t">0s</span></div></div>`);
  // cards
  const els = init.ents.map((e) => {
    const d = document.createElement('div');
    const col = e.side === 'A' ? attC : defC;
    d.className = 'sq'; d.style.setProperty('--sqc', col);
    d.innerHTML = `<div class="top">${ICON[e.type]}<span>${UNITS[e.type].short}</span><span class="n">×${Math.ceil(e.hp / UNITS[e.type].hp)}</span></div>${bar(e.hp / e.maxHp)}<span class="stun"></span>`;
    const p = e.p;
    document.getElementById(`bc-${e.side}-${p % 2}-${Math.floor(p / 2)}`).appendChild(d);
    return d;
  });
  const idx = {}; init.ents.forEach((e, i) => { idx[e.id] = i; });
  const pos = init.ents.map((e) => e.p);
  const dead = init.ents.map(() => false);
  let fi = 0, speed = 1, timer = null, finished = false;
  const ms = () => [0, 170, 85, 40][speed];
  const elFor = (id) => (idx[id] != null ? els[idx[id]] : document.getElementById(id === 'core' ? 'bv-core' : `bv-${id}`));
  function floatAt(el, txt, cls) {
    if (!el) return;
    const host = el.parentElement && el.parentElement.classList.contains('bv-cell') ? el.parentElement : el;
    const s = document.createElement('span'); s.className = `fl ${cls}`; s.textContent = txt;
    host.appendChild(s); setTimeout(() => s.remove(), 900);
  }
  function setBar(el, r) { const i = el && el.querySelector('.bar > i'); if (!i) return; r = Math.max(0, Math.min(1, r)); i.style.width = (r * 100).toFixed(1) + '%'; i.parentElement.classList.toggle('low', r < 0.35); }
  function apply(fr, fx) {
    fr.h.forEach((hp, i) => {
      const e = init.ents[i], el = els[i];
      if (dead[i]) return;
      if (fr.p[i] !== pos[i]) {
        pos[i] = fr.p[i];
        const c = document.getElementById(`bc-${e.side}-${pos[i] % 2}-${Math.floor(pos[i] / 2)}`);
        if (c) c.appendChild(el);
      }
      setBar(el, hp / e.maxHp);
      el.querySelector('.n').textContent = '×' + Math.ceil(hp / UNITS[e.type].hp);
      el.querySelector('.stun').textContent = fr.st[i] ? '⚡' : '';
      if (hp <= 0) { dead[i] = true; el.classList.add('dead'); el.querySelector('.n').textContent = '✝'; setTimeout(() => el.remove(), fx ? 650 : 0); }
    });
    fr.tw.forEach((hp, i) => { const el = document.getElementById(`bv-t${i}`); setBar(el, hp / init.towers[i].maxHp); if (hp <= 0) el.classList.add('dead'); });
    setBar(document.getElementById('bv-core'), fr.c / init.core.maxHp);
    if (!fx) return;
    const agg = {};
    for (const ev of fr.ev) {
      if (ev.k === 'hit') {
        const a = agg[ev.t] || (agg[ev.t] = { d: 0, c: -1 }); a.d += ev.d; a.c = Math.max(a.c, ev.c);
        const ae = elFor(ev.a); if (ae) { ae.classList.add('atk'); setTimeout(() => ae.classList.remove('atk'), 140); }
      } else if (ev.k === 'heal') {
        floatAt(elFor(ev.t), '+' + ev.d, 'heal');
        const w = document.getElementById('bv-wiz'); w.classList.add('cast'); setTimeout(() => w.classList.remove('cast'), 300);
      }
    }
    for (const [t, a] of Object.entries(agg)) {
      const el = elFor(t);
      if (el && el.classList.contains('sq')) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
      floatAt(el, '-' + a.d, a.c > 0 ? 'crit' : (a.c < 0 ? 'weak' : ''));
    }
    document.getElementById('bv-t').textContent = Math.floor((fi + 1) / 2) + 's';
  }
  function step() {
    if (finished) return;
    if (fi >= b.frames.length) return finish();
    apply(b.frames[fi], true); fi++;
    timer = setTimeout(step, ms());
  }
  function finish() {
    if (finished) return; finished = true; clearTimeout(timer);
    if (fi < b.frames.length) { apply(b.frames[b.frames.length - 1], false); }
    const won = (rep.outcome === 'routed') === youAtt;
    let line = '';
    if (rep.outcome === 'routed') line = youAtt ? `${esc(rep.castleName)} is yours!` : `${esc(rep.castleName)} has fallen.`;
    else if (rep.outcome === 'breached') line = 'The wards are down for 2 nights — the castle is vulnerable.';
    else line = youAtt ? 'The defences held.' : 'The attack was beaten back.';
    let fate = '';
    if (rep.reason === 'timeout' && rep.outcome !== 'routed') fate = youAtt ? 'Night falls — your army holds the siege and attacks again tomorrow.' : 'Night falls — the enemy keeps up the siege.';
    if (rep.reason === 'retreat') fate = youAtt ? 'Your army falls back home.' : 'The attackers fall back.';
    if (b.attWiped) fate = youAtt ? (rep.wiz === 'king' ? '💀 Your army was wiped out. The King has fallen.' : `Your army was wiped out${rep.wiz ? ' — and your wizard with it' : ''}.` ) : 'The attacking army was wiped out!';
    const lostYou = youAtt ? rep.attLost : rep.defLost, lostThem = youAtt ? rep.defLost : rep.attLost;
    const end = document.createElement('div');
    end.className = 'bv-end';
    end.innerHTML = `<div class="card"><div class="outcome ${rep.outcome}">${OUT_TXT[rep.outcome]}</div>
      <div>${line}</div><div class="sub" style="margin-top:6px">${fate}</div>
      <div style="margin-top:8px;font-family:var(--font-mono)">You lost ${lostYou} · They lost ${lostThem}</div>
      <div class="btns" style="justify-content:center"><button class="${won ? 'primary' : ''}" id="bv-next">Continue ▶</button></div></div>`;
    document.getElementById('bvf').appendChild(end);
    document.getElementById('bv-next').onclick = () => next();
  }
  document.getElementById('bv-skip').onclick = () => finish();
  document.querySelectorAll('#bv-speed button').forEach((bt) => {
    bt.onclick = () => { speed = +bt.getAttribute('data-sp'); document.querySelectorAll('#bv-speed button').forEach((x) => x.classList.toggle('on', x === bt)); };
  });
  setTimeout(step, 700);
}

function showReport(day, reports) {
  const f = me(), inc = f.lastIncome;
  const today = st.news.filter((n) => n.day === day);
  const battles = reports.length ? reports.map((r) => {
    const you = r.attFid === st.playerFid || r.defFid === st.playerFid;
    return `<li class="${you ? 'big' : ''}" style="--nc:${colorOf(r.attFid)}"><span style="color:${colorOf(r.attFid)}">${nameOf(r.attFid)}</span> → ${esc(r.castleName)} <span style="color:${colorOf(r.defFid)}">(${nameOf(r.defFid)})</span>: <b class="outcome ${r.outcome}" style="font-size:13px">${OUT_TXT[r.outcome]}</b></li>`;
  }).join('') : '<li>A quiet evening. No battles.</li>';
  const other = today.filter((n) => !/ROUTED|BREACHED|repelled|wiped out/.test(n.text));
  showOverlay(`<div class="ov"><h2 style="text-align:center;font-size:24px">Evening of day ${day}</h2>
    <div class="card"><h3 style="margin-top:0">Battles</h3><ul class="news">${battles}</ul></div>
    ${other.length ? `<div class="card"><h3 style="margin-top:0">News</h3><ul class="news">${other.map(newsItem).join('')}</ul></div>` : ''}
    ${inc ? `<div class="card"><h3 style="margin-top:0">Night ${st.day} begins</h3>
      <div style="font-family:var(--font-mono)">🌾 ${sgn(inc.foodGross)} − ${inc.upkeep} upkeep = ${sgn(inc.food)} · 🪙 ${sgn(inc.gold)} · 🔮 ${sgn(inc.mana)}</div>
      ${inc.drain < 1 ? `<div class="bad">Dominion drain: income ×${inc.drain.toFixed(2)}</div>` : ''}</div>` : ''}
    <button class="primary" data-act="${st.result ? 'showresult' : 'closereport'}">${st.result ? 'The war is decided ▶' : 'To the war table ▶'}</button></div>`);
}
ACTS.closereport = () => { hideOverlay(); if (ui.sel != null && !st.castles[ui.sel]) ui.sel = null; ui.armySel = null; ui.squadSel = null; ui.msg = ''; render(); };
ACTS.showresult = () => showResult();

function showResult() {
  const r = st.result;
  const counts = FACTIONS.map((f) => `<li style="--nc:${f.color}"><span style="color:${f.color}">${f.name}</span>: ${owned(st, f.id).length} castles${st.factions[f.id].alive ? '' : ' (gone)'}</li>`).join('');
  showOverlay(`<div class="ov"><div class="title-logo"><h1 style="font-size:38px;color:${r.win ? '#ffd54a' : '#ff6b5a'}">${r.win ? 'VICTORY' : 'DEFEAT'}</h1>
    <div class="tl">DAY ${st.day}</div></div>
    <div class="card" style="text-align:center;font-size:16px">${esc(r.text)}</div>
    <div class="card"><ul class="news">${counts}</ul></div>
    <div class="menu"><button class="primary" data-act="newgame">New game</button><button data-act="totitle">Title screen</button></div></div>`);
}

// ---------------- boot ----------------
showTitle();
