// arc icon board: every launcher icon candidate, drawn as inline SVG. Loaded by index.html.
const SETS = [];
(() => {

const C = { cream:'#e6e2db', paper:'#f4f2ee', navy:'#1f2558', orange:'#ff4c00', crimson:'#8e1d42', blue:'#5096b8', black:'#0b0b0e', khaki:'#e3d49a', plate:'#d7d8d4', edge:'#c6c2b9', salmon:'#e9b9a6', mist:'#bccdd3', mint:'#b8d0c3', pink:'#e3b3be', navyDim:'#3a4170' };

function cog() {
  let s = `<circle cx="256" cy="256" r="128" fill="none" stroke="${C.blue}" stroke-width="40"/><circle cx="256" cy="256" r="80" fill="${C.black}"/>`;
  for (let k = 0; k < 6; k++) s += `<rect x="-12" y="-82" width="24" height="28" fill="${C.cream}" transform="translate(256 256) rotate(${k*60+18})"/>`;
  return s + `<circle cx="256" cy="256" r="17" fill="${C.orange}"/>`;
}
function pads() {
  let s = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const x = 169 + c*62, y = 138 + r*62;
    const fill = (r===1 && c===2) ? C.orange : (r===3 && c===0) ? C.khaki : C.paper;
    const edge = (r===1 && c===2) ? '#c23a00' : (r===3 && c===0) ? '#a8995c' : '#0f1333';
    s += `<rect x="${x}" y="${y+4}" width="50" height="50" rx="10" fill="${edge}"/><rect x="${x}" y="${y}" width="50" height="50" rx="10" fill="${fill}"/>`;
  }
  return s;
}

const V = [
  { l:'A', n:'Reel', bg:C.cream, d:'The LOAD reel from the PO app: a black cog in a blue ring, with the orange signal at the hub. Reads as tape, storage, archive.', s: cog() },
  { l:'B', n:'Dial', bg:C.navy, d:'A TE knob with a progress arc, three quarters full. The name read as a shape, and a nod to the transfer meter.',
    s:`<path d="M172.6 339.4 A118 118 0 1 1 358.2 197" fill="none" stroke="${C.orange}" stroke-width="56"/>
       <path d="M358.2 197 A118 118 0 0 1 339.4 339.4" fill="none" stroke="${C.navyDim}" stroke-width="56"/>
       <circle cx="256" cy="256" r="48" fill="${C.paper}"/>
       <line x1="264.7" y1="251" x2="291" y2="235.8" stroke="${C.navy}" stroke-width="12" stroke-linecap="round"/>` },
  { l:'C', n:'Reels', bg:C.crimson, d:'The RECORD WITH CAMERA tile turned into a tape machine: two reels, a deck below, one orange record light.',
    s:`<circle cx="184" cy="222" r="72" fill="${C.paper}"/><circle cx="328" cy="222" r="72" fill="${C.paper}"/>
       <circle cx="184" cy="222" r="16" fill="${C.crimson}"/><circle cx="328" cy="222" r="16" fill="${C.crimson}"/>
       <rect x="160" y="316" width="192" height="46" rx="8" fill="${C.paper}"/>
       <rect x="318" y="329" width="20" height="20" rx="3" fill="${C.orange}"/>` },
  { l:'D', n:'Wordmark', bg:C.paper, d:'Lowercase arc drawn from circles and stems, like TE type, ending in the orange record dot.',
    s:`<g fill="none" stroke="${C.navy}" stroke-width="24">
         <circle cx="160" cy="256" r="36"/><line x1="196" y1="208" x2="196" y2="304"/>
         <line x1="236" y1="208" x2="236" y2="304"/><path d="M236 258 A46 46 0 0 1 282 212"/>
         <path d="M353.5 230.5 A36 36 0 1 0 353.5 281.5"/>
       </g><circle cx="386" cy="292" r="13" fill="${C.orange}"/>` },
  { l:'E', n:'Pads', bg:C.navy, d:'The EP-133 keypad, 3 by 4, on navy, with one orange key lit and one khaki key. Unmistakably for K.O. II owners.', s: pads() },
  { l:'F', n:'Tag', bg:C.navy, d:'The khaki EDIT tag recast as a library label: a hole for the string and two written lines.',
    s:`<path d="M134 196 H326 L392 256 L326 316 H134 A14 14 0 0 1 120 302 V210 A14 14 0 0 1 134 196 Z" fill="${C.khaki}"/>
       <circle cx="160" cy="256" r="15" fill="${C.navy}"/>
       <rect x="200" y="232" width="112" height="16" rx="3" fill="${C.navy}"/>
       <rect x="200" y="264" width="72" height="16" rx="3" fill="${C.navy}"/>` },
  { l:'G', n:'Loop', bg:C.orange, d:'Backup and restore as one gesture: a cream loop arrow around a navy hub, on the full signal orange.',
    s:`<path d="M317.7 182.5 A96 96 0 1 1 194.3 182.5" fill="none" stroke="${C.paper}" stroke-width="36"/>
       <path d="M222 160 L170 152 L200 210 Z" fill="${C.paper}"/>
       <circle cx="256" cy="256" r="34" fill="${C.navy}"/>` },
  { l:'H', n:'Quadrants', bg:C.mint, d:'The FX pad screen as a Bauhaus print: four pastel fields and an orange disc where the tracks meet.',
    s:`<rect x="0" y="0" width="236" height="290" fill="${C.salmon}"/><rect x="236" y="0" width="276" height="290" fill="${C.mist}"/>
       <rect x="0" y="290" width="356" height="222" fill="${C.mint}"/><rect x="356" y="290" width="156" height="222" fill="${C.pink}"/>
       <circle cx="236" cy="290" r="62" fill="${C.orange}"/><circle cx="332" cy="186" r="16" fill="${C.navy}"/>` },
  { l:'—', n:'Current', bg:'#dedcd6', cur:true, d:'Today’s icon, for comparison: display, segment row and two keys.',
    s:`<rect x="96" y="96" width="320" height="140" rx="28" fill="#262823"/>
       ${[0,1,2,3].map(i=>`<rect x="${128+i*32}" y="146" width="22" height="40" rx="4" fill="#e9e7df"/>`).join('')}
       ${[4,5,6,7].map(i=>`<rect x="${128+i*32}" y="146" width="22" height="40" rx="4" fill="#3a3d36"/>`).join('')}
       <rect x="96" y="276" width="146" height="140" rx="28" fill="#f3f2ee"/><rect x="270" y="276" width="146" height="140" rx="28" fill="#ff4c00"/>` },
];

// The visible launcher area is the middle 72dp of a 108dp layer: 85..427 in 512 units.
const svg = v => `<svg viewBox="85.3 85.3 341.4 341.4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="512" height="512" fill="${v.bg}"/>${v.s}</svg>`;

V.forEach((v,k)=>{ if (!v.cur) v.l = 'ABCDEFGH'[k]; });
SETS.push({ id:'r1', title:'Round 1', blurb:'First sweep across the PO app’s vocabulary.', mono:false, items: V.map(v => ({ l:v.l, n:v.n, d:v.d, cur:!!v.cur, html: m => svg(v, m) })) });
})();
(() => {

const C = { cream:'#e6e2db', paper:'#f4f2ee', navy:'#1f2558', orange:'#ff4c00', black:'#0b0b0e', salmon:'#ebb8a4', khaki:'#e3d49a', edge:'#c6c2b9', green:'#17613f', mint:'#9cc1ae' };
const rad = d => d * Math.PI / 180;
const pt = (r, a) => [256 + r * Math.cos(rad(a)), 256 + r * Math.sin(rad(a))].map(n => +n.toFixed(1));

// Arc of radius r and stroke w from angle a0 sweeping `sweep` degrees (dir 1 = clockwise), with an arrowhead at the end.
function loop(col, { r = 96, w = 36, a0 = -50, sweep = 280, dir = 1, head = 1.05, len = 1.25, cap = 'butt' } = {}) {
  const a1 = a0 + dir * sweep;
  const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
  const arc = `<path d="M${x0} ${y0} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} ${dir > 0 ? 1 : 0} ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="${cap}"/>`;
  const t = rad(a1), tx = -Math.sin(t) * dir, ty = Math.cos(t) * dir, nx = Math.cos(t), ny = Math.sin(t);
  const hw = w * head, hl = w * len;
  const p = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const tri = `<path d="M${p(x1 + nx * hw, y1 + ny * hw)} L${p(x1 + tx * hl, y1 + ty * hl)} L${p(x1 - nx * hw, y1 - ny * hw)} Z" fill="${col}"/>`;
  return arc + tri;
}

function cog(k, cut, r = 46) {
  let s = `<circle cx="256" cy="256" r="${r}" fill="${k}"/>`;
  for (let i = 0; i < 6; i++) s += `<rect x="-8" y="${-r - 2}" width="16" height="18" fill="${cut}" transform="translate(256 256) rotate(${i * 60 + 18})"/>`;
  return s + `<circle cx="256" cy="256" r="9" fill="${cut}"/>`;
}

// Each variant draws from roles: bg, ring, hub, cut (a cut-out in the background colour). Themed icons collapse ring and hub to one ink.
const seg = (x, y, on, c) => {
  const S = { t:[8,0,48,14], m:[8,48,48,14], b:[8,96,48,14], ul:[0,8,14,42], ur:[50,8,14,42], ll:[0,60,14,42], lr:[50,60,14,42] };
  return Object.entries(S).map(([k, [dx, dy, w, h]]) => `<rect x="${x+dx}" y="${y+dy}" width="${w}" height="${h}" rx="3" fill="${on.includes(k) ? c.a : c.dim}"/>`).join('');
};
const bars = c => [44, 96, 150, 112, 190, 132, 72, 116, 52].map((h, i) =>
  `<rect x="${256 + (i-4)*26 - 7}" y="${256 - h/2}" width="14" height="${h}" rx="7" fill="${i === 4 ? c.b : c.a}"/>`).join('');

const V = [
  { l:'1', n:'Arch', d:'The name taken literally: a cream arch on a navy base, on full signal orange. Bauhaus, readable at any size.',
    c:{ bg:C.orange, a:C.paper, b:C.navy },
    s: c => `<path d="M136 304 A120 120 0 0 1 376 304 H316 A60 60 0 0 0 196 304 Z" fill="${c.a}"/><rect x="136" y="318" width="240" height="24" rx="4" fill="${c.b}"/>` },
  { l:'2', n:'Cartridge', d:'A .pak as a physical thing: a cream cartridge with an orange label and a shutter. Save, but in TE’s language.',
    c:{ bg:C.navy, a:C.paper, b:C.orange, cut:C.navy },
    s: c => `<path d="M180 150 H318 L346 178 V348 A14 14 0 0 1 332 362 H180 A14 14 0 0 1 166 348 V164 A14 14 0 0 1 180 150 Z" fill="${c.a}"/>
             <rect x="190" y="176" width="128" height="78" rx="6" fill="${c.d}"/>
             <rect x="206" y="288" width="100" height="56" rx="5" fill="${c.cut}"/><rect x="278" y="298" width="18" height="36" rx="3" fill="${c.a}"/>` },
  { l:'3', n:'Stack', d:'Three backups on a shelf, newest on top in navy. Each has its status light, like the rows in the library.',
    c:{ bg:C.orange, a:C.paper, b:C.navy, dot:C.orange },
    s: c => [0,1,2].map(i => { const top = i === 0, y = 166 + i*64;
             return `<rect x="156" y="${y}" width="200" height="50" rx="12" fill="${top ? c.b : c.a}"/><circle cx="326" cy="${y+25}" r="9" fill="${top ? (c.dot ?? c.bg) : c.d}"/>`; }).join('') },
  { l:'4', n:'Wave', d:'A sample’s waveform in cream on navy, with the loudest bar lit orange. Says sounds, not files.',
    c:{ bg:C.navy, a:C.paper, b:C.orange },
    s: c => bars(c) },
  { l:'5', n:'Display', d:'arc spelled on the EP-133’s segment display, unlit segments showing, with an orange decimal point.',
    c:{ bg:'#262823', a:'#e9e7df', b:C.orange, dim:'#3a3d36' },
    s: c => seg(138, 201, ['t','ul','ur','m','ll','lr'], c) + seg(224, 201, ['m','ll'], c) + seg(310, 201, ['t','ul','ll','b'], c) + `<rect x="380" y="297" width="14" height="14" rx="3" fill="${c.b}"/>` },
  { l:'6', n:'Plug', d:'The USB-C plug arc talks through. A cream plug with a navy tip on orange: connect, then back up.',
    c:{ bg:C.orange, a:C.paper, b:C.navy },
    s: c => `<rect x="222" y="140" width="68" height="70" rx="16" fill="${c.b}"/><rect x="238" y="162" width="36" height="12" rx="6" fill="${c.e}"/>
             <rect x="204" y="198" width="104" height="124" rx="20" fill="${c.a}"/><rect x="244" y="318" width="24" height="70" fill="${c.a}"/>
             <rect x="232" y="240" width="48" height="10" rx="5" fill="${c.d}"/>` },
  { l:'7', n:'Drawer', d:'The card catalogue: two library drawers with navy label holders and pulls. arc as the librarian it is.',
    c:{ bg:C.orange, a:C.paper, b:C.navy },
    s: c => [150, 262].map(y => `<rect x="146" y="${y}" width="220" height="100" rx="14" fill="${c.a}"/><rect x="221" y="${y+20}" width="70" height="30" rx="4" fill="none" stroke="${c.d}" stroke-width="8"/><rect x="231" y="${y+64}" width="50" height="14" rx="7" fill="${c.d}"/>`).join('') },
  { l:'8', n:'Bookmark', d:'A navy ribbon marking your place, with the orange record dot on it. Quiet, on the app’s cream.',
    c:{ bg:C.cream, a:C.navy, b:C.orange },
    s: c => `<path d="M196 130 H316 V382 L256 334 L196 382 Z" fill="${c.a}"/><circle cx="256" cy="204" r="28" fill="${c.b}"/>` },
];

const MONO = { bg:'#d8def7', ink:'#1d2a5a' };
const svg = (v, mono) => {
  const c = mono ? { bg:MONO.bg, a:MONO.ink, b:MONO.ink, d:MONO.bg, e:MONO.bg, cut:MONO.bg, dot:MONO.bg, dim:'#c2cae8' } : { cut:v.c.bg, dim:v.c.bg, d:v.c.b, e:v.c.a, ...v.c };
  return `<svg viewBox="85.3 85.3 341.4 341.4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="512" height="512" fill="${c.bg}"/>${v.s(c)}</svg>`;
};

V.forEach((v,k)=>{ if (!v.cur) v.l = 'IJKLMNOP'[k]; });
SETS.push({ id:'r2', title:'Round 2', blurb:'No loop arrows: one bold ground, one cream shape.', mono:true, items: V.map(v => ({ l:v.l, n:v.n, d:v.d, cur:!!v.cur, html: m => svg(v, m) })) });
})();
(() => {

const C = { cream:'#e6e2db', paper:'#f4f2ee', navy:'#1f2558', orange:'#ff4c00', black:'#0b0b0e', salmon:'#ebb8a4', khaki:'#e3d49a', edge:'#c6c2b9', green:'#17613f', mint:'#9cc1ae' };
const rad = d => d * Math.PI / 180;
const pt = (r, a) => [256 + r * Math.cos(rad(a)), 256 + r * Math.sin(rad(a))].map(n => +n.toFixed(1));

// Arc of radius r and stroke w from angle a0 sweeping `sweep` degrees (dir 1 = clockwise), with an arrowhead at the end.
function loop(col, { r = 96, w = 36, a0 = -50, sweep = 280, dir = 1, head = 1.05, len = 1.25, cap = 'butt' } = {}) {
  const a1 = a0 + dir * sweep;
  const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
  const arc = `<path d="M${x0} ${y0} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} ${dir > 0 ? 1 : 0} ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="${cap}"/>`;
  const t = rad(a1), tx = -Math.sin(t) * dir, ty = Math.cos(t) * dir, nx = Math.cos(t), ny = Math.sin(t);
  const hw = w * head, hl = w * len;
  const p = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const tri = `<path d="M${p(x1 + nx * hw, y1 + ny * hw)} L${p(x1 + tx * hl, y1 + ty * hl)} L${p(x1 - nx * hw, y1 - ny * hw)} Z" fill="${col}"/>`;
  return arc + tri;
}

function cog(k, cut, r = 46) {
  let s = `<circle cx="256" cy="256" r="${r}" fill="${k}"/>`;
  for (let i = 0; i < 6; i++) s += `<rect x="-8" y="${-r - 2}" width="16" height="18" fill="${cut}" transform="translate(256 256) rotate(${i * 60 + 18})"/>`;
  return s + `<circle cx="256" cy="256" r="9" fill="${cut}"/>`;
}

// Each variant draws from roles: bg, ring, hub, cut (a cut-out in the background colour). Themed icons collapse ring and hub to one ink.
const grille = c => { let o = '';
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { if (i*i + j*j > 11) continue;
    o += `<circle cx="${256 + j*38}" cy="${256 + i*38}" r="12" fill="${(i === -1 && j === 1) ? c.b : c.a}"/>`; }
  return o; };
const pixA = c => ['.###.', '....#', '.####', '#...#', '.####'].map((row, r) => [...row].map((p, k) =>
  `<rect x="${256 - 110 + k*44 + 3}" y="${256 - 110 + r*44 + 3}" width="38" height="38" rx="8" fill="${p === '#' ? c.a : c.dim}"/>`).join('')).join('');
const stripes = c => { let o = '';
  for (let x = -40; x < 560; x += 30) { if (x + 58 > 190 && x + 58 < 322) continue;
    o += `<path d="M${x} 306 L${x+16} 306 L${x+116} 206 L${x+100} 206 Z" fill="${c.a}"/>`; }
  return o + `<circle cx="256" cy="256" r="34" fill="${c.b}"/>`; };
const knob = c => { let o = `<circle cx="256" cy="256" r="118" fill="${c.a}"/>`;
  for (let k = 0; k < 28; k++) o += `<rect x="-5" y="-120" width="10" height="16" fill="${c.bg}" transform="translate(256 256) rotate(${k * 360/28})"/>`;
  return o + `<circle cx="256" cy="256" r="86" fill="${c.e}"/><line x1="276" y1="221.4" x2="294" y2="190.2" stroke="${c.d}" stroke-width="16" stroke-linecap="round"/>`; };

const V = [
  { l:'1', n:'Grille', d:'The EP-133 speaker holes as a round grid of navy dots, one of them lit orange. Pure TE.',
    c:{ bg:C.cream, a:C.navy, b:C.orange },
    s: grille },
  { l:'2', n:'Pixel a', d:'A lowercase a set in a 5×5 dot-matrix font, cream on orange, unlit cells showing faintly.',
    c:{ bg:C.orange, a:C.paper, dim:'#e84500' },
    s: pixA },
  { l:'3', n:'Fader', d:'A mixer fader with its scale: a navy slot and a cream cap, pushed a little above centre.',
    c:{ bg:C.orange, a:C.paper, b:C.navy },
    s: c => [150,184,218,252,286,320,354].map(y => `<rect x="152" y="${y}" width="${y === 252 ? 34 : 24}" height="6" rx="3" fill="${c.b}"/>`).join('')
             + `<rect x="244" y="120" width="24" height="272" rx="12" fill="${c.b}"/><rect x="196" y="206" width="120" height="60" rx="10" fill="${c.a}"/><rect x="208" y="232" width="96" height="8" rx="4" fill="${c.d}"/>` },
  { l:'4', n:'Cassette', d:'A cassette, the original backup. Cream shell, navy window with both reels, on signal orange.',
    c:{ bg:C.orange, a:C.paper, b:C.navy },
    s: c => `<rect x="136" y="172" width="240" height="164" rx="18" fill="${c.a}"/><rect x="170" y="206" width="172" height="64" rx="32" fill="${c.d}"/>
             <circle cx="206" cy="238" r="22" fill="${c.e}"/><circle cx="306" cy="238" r="22" fill="${c.e}"/>
             <circle cx="206" cy="238" r="8" fill="${c.d}"/><circle cx="306" cy="238" r="8" fill="${c.d}"/>
             <path d="M196 336 L212 300 H300 L316 336 Z" fill="${c.d}"/>` },
  { l:'5', n:'Track', d:'The green EMPTY TRACK stripes from the PO app, parted around an orange dot. A track, kept.',
    c:{ bg:C.cream, a:C.green, b:C.orange },
    s: stripes },
  { l:'6', n:'Knob', d:'A big knurled knob seen from above, with an orange pointer, on navy. Hardware you want to turn.',
    c:{ bg:C.navy, a:C.paper, b:C.orange, e:'#e6e2db' },
    s: knob },
  { l:'7', n:'Half', d:'A disc cut on the diagonal, navy over orange, like a two-state switch: on the device and on the phone.',
    c:{ bg:C.cream, a:C.navy, b:C.orange },
    s: c => `<path d="M171.1 340.9 A120 120 0 0 1 340.9 171.1 Z" fill="${c.a}"/><path d="M182.4 352.2 A120 120 0 0 0 352.2 182.4 Z" fill="${c.b}"/>` },
  { l:'8', n:'Sticker', d:'A K.O. starburst sticker in orange on navy with a cream centre. Loud, playful, very pocket operator.',
    c:{ bg:C.navy, a:C.orange, b:C.paper, d:C.navy },
    s: c => { const p = []; for (let k = 0; k < 32; k++) { const r = k % 2 ? 112 : 142, t = (k * 360/32 - 90) * Math.PI/180; p.push(`${(256 + r*Math.cos(t)).toFixed(1)} ${(256 + r*Math.sin(t)).toFixed(1)}`); }
      return `<path d="M${p.join(' L')} Z" fill="${c.a}"/><circle cx="256" cy="256" r="72" fill="${c.b}"/><circle cx="256" cy="256" r="22" fill="${c.d === c.b ? c.bg : c.d}"/>`; } },
];

const MONO = { bg:'#d8def7', ink:'#1d2a5a' };
const svg = (v, mono) => {
  const c = mono ? { bg:MONO.bg, a:MONO.ink, b:MONO.ink, d:MONO.bg, e:MONO.ink, dim:'#c2cae8' } : { dim:v.c.bg, d:v.c.b, e:v.c.a, ...v.c };
  return `<svg viewBox="85.3 85.3 341.4 341.4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="512" height="512" fill="${c.bg}"/>${v.s(c)}</svg>`;
};

V.forEach((v,k)=>{ if (!v.cur) v.l = 'QRSTUVWX'[k]; });
SETS.push({ id:'r3', title:'Round 3', blurb:'Drawn from the hardware itself.', mono:true, items: V.map(v => ({ l:v.l, n:v.n, d:v.d, cur:!!v.cur, html: m => svg(v, m) })) });
})();
(() => {

const C = { cream:'#e6e2db', paper:'#f4f2ee', navy:'#1f2558', orange:'#ff4c00', salmon:'#ebb8a4', edge:'#c6c2b9', vinyl:'#16171b' };
const rad = d => d * Math.PI / 180;
const at = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))].map(n => +n.toFixed(1));
// Clockwise arc from angle a0 to a1 (degrees) on a circle around (cx, cy).
const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = at(cx, cy, r, a0), [x1, y1] = at(cx, cy, r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
const wedge = (cx, cy, r, a0, a1) => `${arc(cx, cy, r, a0, a1)} L${cx} ${cy} Z`;

// Roles as in rounds 2 and 3: bg, a (main shape), b (accent), d (detail on a), e (second fill), cut (gap in the background colour), dim (faint).
// edge/edge2 are key undersides, dropped in the themed icon; v.m overrides the themed roles where an item needs it.
const meter = c => { let o = '';
  for (let k = 0; k <= 12; k++) { const a = -150 + k * 10, [x0, y0] = at(256, 316, 118, a), [x1, y1] = at(256, 316, k % 2 ? 136 : 150, a);
    o += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${k >= 9 ? c.b : c.a}" stroke-width="10" stroke-linecap="round"/>`; }
  const [nx, ny] = at(256, 316, 146, -72);
  return o + `<path d="${arc(256, 316, 104, -150, -30)}" fill="none" stroke="${c.a}" stroke-width="6"/>`
    + `<path d="${arc(256, 316, 104, -60, -30)}" fill="none" stroke="${c.b}" stroke-width="14"/>`
    + `<line x1="256" y1="316" x2="${nx}" y2="${ny}" stroke="${c.a}" stroke-width="12" stroke-linecap="round"/>`
    + `<circle cx="256" cy="316" r="26" fill="${c.a}"/><circle cx="256" cy="316" r="9" fill="${c.d}"/>`; };

const V = [
  { n:'Sleeve', d:'The K.O. II ships in a 10-inch EP box. A navy sleeve with a black record sliding out, orange label showing: the library as a record collection.',
    c:{ bg:C.cream, a:C.navy, e:C.vinyl, d:C.orange, dim:'#34353b' },
    s: c => `<circle cx="322" cy="214" r="70" fill="${c.e}"/><circle cx="322" cy="214" r="52" fill="none" stroke="${c.dim}" stroke-width="4"/>
             <circle cx="322" cy="214" r="24" fill="${c.d}"/><circle cx="322" cy="214" r="5" fill="${c.e}"/>
             <rect x="138" y="192" width="156" height="156" rx="10" fill="${c.a}" stroke="${c.cut}" stroke-width="16" paint-order="stroke"/>
             <rect x="158" y="316" width="56" height="14" rx="4" fill="${c.d}"/>` },
  { n:'Glove', d:'K.O. means knockout, and the PO-33 that started the name is drawn as a boxing match. A cream glove with a navy cuff, on signal orange.',
    c:{ bg:C.orange, a:C.paper, b:C.navy, d:C.paper },
    s: c => `<g transform="rotate(-12 256 256)"><rect x="178" y="128" width="166" height="180" rx="80" fill="${c.a}"/>
             <path d="M210 212 Q262 196 318 208" fill="none" stroke="${c.dim}" stroke-width="10" stroke-linecap="round"/>
             <ellipse cx="190" cy="254" rx="40" ry="52" fill="${c.a}" stroke="${c.cut}" stroke-width="12" paint-order="stroke"/>
             <rect x="196" y="300" width="132" height="72" rx="14" fill="${c.b}" stroke="${c.cut}" stroke-width="12" paint-order="stroke"/>
             <rect x="254" y="314" width="16" height="44" rx="8" fill="${c.d}"/></g>` },
  { n:'Punch card', d:'Punch-in FX as an old punch card: twelve slots for the twelve pads, the one you hit lit orange.',
    c:{ bg:C.navy, a:C.paper, dim:C.orange },
    s: c => { let o = `<path d="M162 176 H374 A12 12 0 0 1 386 188 V324 A12 12 0 0 1 374 336 H138 A12 12 0 0 1 126 324 V212 Z" fill="${c.a}"/>`;
             for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++)
               o += `<rect x="${167 + k * 52}" y="${199 + r * 42}" width="22" height="30" rx="5" fill="${r === 1 && k === 2 ? c.dim : c.cut}"/>`;
             return o; } },
  { n:'Elbow', d:'Reviewers keep comparing the display to Star Trek’s LCARS. A fat orange elbow with its data pills: an arc that turns a corner.',
    c:{ bg:C.navy, a:C.paper, b:C.orange, e:C.salmon },
    s: c => `<path d="M132 340 V260 A110 110 0 0 1 242 150 H350 A23 23 0 0 1 350 196 H230 A30 30 0 0 0 200 226 V340 Z" fill="${c.b}"/>
             <rect x="132" y="290" width="68" height="10" fill="${c.cut}"/>
             <rect x="226" y="222" width="124" height="40" rx="20" fill="${c.a}"/>
             <rect x="226" y="278" width="84" height="40" rx="20" fill="${c.e}"/><rect x="322" y="278" width="28" height="40" rx="10" fill="${c.b}"/>` },
  { n:'Meter', d:'A VU meter: a navy needle across a scale of ticks, the last four in the orange. Levels you read at a glance.',
    c:{ bg:C.cream, a:C.navy, b:C.orange },
    s: meter },
  { n:'Press', d:'The pads are pressure-sensitive, with aftertouch. One cream pad with the press rippling out from it, a navy dot where the finger lands.',
    c:{ bg:C.orange, a:C.paper, d:C.navy },
    s: c => [[126, 76, .25, 6], [150, 58, .45, 7], [174, 40, .7, 8]].map(([p, r, o, w]) =>
             `<rect x="${p}" y="${p}" width="${512 - 2 * p}" height="${512 - 2 * p}" rx="${r}" fill="none" stroke="${c.a}" stroke-opacity="${o}" stroke-width="${w}"/>`).join('')
             + `<rect x="200" y="200" width="112" height="112" rx="24" fill="${c.a}"/><circle cx="256" cy="256" r="20" fill="${c.d}"/>` },
  { n:'Groups', d:'The four group keys, A to D, set as a diamond with A lit. Reads like the buttons on a handheld game.',
    c:{ bg:C.cream, a:C.navy, b:C.orange, edge:'#0f1333', edge2:'#c23a00' },
    s: c => [[256, 168], [344, 256], [256, 344], [168, 256]].map(([x, y], k) =>
             `<circle cx="${x}" cy="${y + 8}" r="46" fill="${k ? c.edge : c.edge2}"/><circle cx="${x}" cy="${y}" r="46" fill="${k ? c.a : c.b}"/>`).join('')
             + `<circle cx="256" cy="168" r="14" fill="${c.d}"/>` },
  { n:'Slice', d:'Live sample slicing: a disc cut in four, one piece pulled out in navy. A sound, chopped and kept.',
    c:{ bg:C.orange, a:C.paper, b:C.navy },
    s: c => [0, 90, 180, 270].map(a0 => { const out = a0 === 270, cx = out ? 268 : 250, cy = out ? 244 : 262;
             return `<path d="${wedge(cx, cy, 110, a0, a0 + 90)}" fill="${out ? c.b : c.a}" stroke="${c.cut}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/>`; }).join('') },
];

const MONO = { bg:'#d8def7', ink:'#1d2a5a' };
const OFF = { edge:'transparent', edge2:'transparent', sh:'transparent', hi:'transparent' };
const svg = (v, mono) => {
  const c = mono ? { bg:MONO.bg, a:MONO.ink, b:MONO.ink, d:MONO.bg, e:MONO.ink, cut:MONO.bg, dim:'#c2cae8', ...OFF, ...v.m }
                 : { cut:v.c.bg, dim:v.c.bg, d:v.c.b, e:v.c.a, ...OFF, ...v.c };
  return `<svg viewBox="85.3 85.3 341.4 341.4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="512" height="512" fill="${c.bg}"/>${v.s(c)}</svg>`;
};

const TAGS = 'Y Z AA AB AC AD AE AF'.split(' ');
V.forEach((v, k) => { v.l = TAGS[k]; });
SETS.push({ id:'r4', title:'Round 4', blurb:'Hardware and the box, from the research.', mono:true, items: V.map(v => ({ l:v.l, n:v.n, d:v.d, cur:!!v.cur, html: m => svg(v, m) })) });
})();
(() => {

const C = { cream:'#e6e2db', paper:'#f4f2ee', navy:'#1f2558', orange:'#ff4c00', edge:'#c6c2b9', navyDim:'#3a4170' };
const rad = d => d * Math.PI / 180;
const at = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))].map(n => +n.toFixed(1));
const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = at(cx, cy, r, a0), [x1, y1] = at(cx, cy, r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };

