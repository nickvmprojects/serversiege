// Server Siege — random map generation (pure logic)
import { CASTLE_NAMES } from './data.js';

export const MAP_W = 1100, MAP_H = 1000;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function segCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  if (p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4) return false;
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// Returns { nodes: [{x,y,name}], roads: [{a,b,days}], starts: [nodeIdx x count], tiers: [per node] }
export function generateMap(rng, count = 15, factionCount = 5) {
  const margin = 85;
  let nodes = [];
  let minD = 225;
  let tries = 0;
  while (nodes.length < count) {
    const p = { x: margin + 35 + rng() * (MAP_W - 2 * margin - 70), y: margin + rng() * (MAP_H - 2 * margin) };
    if (nodes.every(n => dist(n, p) >= minD)) nodes.push(p);
    if (++tries > 4000) { tries = 0; minD -= 15; nodes = []; }
  }
  const names = rng.shuffle([...CASTLE_NAMES]);
  nodes.forEach((n, i) => { n.name = names[i]; });

  // Euclidean MST (Prim) guarantees connectivity without crossings
  const edges = [];
  const inTree = new Set([0]);
  while (inTree.size < nodes.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < nodes.length; j++) {
      if (inTree.has(j)) continue;
      const d = dist(nodes[i], nodes[j]);
      if (!best || d < best.d) best = { a: i, b: j, d };
    }
    edges.push(best); inTree.add(best.b);
  }
  const has = (a, b) => edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const crosses = (a, b) => edges.some(e => segCross(nodes[a], nodes[b], nodes[e.a], nodes[e.b]));
  const degree = (i) => edges.filter(e => e.a === i || e.b === i).length;
  // extra roads: nearest neighbours, no crossings, so the map has loops and choices
  for (let i = 0; i < nodes.length; i++) {
    const near = nodes.map((n, j) => ({ j, d: dist(nodes[i], n) })).filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 4);
    for (const { j, d } of near) {
      if (degree(i) >= 3) break;
      if (degree(j) >= 4 || has(i, j) || d > 420 || crosses(i, j)) continue;
      edges.push({ a: i, b: j, d });
    }
  }
  const roads = edges.map(e => ({ a: e.a, b: e.b, days: e.d < 280 ? 1 : (e.d < 380 ? 2 : 3) }));

  // faction starts: farthest-point sampling by road distance
  const graphDist = (src) => {
    const D = nodes.map(() => Infinity); D[src] = 0;
    const q = [src];
    while (q.length) {
      q.sort((a, b) => D[a] - D[b]);
      const u = q.shift();
      for (const r of roads) {
        const v = r.a === u ? r.b : (r.b === u ? r.a : -1);
        if (v < 0) continue;
        if (D[u] + r.days < D[v]) { D[v] = D[u] + r.days; q.push(v); }
      }
    }
    return D;
  };
  const allD = nodes.map((_, i) => graphDist(i));
  const starts = [Math.floor(rng() * nodes.length)];
  while (starts.length < factionCount) {
    let best = -1, bestScore = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (starts.includes(i)) continue;
      const s = Math.min(...starts.map(st => allD[st][i])) + rng() * 0.5;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    starts.push(best);
  }
  // neutral tiers: farther from any start = tougher guardians
  const tiers = nodes.map((_, i) => {
    if (starts.includes(i)) return 1;
    const d = Math.min(...starts.map(st => allD[st][i]));
    return d <= 1 ? 1 : (d <= 3 ? 2 : 3);
  });
  return { nodes, roads, starts: rng.shuffle(starts), tiers };
}
