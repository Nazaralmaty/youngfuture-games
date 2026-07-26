/* ============================================================
   00 · ЯДРО: константы, математика, шум
   ============================================================ */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/* --- Мир --- */
const TILE = 32;          // размер тайла в мировых единицах
const VIEW_H = 360;       // виртуальная высота кадра (ширина зависит от экрана)
const VIEW_W_MIN = 460;   // узкий телефон в портрете
const VIEW_W_MAX = 780;   // широкий ноутбук / айпад в ландшафте
const GRAVITY = 1900;
const FIXED_DT = 1 / 60;

/* --- Математика --- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));

/* Кадронезависимое сглаживание: чем больше stiff, тем быстрее догоняет */
const damp = (a, b, stiff, dt) => lerp(a, b, 1 - Math.exp(-stiff * dt));

/* Кратчайший угловой переход (чтобы кости не крутились «в обход») */
function angLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
const angDamp = (a, b, stiff, dt) => angLerp(a, b, 1 - Math.exp(-stiff * dt));

/* --- Сглаживания --- */
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/* --- Случайность --- */
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

/* Детерминированный генератор — для текстур, чтобы они были одинаковы при перезапуске */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/* --- Значимый шум (для текстур камня, земли, гор) --- */
function makeNoise(seed) {
  const rng = makeRng(seed);
  const P = new Uint8Array(512);
  const perm = [];
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };

  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = P[P[X] + Y], ab = P[P[X] + Y + 1];
    const ba = P[P[X + 1] + Y], bb = P[P[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return (lerp(x1, x2, v) + 1) * 0.5; // 0..1
  }

  function fbm(x, y, oct = 4, gain = 0.5, lac = 2) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += a * noise2(x * f, y * f);
      norm += a;
      a *= gain; f *= lac;
    }
    return sum / norm;
  }

  return { noise2, fbm, rng };
}

/* --- Геометрия --- */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

/* --- Цвет --- */
function rgba(r, g, b, a = 1) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/* --- Оффскрин-холст (для запечённых текстур) --- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