// Material 3 Expressive's cookie: a circle whose radius swings n times around.
const cookie = (n, r, amp) => { const p = [];
  for (let k = 0; k < 180; k++) { const t = k * 2 * Math.PI / 180, rr = r + amp * Math.cos(n * t);
    p.push(`${(256 + rr * Math.cos(t - Math.PI / 2)).toFixed(1)} ${(256 + rr * Math.sin(t - Math.PI / 2)).toFixed(1)}`); }
  return `M${p.join(' L')} Z`; };
// Wavy ring like M3's CircularWavyProgressIndicator, starting at a0 and sweeping clockwise.
const wavy = (r, amp, n, a0, sweep) => { const p = [], steps = 240;
  for (let k = 0; k <= steps; k++) { const t = rad(a0 + sweep * k / steps), rr = r + amp * Math.sin(n * (t - rad(a0)));
    p.push(`${(256 + rr * Math.cos(t)).toFixed(1)} ${(256 + rr * Math.sin(t)).toFixed(1)}`); }
  return `M${p.join(' L')}`; };

const V = [
  { n:'Keycap', d:'Tactile 3D, one of 2026’s big icon trends, done the flat TE way: one orange key with its side, a soft shadow and a printed dot.',
    c:{ bg:C.cream, b:C.orange, side:'#c23a00', sh:'rgba(31,37,88,.10)', hi:'#ff7a3d', d:C.paper },
    m:{ side:'rgba(29,42,90,.45)' },
    s: c => `<rect x="170" y="196" width="184" height="150" rx="34" fill="${c.sh}"/><rect x="164" y="186" width="184" height="156" rx="34" fill="${c.sh}"/>
             <rect x="176" y="184" width="160" height="148" rx="30" fill="${c.side}"/><rect x="176" y="158" width="160" height="148" rx="30" fill="${c.b}"/>
             <rect x="200" y="170" width="112" height="10" rx="5" fill="${c.hi}"/><circle cx="256" cy="232" r="14" fill="${c.d}"/>` },
  { n:'Buddy', d:'Mascots are back. The K.O. key as a character: two eyes, a small smile and orange cheeks.',
    c:{ bg:C.orange, a:C.paper, d:C.navy, dim:C.orange, edge:C.edge },
    s: c => `<rect x="156" y="166" width="200" height="200" rx="48" fill="${c.edge}"/><rect x="156" y="150" width="200" height="200" rx="48" fill="${c.a}"/>
             <ellipse cx="222" cy="236" rx="14" ry="21" fill="${c.d}"/><ellipse cx="290" cy="236" rx="14" ry="21" fill="${c.d}"/>
             <circle cx="196" cy="282" r="15" fill="${c.dim}"/><circle cx="316" cy="282" r="15" fill="${c.dim}"/>
             <path d="M236 284 Q256 302 276 284" fill="none" stroke="${c.d}" stroke-width="9" stroke-linecap="round"/>` },
  { n:'Monogram', d:'Type as the mark: one heavy geometric a with an oversized bowl, its counter filled orange like the record dot.',
    c:{ bg:C.cream, a:C.navy, d:C.orange },
    s: c => `<rect x="296" y="166" width="58" height="192" rx="12" fill="${c.a}"/><circle cx="240" cy="262" r="96" fill="${c.a}"/><circle cx="240" cy="262" r="40" fill="${c.d}"/>` },
  { n:'Cookie', d:'Material 3 Expressive’s nine-sided cookie, framing an orange K.O. key. Looks native next to Google’s own icons.',
    c:{ bg:C.navy, a:C.paper, b:C.orange, edge2:'#c23a00' },
    s: c => `<path d="${cookie(9, 118, 10)}" fill="${c.a}"/>
             <rect x="210" y="216" width="92" height="92" rx="22" fill="${c.edge2}"/><rect x="210" y="204" width="92" height="92" rx="22" fill="${c.d}"/>` },
  { n:'Capsule', d:'M3’s pill shape as a time capsule: navy and orange halves, tilted. Your sounds, sealed for later.',
    c:{ bg:C.cream, a:C.navy, b:C.orange, hi:'rgba(255,255,255,.35)' },
    s: c => `<g transform="rotate(-45 256 256)"><path d="M252 200 H182 A56 56 0 0 0 182 312 H252 Z" fill="${c.a}"/>
             <path d="M260 200 H330 A56 56 0 0 1 330 312 H260 Z" fill="${c.b}"/><rect x="172" y="220" width="56" height="14" rx="7" fill="${c.hi}"/></g>` },
  { n:'Dot', d:'One symbol, one accent: a cream ring with the orange record dot riding on it. As minimal as the board gets.',
    c:{ bg:C.navy, a:C.paper, b:C.orange },
    s: c => { const [x, y] = at(256, 256, 96, -45);
             return `<circle cx="256" cy="256" r="96" fill="none" stroke="${c.a}" stroke-width="40"/><circle cx="${x}" cy="${y}" r="34" fill="${c.b}" stroke="${c.cut}" stroke-width="14" paint-order="stroke"/>`; } },
  { n:'Morph', d:'M3 Expressive shapes morph into each other. Here a cream key turns into a navy half disc: the device becoming the dot.',
    c:{ bg:C.orange, a:C.paper, b:C.navy },
    s: c => `<path d="M266 160 H174 A28 28 0 0 0 146 188 V324 A28 28 0 0 0 174 352 H266 Z" fill="${c.a}"/><path d="M274 160 A96 96 0 0 1 274 352 Z" fill="${c.b}"/>` },
  { n:'Wavy', d:'The wavy progress ring from Material 3 Expressive, three quarters done, in signal orange. A backup in progress.',
    c:{ bg:C.navy, b:C.orange, dim:C.navyDim },
    s: c => `<path d="${arc(256, 256, 110, 196, 254)}" fill="none" stroke="${c.dim}" stroke-width="14" stroke-linecap="round"/>
             <path d="${wavy(110, 8, 10, -90, 270)}" fill="none" stroke="${c.b}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>` },
];

