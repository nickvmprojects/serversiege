// Server Siege — hand-drawn SVG icons (32x32, use currentColor)
const S = (inner, extra = '') => `<svg viewBox="0 0 32 32" class="ico" ${extra} fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICON = {
  sword: S('<path d="M7 25 L23 9"/><path d="M23 9 L26 6"/><path d="M10 18 L14 22" stroke-width="3"/><path d="M5 27 L8 24"/>'),
  bow: S('<path d="M11 4 Q28 16 11 28"/><path d="M11 4 L11 28" stroke-width="1.2"/><path d="M5 16 L25 16"/><path d="M25 16 L21 13 M25 16 L21 19"/>'),
  pike: S('<path d="M16 30 L16 9"/><path d="M16 2 L20.5 10 L11.5 10 Z" fill="currentColor"/><path d="M12 22 L20 22" stroke-width="1.6"/>'),
  knight: S('<path d="M8 28 V15 Q8 4 16 4 Q24 4 24 15 V28 Z" fill="currentColor" fill-opacity="0.25"/><path d="M11 15 H21" stroke-width="3"/><path d="M16 4 V9"/>'),
  halberd: S('<path d="M11 30 L11 4"/><path d="M11 6 Q23 7 22 17 Q17 14 11 14" fill="currentColor" fill-opacity="0.3"/><path d="M25 19 L21 24 H25 L21 29" stroke="#ffe14d"/>'),
  ballista: S('<path d="M4 13 Q16 3 28 13"/><path d="M16 7 L16 23"/><path d="M6 18 L26 18"/><circle cx="9" cy="26" r="3"/><circle cx="23" cy="26" r="3"/>'),
  sentinel: S('<rect x="7" y="5" width="18" height="16" rx="3" fill="currentColor" fill-opacity="0.2"/><circle cx="16" cy="13" r="3.2" fill="#5ff2ff" stroke="none"/><path d="M11 21 V28 M21 21 V28"/>'),
  wiz: S('<path d="M6 27 H26 L18 4 Q15 12 11 16 Z" fill="currentColor" fill-opacity="0.25"/><path d="M15 19 l1 -2 1 2 2 0.5 -2 1 -1 2 -1 -2 -2 -1 z" fill="#ffe14d" stroke="none"/>'),
  king: S('<path d="M5 24 L7 9 L12 16 L16 6 L20 16 L25 9 L27 24 Z" fill="#ffd54a" fill-opacity="0.35" stroke="#ffd54a"/><path d="M5 27 H27" stroke="#ffd54a"/>'),
  tower: S('<path d="M9 30 V12 H7 V5 H11 V8 H14 V5 H18 V8 H21 V5 H25 V12 H23 V30 Z" fill="currentColor" fill-opacity="0.2"/><path d="M14 30 V23 Q16 20 18 23 V30"/>'),
  core: S('<rect x="9" y="9" width="14" height="14" transform="rotate(45 16 16)" fill="#3ff0ff" fill-opacity="0.25" stroke="#3ff0ff"/><circle cx="16" cy="16" r="2.5" fill="#3ff0ff" stroke="none"/>'),
  skull: S('<path d="M8 15 Q8 5 16 5 Q24 5 24 15 V21 H8 Z"/><circle cx="12.5" cy="14" r="2" fill="currentColor"/><circle cx="19.5" cy="14" r="2" fill="currentColor"/><path d="M12 21 V26 M16 21 V26 M20 21 V26"/>'),
  swords: S('<path d="M6 6 L22 22 M26 6 L10 22"/><path d="M19 25 L25 19 M7 19 L13 25"/>'),
  granary: S('<path d="M16 28 V10"/><ellipse cx="13" cy="12" rx="2.5" ry="4" transform="rotate(-25 13 12)" fill="currentColor"/><ellipse cx="19" cy="12" rx="2.5" ry="4" transform="rotate(25 19 12)" fill="currentColor"/><ellipse cx="13" cy="19" rx="2.5" ry="4" transform="rotate(-25 13 19)" fill="currentColor"/><ellipse cx="19" cy="19" rx="2.5" ry="4" transform="rotate(25 19 19)" fill="currentColor"/>'),
  forge: S('<path d="M5 13 H25 Q25 18 19 18 V22 H23 V26 H9 V22 H13 V18 Q8 18 5 13 Z" fill="currentColor" fill-opacity="0.3"/><path d="M22 4 L18 9 L22 9 L18 13" stroke="#ffb347"/>'),
  shrine: S('<rect x="9" y="9" width="14" height="14" transform="rotate(45 16 16)" fill="currentColor" fill-opacity="0.25"/><path d="M16 1 V6 M16 26 V31 M1 16 H6 M26 16 H31"/><circle cx="16" cy="16" r="3" fill="currentColor"/>'),
};

export const TYPE_COLOR = { granary: '#e8c45a', forge: '#ff7a3a', shrine: '#3ff0ff' };

// Castle drawing for the map, centred on 0,0 (map units)
export function castleSVG(type, ownerColor, lvl) {
  const glow = TYPE_COLOR[type];
  const wall = '#1b212c', edge = '#3b4456';
  const pips = Array.from({ length: lvl }, (_, i) => `<circle cx="${-10 + i * 10}" cy="30" r="3.2" fill="${ownerColor}"/>`).join('');
  let emblem = '';
  if (type === 'shrine') emblem = `<rect x="-7" y="-1" width="14" height="14" transform="rotate(45 0 6)" fill="${glow}" opacity="0.9"/><circle cx="0" cy="6" r="3" fill="#0b1a20"/>`;
  if (type === 'granary') emblem = `<path d="M0 14 V-2" stroke="${glow}" stroke-width="2.5"/><ellipse cx="-4" cy="2" rx="3" ry="5" transform="rotate(-25 -4 2)" fill="${glow}"/><ellipse cx="4" cy="2" rx="3" ry="5" transform="rotate(25 4 2)" fill="${glow}"/><ellipse cx="-4" cy="9" rx="3" ry="5" transform="rotate(-25 -4 9)" fill="${glow}"/><ellipse cx="4" cy="9" rx="3" ry="5" transform="rotate(25 4 9)" fill="${glow}"/>`;
  if (type === 'forge') emblem = `<path d="M-10 1 H10 Q10 6 5 6 V9 H8 V13 H-8 V9 H-5 V6 Q-9 6 -10 1 Z" fill="${glow}"/>`;
  return `
    <circle r="54" fill="url(#glow-${type})"/>
    <rect x="-40" y="-30" width="17" height="50" fill="${wall}" stroke="${edge}" stroke-width="2.5"/>
    <rect x="23" y="-30" width="17" height="50" fill="${wall}" stroke="${edge}" stroke-width="2.5"/>
    <path d="M-40 -30 v-6 h5 v6 m3 0 v-6 h5 v6 M23 -30 v-6 h5 v6 m3 0 v-6 h5 v6" fill="${wall}" stroke="${edge}" stroke-width="2"/>
    <rect x="-27" y="-14" width="54" height="34" fill="${wall}" stroke="${edge}" stroke-width="2.5"/>
    <path d="M-27 -14 v-6 h7 v6 m6 0 v-6 h7 v6 m6 0 v-6 h7 v6 m6 0 v-6 h7 v6" fill="${wall}" stroke="${edge}" stroke-width="2"/>
    <g>${emblem}</g>
    <path d="M0 -20 V-52" stroke="#9aa3b5" stroke-width="2.5"/>
    <path d="M0 -52 L24 -46 L0 -39 Z" fill="${ownerColor}" stroke="#0a0d12" stroke-width="1.5"/>
    ${pips}`;
}