const MONO = { bg:'#d8def7', ink:'#1d2a5a' };
const OFF = { edge:'transparent', edge2:'transparent', sh:'transparent', hi:'transparent' };
const svg = (v, mono) => {
  const c = mono ? { bg:MONO.bg, a:MONO.ink, b:MONO.ink, d:MONO.bg, e:MONO.ink, cut:MONO.bg, dim:'#c2cae8', ...OFF, ...v.m }
                 : { cut:v.c.bg, dim:v.c.bg, d:v.c.b, e:v.c.a, ...OFF, ...v.c };
  return `<svg viewBox="85.3 85.3 341.4 341.4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="512" height="512" fill="${c.bg}"/>${v.s(c)}</svg>`;
};

const TAGS = 'AG AH AI AJ AK AL AM AN'.split(' ');
V.forEach((v, k) => { v.l = TAGS[k]; });
SETS.push({ id:'r5', title:'Round 5', blurb:'Pulled from 2026 icon trends.', mono:true, items: V.map(v => ({ l:v.l, n:v.n, d:v.d, cur:!!v.cur, html: m => svg(v, m) })) });
})();

let starred = [];
try { starred = JSON.parse(localStorage.getItem('arc-stars') || '[]'); } catch (e) {}
const save = () => { try { localStorage.setItem('arc-stars', JSON.stringify(starred)); } catch (e) {} };
const key = (s, v) => s.id + ':' + v.l;
const cell = (s, v) => `
    <div class="cell${v.cur ? ' current' : ''}">
      <div class="ic">${v.html()}</div>
      <div class="cap"><span class="tag">${v.l}</span><span class="name">${v.n}</span></div>
      <button class="star" type="button" data-k="${key(s, v)}" aria-pressed="false" aria-label="Star ${v.l} ${v.n}">Star</button>
    </div>`;
const ITEMS = SETS.flatMap(s => s.items.map(v => ({ s, v }))).sort((a, b) => a.v.cur - b.v.cur);
document.getElementById('overview').innerHTML = `<div class="ov">${ITEMS.map(({ s, v }) => cell(s, v)).join('')}</div>`;
const TABS = ['overview', 'details'];
function show(t) {
  TABS.forEach(x => { document.getElementById(x).hidden = x !== t; document.getElementById('tab-' + x).setAttribute('aria-selected', x === t); });
  try { localStorage.setItem('arc-tab', t); } catch (e) {}
}
document.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => show(b.id.slice(4))));
let first = 'overview';
try { first = localStorage.getItem('arc-tab') || first; } catch (e) {}
if (location.hash === '#details' || location.hash === '#overview') first = location.hash.slice(1);
show(TABS.includes(first) ? first : 'overview');
document.getElementById('sets').innerHTML = `<div class="grid">${ITEMS.map(({ s, v }) => `
    <article class="card${v.cur ? ' current' : ''}">
      <div class="head"><span class="tag">${v.l}</span><span class="name">${v.n}</span>
        <button class="star" type="button" data-k="${key(s, v)}" aria-pressed="false" aria-label="Star ${v.l} ${v.n}">Star</button></div>
      <div class="big" role="img" aria-label="${v.n} icon">${v.html()}</div>
      <p>${v.d}</p>
      <div class="walls">${['a','b'].map(w => `<div class="wall ${w}"><div class="ic circle">${v.html()}</div><div class="ic squircle">${v.html()}</div><div class="ic tiny">${v.html()}</div>${s.mono ? `<div class="ic mono">${v.html(true)}</div>` : ''}</div>`).join('')}</div>
    </article>`).join('')}</div>`;
const all = Object.fromEntries(SETS.flatMap(s => s.items.map(v => [key(s, v), v])));
function render() {
  document.querySelectorAll('.star').forEach(b => { const on = starred.includes(b.dataset.k); b.setAttribute('aria-pressed', on); b.textContent = on ? 'Starred' : 'Star'; });
  const list = starred.filter(k => all[k]);
  document.getElementById('short').innerHTML = list.length
    ? list.map(k => `<div class="pick"><div class="ic">${all[k].html()}</div>${all[k].l} · ${all[k].n}</div>`).join('')
    : '<p class="empty">Nothing starred yet. Tap Star on any card below.</p>';
}
document.addEventListener('click', e => { const b = e.target.closest('.star'); if (!b) return;
  const k = b.dataset.k; starred = starred.includes(k) ? starred.filter(x => x !== k) : [...starred, k]; save(); render(); });
render();
