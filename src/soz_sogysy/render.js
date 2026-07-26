/* ============================================================
   Сөз Соғысы — слой отрисовки на Canvas 2D.
   Заменяет статичные PNG/SVG: юниты собраны из костей и
   анимируются процедурно, фоны и текстуры рисуются кодом.
   Внешних файлов нет ни одного.
   Игровая логика не трогается — War получает состояние в draw().
   ============================================================ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2, DEG = Math.PI / 180;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rnd = function (a, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); };

  function angLerp(a, b, t) {
    var d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return a + d * t;
  }
  function angDamp(a, b, stiff, dt) { return angLerp(a, b, 1 - Math.exp(-stiff * dt)); }

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function makeNoise(seed) {
    var rng = makeRng(seed), perm = [], P = new Uint8Array(512), i, j, t;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < 512; i++) P[i] = perm[i & 255];
    function fade(x) { return x * x * x * (x * (x * 6 - 15) + 10); }
    function grad(h, x, y) { return (h & 1 ? -x : x) + (h & 2 ? -y : y); }
    function noise2(x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      var xf = x - Math.floor(x), yf = y - Math.floor(y);
      var u = fade(xf), v = fade(yf);
      var aa = P[P[X] + Y], ab = P[P[X] + Y + 1], ba = P[P[X + 1] + Y], bb = P[P[X + 1] + Y + 1];
      var x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
      var x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
      return (lerp(x1, x2, v) + 1) * 0.5;
    }
    function fbm(x, y, oct) {
      var a = 0.5, f = 1, sum = 0, norm = 0;
      oct = oct || 4;
      for (var k = 0; k < oct; k++) { sum += a * noise2(x * f, y * f); norm += a; a *= 0.5; f *= 2; }
      return sum / norm;
    }
    return { noise2: noise2, fbm: fbm, rng: rng };
  }
  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /* ---------------- КОСТИ ---------------- */
  function Bone(d) {
    this.name = d.name; this.parent = d.parent || null;
    this.len = d.len; this.w0 = d.w0; this.w1 = d.w1;
    this.attach = d.attach === undefined ? 1 : d.attach;
    this.angle = (d.a === undefined ? 90 : d.a) * DEG;
    this.stiff = d.stiff || 20;
    this.x = this.y = this.ex = this.ey = 0;
  }
  Bone.prototype.at = function (t) {
    return { x: this.x + (this.ex - this.x) * t, y: this.y + (this.ey - this.y) * t };
  };
  function Skeleton(defs) {
    this.bones = []; this.map = {};
    for (var i = 0; i < defs.length; i++) {
      var b = new Bone(defs[i]);
      this.bones.push(b); this.map[b.name] = b;
    }
  }
  Skeleton.prototype.b = function (n) { return this.map[n]; };
  Skeleton.prototype.pose = function (target, dt, mul) {
    mul = mul || 1;
    for (var k in target) {
      var bone = this.map[k];
      if (bone) bone.angle = angDamp(bone.angle, target[k] * DEG, bone.stiff * mul, dt);
    }
  };
  Skeleton.prototype.solve = function (rx, ry) {
    this.rootX = rx; this.rootY = ry;
    for (var i = 0; i < this.bones.length; i++) {
      var b = this.bones[i], bx = rx, by = ry;
      if (b.parent) { var p = this.map[b.parent].at(b.attach); bx = p.x; by = p.y; }
      b.x = bx; b.y = by;
      b.ex = bx + Math.cos(b.angle) * b.len;
      b.ey = by + Math.sin(b.angle) * b.len;
    }
  };

  /* Конусная капсула с градиентом поперёк кости */
  function limb(ctx, x1, y1, x2, y2, w1, w2, col, colD, outline) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 0.0001;
    var nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
    ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
    ctx.arc(x2, y2, w2, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
    ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
    ctx.arc(x1, y1, w1, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
    ctx.closePath();
    if (colD && colD !== col) {
      var g = ctx.createLinearGradient(x1 + nx * w1, y1 + ny * w1, x1 - nx * w1, y1 - ny * w1);
      g.addColorStop(0, col); g.addColorStop(0.55, col); g.addColorStop(1, colD);
      ctx.fillStyle = g;
    } else ctx.fillStyle = col;
    ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function joint(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function shadowUnder(ctx, x, y, w, a) {
    ctx.save(); ctx.globalAlpha = a;
    var g = ctx.createRadialGradient(x, y, 0, x, y, w);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.3, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------------- ПАЛИТРЫ И СНАРЯЖЕНИЕ ПО ДЭУІР ---------------- */
  var PAL = {
    stone: { skin: '#e8b47c', skinD: '#b8834f', cloth: '#a87c4a', clothD: '#6b4b26',
      metal: '#9b9284', metalD: '#6d675c', hair: '#2b2119', accent: '#c96a3a', eye: '#1b1410' },
    egypt: { skin: '#d8a06a', skinD: '#a97648', cloth: '#c9a227', clothD: '#8a6b12',
      metal: '#c9b072', metalD: '#8f7a3f', hair: '#241a12', accent: '#a33b2a', eye: '#1b1410' },
    medieval: { skin: '#e0b189', skinD: '#b0855f', cloth: '#3b5ba9', clothD: '#25406f',
      metal: '#c2cadb', metalD: '#7c8699', hair: '#3a2a1c', accent: '#c9302c', eye: '#1b1410' },
    industrial: { skin: '#e0aa7e', skinD: '#ab7c54', cloth: '#8a9a5e', clothD: '#4f5a33',
      metal: '#98a0ad', metalD: '#5f6672', hair: '#2c2118', accent: '#d08a1e', eye: '#1b1410' },
    future: { skin: '#e6c3a0', skinD: '#b8977a', cloth: '#e3ebf7', clothD: '#93a4bd',
      metal: '#b9c6d8', metalD: '#6d7b90', hair: '#1c1c26', accent: '#21d4fd', eye: '#0b2230' }
  };

  /* arch: humanoid | beast | machine · weapon: club|sling|spear|bow|sword|rifle|grenade|laser */
  var GEAR = {
    stone: { a: { w: 'club', sc: 0.86 }, b: { w: 'sling', sc: 0.9 }, c: { w: 'spear', sc: 1.0, shield: 1 },
      d: { arch: 'beast', sc: 1.7 } },
    egypt: { a: { w: 'sword', sc: 0.9, hat: 1 }, b: { w: 'bow', sc: 0.94, hat: 1 },
      c: { w: 'spear', sc: 1.05, shield: 1, hat: 1 }, d: { w: 'club', sc: 1.42, heavy: 1, wrap: 1 } },
    medieval: { a: { w: 'sword', sc: 0.92, helm: 1 }, b: { w: 'bow', sc: 0.94 },
      c: { w: 'sword', sc: 1.08, shield: 1, helm: 2, armor: 1 }, d: { arch: 'machine', kind: 'catapult', sc: 1.5 } },
    industrial: { a: { w: 'club', sc: 0.92, helm: 1 }, b: { w: 'rifle', sc: 0.96, helm: 1 },
      c: { w: 'grenade', sc: 1.04, helm: 1 }, d: { arch: 'machine', kind: 'tank', sc: 1.5 } },
    future: { a: { w: 'sword', sc: 0.94, visor: 1, armor: 1 }, b: { w: 'laser', sc: 0.98, visor: 1, armor: 1 },
      c: { w: 'laser', sc: 1.1, visor: 1, armor: 1, shield: 1 }, d: { arch: 'machine', kind: 'mech', sc: 1.5 } }
  };
  function gearOf(eraKey, tier) {
    var e = GEAR[eraKey] || GEAR.stone;
    return e[tier] || e.a;
  }

  /* ---------------- СКЕЛЕТЫ ---------------- */
  function humanoidSkeleton() {
    return new Skeleton([
      { name: 'pelvis', parent: null, len: 1, w0: 0, w1: 0, a: -90, stiff: 24 },
      { name: 'torso', parent: 'pelvis', attach: 1, len: 15, w0: 7, w1: 5.4, a: -90, stiff: 17 },
      { name: 'neck', parent: 'torso', attach: 1, len: 4, w0: 3, w1: 2.8, a: -90, stiff: 15 },
      { name: 'head', parent: 'neck', attach: 1, len: 8, w0: 0, w1: 0, a: -90, stiff: 14 },
      { name: 'armBU', parent: 'torso', attach: 0.84, len: 11, w0: 3.2, w1: 2.6, a: 100, stiff: 19 },
      { name: 'armBF', parent: 'armBU', attach: 1, len: 10, w0: 2.6, w1: 2.1, a: 105, stiff: 21 },
      { name: 'armFU', parent: 'torso', attach: 0.84, len: 11, w0: 3.3, w1: 2.7, a: 80, stiff: 19 },
      { name: 'armFF', parent: 'armFU', attach: 1, len: 10, w0: 2.7, w1: 2.2, a: 85, stiff: 23 },
      { name: 'thighB', parent: 'pelvis', attach: 0, len: 11, w0: 4.2, w1: 3.4, a: 95, stiff: 19 },
      { name: 'shinB', parent: 'thighB', attach: 1, len: 10, w0: 3.4, w1: 2.5, a: 95, stiff: 21 },
      { name: 'footB', parent: 'shinB', attach: 1, len: 6, w0: 2.8, w1: 2.1, a: 5, stiff: 23 },
      { name: 'thighF', parent: 'pelvis', attach: 0, len: 11, w0: 4.3, w1: 3.5, a: 88, stiff: 19 },
      { name: 'shinF', parent: 'thighF', attach: 1, len: 10, w0: 3.5, w1: 2.6, a: 88, stiff: 21 },
      { name: 'footF', parent: 'shinF', attach: 1, len: 6, w0: 2.9, w1: 2.2, a: 5, stiff: 23 }
    ]);
  }
  function beastSkeleton() {  // мамонт
    return new Skeleton([
      { name: 'spine', parent: null, len: 26, w0: 13, w1: 11, a: 0, stiff: 13 },
      { name: 'neck', parent: 'spine', attach: 1, len: 8, w0: 9, w1: 8, a: -22, stiff: 13 },
      { name: 'head', parent: 'neck', attach: 1, len: 10, w0: 8, w1: 6, a: 10, stiff: 14 },
      { name: 'trunk', parent: 'head', attach: 1, len: 8, w0: 3.4, w1: 2.2, a: 60, stiff: 10 },
      { name: 'trunk2', parent: 'trunk', attach: 1, len: 7, w0: 2.2, w1: 1.4, a: 95, stiff: 9 },
      { name: 'fThighFar', parent: 'spine', attach: 0.84, len: 10, w0: 4.4, w1: 3.6, a: 86, stiff: 20 },
      { name: 'fShinFar', parent: 'fThighFar', attach: 1, len: 9, w0: 3.6, w1: 3, a: 94, stiff: 22 },
      { name: 'bThighFar', parent: 'spine', attach: 0.14, len: 11, w0: 5, w1: 4, a: 94, stiff: 20 },
      { name: 'bShinFar', parent: 'bThighFar', attach: 1, len: 9, w0: 4, w1: 3, a: 86, stiff: 22 },
      { name: 'fThigh', parent: 'spine', attach: 0.84, len: 10, w0: 4.6, w1: 3.8, a: 86, stiff: 20 },
      { name: 'fShin', parent: 'fThigh', attach: 1, len: 9, w0: 3.8, w1: 3.2, a: 94, stiff: 22 },
      { name: 'bThigh', parent: 'spine', attach: 0.14, len: 11, w0: 5.2, w1: 4.2, a: 94, stiff: 20 },
      { name: 'bShin', parent: 'bThigh', attach: 1, len: 9, w0: 4.2, w1: 3.2, a: 86, stiff: 22 }
    ]);
  }
  function machineSkeleton() {
    return new Skeleton([
      { name: 'body', parent: null, len: 22, w0: 10, w1: 9, a: 0, stiff: 14 },
      { name: 'arm', parent: 'body', attach: 0.55, len: 18, w0: 4, w1: 3, a: -50, stiff: 12 },
      { name: 'legF', parent: 'body', attach: 0.8, len: 12, w0: 4, w1: 3.4, a: 80, stiff: 18 },
      { name: 'legB', parent: 'body', attach: 0.2, len: 12, w0: 4, w1: 3.4, a: 100, stiff: 18 }
    ]);
  }

  /* ---------------- ТЕКСТУРЫ ФОНА ПО ДЭУІР ---------------- */
  var THEME = {
    stone: { sky: ['#4b3b56', '#8a5a44', '#d08a4e'], sun: 'rgba(255,190,120,.55)',
      far: '#3a3350', mid: '#2b2740', near: '#1d1a2c', ground: ['#543922', '#2a1c11'], deco: 'volcano' },
    egypt: { sky: ['#7cc4e8', '#e8c98a', '#f0d9a8'], sun: 'rgba(255,235,180,.6)',
      far: '#b99a63', mid: '#9c7d4c', near: '#6d5432', ground: ['#a8874f', '#5f4826'], deco: 'yurt' },
    medieval: { sky: ['#7fb6e8', '#bcd8ef', '#e6f0f8'], sun: 'rgba(255,246,214,.5)',
      far: '#5b7fa8', mid: '#3f6b56', near: '#2a4a3a', ground: ['#5c8a45', '#33502a'], deco: 'castle' },
    industrial: { sky: ['#6b6f7d', '#9a8f84', '#c2a98c'], sun: 'rgba(255,220,170,.35)',
      far: '#4a4f5c', mid: '#3a3d47', near: '#282b33', ground: ['#5a5348', '#332f28'], deco: 'factory' },
    future: { sky: ['#0d1030', '#1b2a5e', '#2a4a86'], sun: 'rgba(120,220,255,.35)',
      far: '#1a2450', mid: '#141c3e', near: '#0d1329', ground: ['#2a3352', '#161b2e'], deco: 'city' }
  };

  function bakeBg(theme, W, H, seed) {
    var c = mkCanvas(W, H), x = c.getContext('2d'), N = makeNoise(seed), i, px;

    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.sky[0]); g.addColorStop(0.55, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // светило
    var sx = W * 0.5, sy = H * 0.3;
    var sg = x.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55);
    sg.addColorStop(0, theme.sun); sg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sg; x.fillRect(0, 0, W, H);

    // дальние горы
    [['far', 0.62, 46], ['mid', 0.74, 32]].forEach(function (L) {
      var col = theme[L[0]], y0 = H * L[1], amp = L[2];
      x.fillStyle = col;
      x.beginPath(); x.moveTo(0, H);
      for (px = 0; px <= W; px += 5) {
        var r = N.fbm(px / 140 + (L[0] === 'far' ? 0 : 9), L[1] * 3, 5);
        var ridge = 1 - Math.abs(r - 0.5) * 2;
        x.lineTo(px, y0 - ridge * amp);
      }
      x.lineTo(W, H); x.closePath(); x.fill();
    });

    // декор эпохи на среднем плане
    var rng = makeRng(seed + 7);
    var baseY = H * 0.79;
    x.fillStyle = theme.near;
    if (theme.deco === 'volcano') {
      for (i = 0; i < 3; i++) {
        var vx = W * (0.15 + i * 0.32), vh = 40 + rng() * 26;
        x.beginPath(); x.moveTo(vx - vh * 0.9, baseY); x.lineTo(vx, baseY - vh); x.lineTo(vx + vh * 0.9, baseY);
        x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,120,60,.5)';
        x.beginPath(); x.moveTo(vx - 5, baseY - vh + 2); x.lineTo(vx, baseY - vh - 8); x.lineTo(vx + 5, baseY - vh + 2);
        x.closePath(); x.fill();
        x.fillStyle = theme.near;
      }
    } else if (theme.deco === 'yurt') {
      for (i = 0; i < 6; i++) {
        var yx = W * (0.08 + i * 0.16), yw = 14 + rng() * 8;
        x.beginPath();
        x.moveTo(yx - yw, baseY);
        x.quadraticCurveTo(yx - yw, baseY - yw * 1.1, yx, baseY - yw * 1.25);
        x.quadraticCurveTo(yx + yw, baseY - yw * 1.1, yx + yw, baseY);
        x.closePath(); x.fill();
      }
    } else if (theme.deco === 'castle') {
      for (i = 0; i < 4; i++) {
        var cx2 = W * (0.12 + i * 0.25), cw = 16, ch = 40 + rng() * 24;
        x.fillRect(cx2 - cw / 2, baseY - ch, cw, ch);
        for (var k = 0; k < 3; k++) x.fillRect(cx2 - cw / 2 + k * (cw / 3), baseY - ch - 5, cw / 4, 5);
      }
    } else if (theme.deco === 'factory') {
      for (i = 0; i < 5; i++) {
        var fx2 = W * (0.1 + i * 0.2), fw = 10 + rng() * 6, fh = 40 + rng() * 34;
        x.fillRect(fx2 - fw / 2, baseY - fh, fw, fh);
        x.fillStyle = 'rgba(220,215,205,.16)';
        x.beginPath(); x.ellipse(fx2, baseY - fh - 8, fw * 1.4, 8, 0, 0, TAU); x.fill();
        x.fillStyle = theme.near;
      }
    } else if (theme.deco === 'city') {
      for (i = 0; i < 9; i++) {
        var bx = W * (0.04 + i * 0.11), bw = 12 + rng() * 12, bh = 30 + rng() * 70;
        x.fillRect(bx - bw / 2, baseY - bh, bw, bh);
        x.fillStyle = 'rgba(90,220,255,.5)';
        for (var wy = 0; wy < bh - 8; wy += 9)
          for (var wx = 0; wx < bw - 5; wx += 6)
            if (rng() > 0.45) x.fillRect(bx - bw / 2 + wx + 2, baseY - bh + wy + 4, 2.5, 3.5);
        x.fillStyle = theme.near;
      }
    }

    // земля
    var gg = x.createLinearGradient(0, H * 0.8, 0, H);
    gg.addColorStop(0, theme.ground[0]); gg.addColorStop(1, theme.ground[1]);
    x.fillStyle = gg; x.fillRect(0, H * 0.8, W, H * 0.2);
    // фактура земли
    for (i = 0; i < 260; i++) {
      var gx = rng() * W, gy = H * 0.8 + rng() * H * 0.2;
      x.fillStyle = 'rgba(0,0,0,' + (0.05 + rng() * 0.12) + ')';
      x.beginPath(); x.ellipse(gx, gy, 1 + rng() * 3.5, 1 + rng() * 2, 0, 0, TAU); x.fill();
    }
    for (i = 0; i < 90; i++) {
      var lx = rng() * W, ly = H * 0.8 + rng() * H * 0.16;
      x.fillStyle = 'rgba(255,255,255,' + (0.03 + rng() * 0.07) + ')';
      x.beginPath(); x.ellipse(lx, ly, 1 + rng() * 2.5, 1 + rng() * 1.4, 0, 0, TAU); x.fill();
    }
    // линия горизонта земли
    x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, H * 0.8, W, 2);
    return c;
  }

  /* ---------------- ЧАСТИЦЫ ---------------- */
  var parts = [];
  function spawnParts(x, y, n, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var a = opt.dir === undefined ? rnd(TAU) : opt.dir + rnd(-0.9, 0.9);
      var s = rnd(opt.smin || 30, opt.smax || 160);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opt.up || 30),
        life: rnd(opt.lmin || 0.25, opt.lmax || 0.7), age: 0,
        r: rnd(opt.rmin || 1.5, opt.rmax || 3.5), g: opt.g === undefined ? 420 : opt.g,
        col: opt.col || [255, 210, 120], kind: opt.kind || 'dot'
      });
      if (parts.length > 260) parts.shift();
    }
  }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= (1 - 1.4 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  function drawParts(ctx) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], k = 1 - p.age / p.life;
      ctx.fillStyle = 'rgba(' + p.col[0] + ',' + p.col[1] + ',' + p.col[2] + ',' + (k * (p.kind === 'smoke' ? 0.35 : 0.95)) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.kind === 'smoke' ? p.r * (1.6 - k) : p.r * k + 0.3, 0, TAU);
      ctx.fill();
    }
  }

  /* ---------------- ОРУЖИЕ ---------------- */
  function drawWeapon(ctx, kind, pal, S, swing) {
    // рисуется в системе кисти: +x — вперёд от кулака
    ctx.save();
    switch (kind) {
      case 'club':
        ctx.fillStyle = '#6b4a2a';
        ctx.fillRect(-2, -1.6, 10, 3.2);
        ctx.fillStyle = pal.metalD;
        ctx.beginPath(); ctx.ellipse(12, 0, 5.5, 4.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.beginPath(); ctx.ellipse(11, -1.6, 2.4, 1.6, 0, 0, TAU); ctx.fill();
        break;
      case 'spear':
        ctx.fillStyle = '#7a5630';
        ctx.fillRect(-9, -1.1, 26, 2.2);
        ctx.fillStyle = pal.metal;
        ctx.beginPath(); ctx.moveTo(17, -3.4); ctx.lineTo(25, 0); ctx.lineTo(17, 3.4); ctx.closePath(); ctx.fill();
        break;
      case 'sword':
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-3, -1.5, 6, 3);
        ctx.fillStyle = pal.accent; ctx.fillRect(3, -3.4, 2, 6.8);
        var g = ctx.createLinearGradient(0, -2, 0, 2);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, pal.metal); g.addColorStop(1, pal.metalD);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(5, -2.3); ctx.lineTo(17, -1.4); ctx.lineTo(20, 0);
        ctx.lineTo(17, 1.4); ctx.lineTo(5, 2.3); ctx.closePath(); ctx.fill();
        break;
      case 'bow':
        ctx.strokeStyle = '#7a5630'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 10, -1.5, 1.5); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0.7, -10);
        ctx.lineTo(-4 - swing * 5, 0);
        ctx.lineTo(0.7, 10);
        ctx.stroke();
        if (swing > 0.15) {
          ctx.fillStyle = '#d8c9a0';
          ctx.fillRect(-4 - swing * 5, -0.7, 12, 1.4);
        }
        break;
      case 'sling':
        ctx.strokeStyle = '#6b5436'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 7 - swing * 12); ctx.stroke();
        ctx.fillStyle = '#8a8477';
        ctx.beginPath(); ctx.arc(7, 8 - swing * 13, 3, 0, TAU); ctx.fill();
        break;
      case 'rifle':
        ctx.fillStyle = '#4a3524'; ctx.fillRect(-6, -1.6, 10, 3.6);
        ctx.fillStyle = pal.metalD; ctx.fillRect(2, -1.4, 18, 2.6);
        ctx.fillStyle = pal.metal; ctx.fillRect(2, -1.4, 18, 0.9);
        if (swing > 0.2) {
          ctx.fillStyle = 'rgba(255,210,110,' + swing + ')';
          ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(27, -3.5); ctx.lineTo(27, 3.5); ctx.closePath(); ctx.fill();
        }
        break;
      case 'grenade':
        ctx.fillStyle = pal.metalD;
        ctx.beginPath(); ctx.arc(6, 0, 4.2, 0, TAU); ctx.fill();
        ctx.fillStyle = pal.accent; ctx.fillRect(5, -6, 2, 3);
        break;
      case 'laser':
        ctx.fillStyle = pal.metalD; ctx.fillRect(-5, -2.2, 12, 4.4);
        ctx.fillStyle = pal.metal; ctx.fillRect(7, -1.6, 12, 3.2);
        ctx.fillStyle = pal.accent;
        ctx.fillRect(-1, -3.4, 5, 1.6);
        ctx.shadowColor = pal.accent; ctx.shadowBlur = 6 + swing * 12;
        ctx.fillStyle = swing > 0.2 ? '#ffffff' : pal.accent;
        ctx.beginPath(); ctx.arc(19.5, 0, 1.9 + swing * 2.2, 0, TAU); ctx.fill();
        break;
    }
    ctx.restore();
  }

  /* ---------------- ЮНИТ: ГУМАНОИД ---------------- */
  function poseHumanoid(u, dt, gear) {
    var P, a, sw, t = u._t;
    var atk = u._atk;
    if (atk > 0) {
      var p = 1 - atk;                       // 0..1 по ходу удара
      var ranged = gear.w === 'bow' || gear.w === 'rifle' || gear.w === 'laser' || gear.w === 'sling' || gear.w === 'grenade';
      if (ranged) {
        var rec = p < 0.25 ? p / 0.25 : Math.max(0, 1 - (p - 0.25) / 0.75);
        P = { pelvis: -90, torso: -90 + 4, neck: -90, head: -92,
          thighF: 86, shinF: 94, footF: 8, thighB: 96, shinB: 100, footB: 6,
          armFU: 4 - rec * 8, armFF: 2 - rec * 6,
          armBU: 22 + rec * 10, armBF: 10 + rec * 14 };
      } else {
        var swing2 = p < 0.3 ? lerp(-120, -150, p / 0.3) : lerp(-150, 55, Math.min(1, (p - 0.3) / 0.45));
        P = { pelvis: -90, torso: -90 + (p < 0.3 ? -10 : 14), neck: -90, head: -92,
          thighF: 82, shinF: 92, footF: 8, thighB: 98, shinB: 104, footB: 6,
          armFU: swing2, armFF: swing2 + (p < 0.3 ? -30 : 16),
          armBU: 126, armBF: 148 };
      }
    } else if (u.state === 'walking') {
      u._ph = (u._ph + dt * 2.4) % 1;
      a = u._ph * TAU; sw = 30;
      P = { pelvis: -90, torso: -90 + 8 + Math.sin(a * 2) * 1.4, neck: -91, head: -93,
        thighF: 90 + Math.sin(a) * sw,
        shinF: 90 + Math.sin(a) * sw + 20 + Math.max(0, Math.sin(a + 1.1)) * 44,
        footF: 10 + Math.sin(a + 2.4) * 20,
        thighB: 90 + Math.sin(a + Math.PI) * sw,
        shinB: 90 + Math.sin(a + Math.PI) * sw + 20 + Math.max(0, Math.sin(a + Math.PI + 1.1)) * 44,
        footB: 10 + Math.sin(a + Math.PI + 2.4) * 20,
        armFU: 92 - Math.sin(a) * 26, armFF: 92 - Math.sin(a) * 26 + 30,
        armBU: 92 + Math.sin(a) * 26, armBF: 92 + Math.sin(a) * 26 + 30 };
      if (gear.w === 'bow' || gear.w === 'rifle' || gear.w === 'laser') {
        P.armFU = 46; P.armFF = 30; P.armBU = 70; P.armBF = 44;
      }
    } else {
      var b = Math.sin(t * 2.4);
      P = { pelvis: -90, torso: -90 + 3 + b * 1.1, neck: -90 - b, head: -92 - b,
        thighF: 92, shinF: 96, footF: 8, thighB: 87, shinB: 92, footB: 6,
        armFU: 96 + b * 3, armFF: 126 + b * 4, armBU: 92 + b * 3, armBF: 118 + b * 4 };
      if (gear.w === 'bow' || gear.w === 'rifle' || gear.w === 'laser') {
        P.armFU = 40; P.armFF = 24; P.armBU = 66; P.armBF = 40;
      }
    }
    u._sk.pose(P, dt, atk > 0 ? 2.4 : 1);
  }

  function drawHumanoid(ctx, u, pal, gear, S) {
    var sk = u._sk, hurt = u._hit > 0;
    var cloth = hurt ? '#ffffff' : pal.cloth, clothD = hurt ? '#e8e8ff' : pal.clothD;
    var skin = hurt ? '#ffffff' : pal.skin, skinD = hurt ? '#e8e8ff' : pal.skinD;
    var metal = hurt ? '#ffffff' : pal.metal, metalD = hurt ? '#e8e8ff' : pal.metalD;

    function leg(tn, sn, fn, back) {
      var t = sk.b(tn), s = sk.b(sn), f = sk.b(fn);
      var c = back ? clothD : cloth, cd = clothD;
      var OL = back ? null : 'rgba(8,12,22,.5)';
      limb(ctx, t.x, t.y, t.ex, t.ey, t.w0, t.w1, c, cd, OL);
      joint(ctx, t.ex, t.ey, s.w0, c);
      limb(ctx, s.x, s.y, s.ex, s.ey, s.w0, s.w1, back ? skinD : skin, skinD, OL);
      // обувь
      ctx.save(); ctx.translate(s.ex, s.ey); ctx.rotate(f.angle);
      ctx.fillStyle = back ? metalD : '#4a3320';
      ctx.beginPath();
      ctx.moveTo(-3, -3.4); ctx.lineTo(f.len, -2.6);
      ctx.quadraticCurveTo(f.len + 2, -1.8, f.len + 2, 1.2);
      ctx.lineTo(-3.4, 2.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    function arm(un, fn, back, weapon) {
      var uu = sk.b(un), ff = sk.b(fn);
      var c = back ? clothD : cloth;
      limb(ctx, uu.x, uu.y, uu.ex, uu.ey, uu.w0, uu.w1, c, clothD, back ? null : 'rgba(8,12,22,.5)');
      joint(ctx, uu.x, uu.y, uu.w0 * 1.05, c);
      joint(ctx, uu.ex, uu.ey, uu.w1 * 1.1, clothD);
      limb(ctx, ff.x, ff.y, ff.ex, ff.ey, ff.w0, ff.w1, back ? skinD : skin, skinD, null);
      joint(ctx, ff.ex, ff.ey, 2.6, back ? skinD : skin);
      if (weapon) {
        ctx.save();
        ctx.translate(ff.ex, ff.ey); ctx.rotate(ff.angle);
        drawWeapon(ctx, gear.w, { metal: metal, metalD: metalD, accent: pal.accent }, S, u._atk > 0 ? (1 - u._atk) : 0);
        ctx.restore();
      }
    }

    // щит за спиной (дальняя рука)
    leg('thighB', 'shinB', 'footB', true);
    arm('armBU', 'armBF', true, false);
    if (gear.shield) {
      var bf = sk.b('armBF');
      ctx.save(); ctx.translate(bf.ex, bf.ey); ctx.rotate(bf.angle);
      ctx.fillStyle = metalD;
      ctx.beginPath(); ctx.ellipse(2, 0, 5, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.accent;
      ctx.beginPath(); ctx.ellipse(2.6, 0, 2.2, 4.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // торс
    var t2 = sk.b('torso');
    var dx = t2.ex - t2.x, dy = t2.ey - t2.y, len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(t2.x + nx * 5.4, t2.y + ny * 5.4);
    ctx.quadraticCurveTo(t2.x + nx * 7.4 + dx * 0.4, t2.y + ny * 7.4 + dy * 0.4, t2.ex + nx * 7.2, t2.ey + ny * 7.2);
    ctx.lineTo(t2.ex - nx * 7.2, t2.ey - ny * 7.2);
    ctx.quadraticCurveTo(t2.x - nx * 7.4 + dx * 0.4, t2.y - ny * 7.4 + dy * 0.4, t2.x - nx * 5.4, t2.y - ny * 5.4);
    ctx.closePath();
    var tg = ctx.createLinearGradient(t2.x + nx * 8, t2.y + ny * 8, t2.x - nx * 8, t2.y - ny * 8);
    tg.addColorStop(0, gear.armor ? metal : cloth);
    tg.addColorStop(1, gear.armor ? metalD : clothD);
    ctx.fillStyle = tg; ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,26,.45)'; ctx.lineWidth = 1; ctx.stroke();

    if (gear.wrap) {   // бинты мумии
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.4;
      for (var i = 0; i < 4; i++) {
        var pt = t2.at(0.2 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(pt.x - nx * 6.6, pt.y - ny * 6.6);
        ctx.lineTo(pt.x + nx * 6.6, pt.y + ny * 6.6);
        ctx.stroke();
      }
    }
    // пояс
    var belt = t2.at(0.16);
    ctx.save(); ctx.translate(belt.x, belt.y); ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    ctx.fillStyle = '#6b4a26'; ctx.fillRect(-6.2, -2, 12.4, 4);
    ctx.fillStyle = pal.accent; ctx.fillRect(-1.8, -2.4, 3.6, 4.8);
    ctx.restore();

    // голова
    var h = sk.b('head'), n = sk.b('neck');
    limb(ctx, n.x, n.y, n.ex, n.ey, 2.7, 2.5, skinD, skinD, null);
    var hx = h.x + (h.ex - h.x) * 0.42, hy = h.y + (h.ey - h.y) * 0.42;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(h.angle + Math.PI / 2);
    // волосы/затылок
    ctx.fillStyle = pal.hair;
    ctx.beginPath(); ctx.ellipse(-1.2, -0.4, 7.2, 7.6, 0, 0, TAU); ctx.fill();
    // лицо
    var hg = ctx.createLinearGradient(-6, -6, 6, 6);
    hg.addColorStop(0, hurt ? '#fff' : '#f4c9a2'); hg.addColorStop(0.6, skin); hg.addColorStop(1, skinD);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(6.4, -6.6, 6.4, -0.4);
    ctx.quadraticCurveTo(6.4, 5, 2.2, 6.8);
    ctx.quadraticCurveTo(-2, 7.6, -5.2, 5);
    ctx.quadraticCurveTo(-7, 1.8, -6.4, -2.2);
    ctx.quadraticCurveTo(-5.8, -7, 0, -7);
    ctx.closePath(); ctx.fill();
    // глаз
    if (gear.visor) {
      ctx.fillStyle = pal.accent;
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 6;
      ctx.fillRect(0.4, -2.6, 6.2, 2.6);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(2.9, -0.8, 1.9, 2.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.eye;
      ctx.beginPath(); ctx.arc(3.4, -0.6, 1.05, 0, TAU); ctx.fill();
      // бровь
      ctx.strokeStyle = pal.hair; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(1.4, -3.6); ctx.lineTo(4.8, -4.4); ctx.stroke();
    }
    // головной убор
    if (gear.helm) {
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(-7, -1.6);
      ctx.quadraticCurveTo(-7, -9.4, 0.6, -9.2);
      ctx.quadraticCurveTo(7, -9, 7, -1.6);
      ctx.lineTo(5.6, -1.6);
      ctx.quadraticCurveTo(5.6, -7, 0, -7.2);
      ctx.quadraticCurveTo(-5.6, -7.2, -5.6, -1.6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = metalD;
      ctx.fillRect(-7, -2.4, 14, 2);
      if (gear.helm === 2) {   // плюмаж
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.moveTo(-1, -9); ctx.quadraticCurveTo(-1, -15, -6, -17);
        ctx.quadraticCurveTo(-2, -13, -3.4, -8.6); ctx.closePath(); ctx.fill();
      }
    } else if (gear.hat) {     // саки: остроконечный башлык
      ctx.fillStyle = pal.cloth;
      ctx.beginPath();
      ctx.moveTo(-6.6, -2.4);
      ctx.quadraticCurveTo(-3, -14, 2.6, -9.4);
      ctx.quadraticCurveTo(6.6, -6.4, 6.6, -2.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.accent; ctx.fillRect(-6.8, -3.4, 13.6, 1.8);
    }
    ctx.restore();

    // ближняя нога и рука с оружием
    leg('thighF', 'shinF', 'footF', false);
    arm('armFU', 'armFF', false, true);

    // цвет команды — чтобы в бою было видно, кто чей
    var sh = sk.b('armFU');
    ctx.fillStyle = u.team === 'p' ? '#9be870' : '#ff5a72';
    ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.w0 * 0.95, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,22,.45)'; ctx.lineWidth = 0.9; ctx.stroke();
  }

  /* ---------------- ЮНИТ: МАМОНТ ---------------- */
  function poseBeast(u, dt) {
    var P, a;
    if (u._atk > 0) {
      var p = 1 - u._atk;
      P = { spine: -4, neck: -22 + (p < 0.4 ? -14 : 10), head: 6 + (p < 0.4 ? -18 : 22),
        trunk: 60 + (p < 0.4 ? -40 : 30), trunk2: 95 + (p < 0.4 ? -30 : 20),
        fThigh: 70, fShin: 108, bThigh: 100, bShin: 80,
        fThighFar: 76, fShinFar: 104, bThighFar: 96, bShinFar: 84 };
    } else {
      u._ph = (u._ph + dt * (u.state === 'walking' ? 1.5 : 0.5)) % 1;
      a = u._ph * TAU;
      var sw = u.state === 'walking' ? 20 : 4;
      P = { spine: -4 + Math.sin(a * 2) * 1.6, neck: -22 + Math.sin(a * 2 + 1) * 3, head: 6 + Math.sin(a * 2) * 2,
        trunk: 60 + Math.sin(a) * 16, trunk2: 95 + Math.sin(a + 0.7) * 22,
        fThigh: 86 + Math.sin(a) * sw, fShin: 94 + Math.sin(a - 0.7) * sw * 0.8,
        bThigh: 94 + Math.sin(a + Math.PI) * sw, bShin: 86 + Math.sin(a + Math.PI - 0.7) * sw * 0.8,
        fThighFar: 86 + Math.sin(a + Math.PI) * sw, fShinFar: 94 + Math.sin(a + Math.PI - 0.7) * sw * 0.8,
        bThighFar: 94 + Math.sin(a) * sw, bShinFar: 86 + Math.sin(a - 0.7) * sw * 0.8 };
    }
    u._sk.pose(P, dt, u._atk > 0 ? 2.2 : 1);
  }
  function drawBeast(ctx, u, pal) {
    var sk = u._sk, hurt = u._hit > 0;
    var fur = hurt ? '#ffffff' : '#8a6440', furD = hurt ? '#e8e8ff' : '#553520';
    var far = hurt ? '#e8e8ff' : '#4a3018';
    var sp = sk.b('spine'), nk = sk.b('neck'), hd = sk.b('head');
    var i;

    // дальние ноги
    ['fThighFar,fShinFar', 'bThighFar,bShinFar'].forEach(function (pair) {
      var p = pair.split(','), t = sk.b(p[0]), s2 = sk.b(p[1]);
      limb(ctx, t.x, t.y, t.ex, t.ey, t.w0, t.w1, far, far, null);
      limb(ctx, s2.x, s2.y, s2.ex, s2.ey, s2.w0, s2.w1, far, far, null);
      ctx.fillStyle = '#2a1a0c';
      ctx.beginPath(); ctx.ellipse(s2.ex, s2.ey + 1, 4.4, 2.4, 0, 0, TAU); ctx.fill();
    });

    // ТУША — крупный округлый объём, а не капсула
    var cx = (sp.x + sp.ex) / 2, cy = (sp.y + sp.ey) / 2;
    var bodyG = ctx.createLinearGradient(cx, cy - 16, cx, cy + 14);
    bodyG.addColorStop(0, hurt ? '#fff' : '#9c7349');
    bodyG.addColorStop(1, furD);
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(sp.x - 4, sp.y + 8);
    ctx.quadraticCurveTo(sp.x - 10, sp.y - 10, sp.x + 4, sp.y - 15);   // круп
    ctx.quadraticCurveTo(cx, cy - 20, sp.ex + 2, sp.ey - 13);          // спина
    ctx.quadraticCurveTo(sp.ex + 10, sp.ey - 2, sp.ex + 6, sp.ey + 9); // грудь
    ctx.quadraticCurveTo(cx, cy + 15, sp.x - 4, sp.y + 8);             // брюхо
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,22,.4)'; ctx.lineWidth = 1.1; ctx.stroke();

    // шерсть по нижнему краю
    ctx.strokeStyle = furD; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (i = 0; i < 7; i++) {
      var bp = sp.at(0.1 + i * 0.13);
      ctx.beginPath();
      ctx.moveTo(bp.x, bp.y + 9);
      ctx.lineTo(bp.x - 1.5, bp.y + 14 + (i % 2) * 2);
      ctx.stroke();
    }
    // холка
    ctx.fillStyle = hurt ? '#fff' : '#a87c4e';
    ctx.beginPath();
    ctx.moveTo(sp.ex - 6, sp.ey - 12);
    ctx.quadraticCurveTo(sp.ex + 2, sp.ey - 20, sp.ex + 6, sp.ey - 9);
    ctx.closePath(); ctx.fill();

    // ГОЛОВА — куполом
    var hcx = hd.x + (hd.ex - hd.x) * 0.45, hcy = hd.y + (hd.ey - hd.y) * 0.45;
    ctx.save();
    ctx.translate(hcx, hcy);
    ctx.rotate(hd.angle);
    ctx.fillStyle = hurt ? '#fff' : '#946c46';
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 9.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,22,.35)'; ctx.lineWidth = 1; ctx.stroke();
    // купол черепа
    ctx.fillStyle = hurt ? '#fff' : '#a2794f';
    ctx.beginPath(); ctx.ellipse(-1, -6, 7, 5, 0, Math.PI, 0); ctx.fill();
    // ухо
    ctx.fillStyle = far;
    ctx.beginPath(); ctx.ellipse(-7, 1, 5.4, 6.4, 0.5, 0, TAU); ctx.fill();
    // глаз
    ctx.fillStyle = '#140d06';
    ctx.beginPath(); ctx.arc(5, -1.5, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.arc(5.5, -2.1, 0.6, 0, TAU); ctx.fill();
    ctx.restore();

    // БИВНИ — толстые, изогнутые, поверх головы
    ctx.strokeStyle = '#f7f0e0'; ctx.lineCap = 'round';
    [[0, 4.6], [4, 3.4]].forEach(function (t) {
      ctx.lineWidth = t[1];
      ctx.beginPath();
      ctx.moveTo(hcx + 4, hcy + 4 + t[0]);
      ctx.quadraticCurveTo(hcx + 20, hcy + 12 + t[0], hcx + 24, hcy - 4 + t[0]);
      ctx.stroke();
    });

    // ХОБОТ
    var tr = sk.b('trunk'), tr2 = sk.b('trunk2');
    limb(ctx, tr.x, tr.y, tr.ex, tr.ey, tr.w0 + 1.4, tr.w1 + 0.6, fur, furD, 'rgba(8,12,22,.35)');
    limb(ctx, tr2.x, tr2.y, tr2.ex, tr2.ey, tr2.w0 + 0.6, tr2.w1, fur, furD, 'rgba(8,12,22,.35)');
    ctx.strokeStyle = 'rgba(60,40,20,.5)'; ctx.lineWidth = 0.9;
    for (i = 1; i <= 3; i++) {
      var tp = tr.at(i / 4);
      ctx.beginPath(); ctx.arc(tp.x, tp.y, tr.w0 * 0.75, -0.6, 0.6); ctx.stroke();
    }

    // ближние ноги
    ['fThigh,fShin', 'bThigh,bShin'].forEach(function (pair) {
      var p = pair.split(','), t = sk.b(p[0]), s2 = sk.b(p[1]);
      limb(ctx, t.x, t.y, t.ex, t.ey, t.w0 + 1, t.w1 + 0.6, fur, furD, 'rgba(8,12,22,.4)');
      limb(ctx, s2.x, s2.y, s2.ex, s2.ey, s2.w0 + 0.6, s2.w1, fur, furD, 'rgba(8,12,22,.4)');
      ctx.fillStyle = '#2a1a0c';
      ctx.beginPath(); ctx.ellipse(s2.ex, s2.ey + 1, 5, 2.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8dcc4';
      for (var k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.arc(s2.ex + k * 2.4, s2.ey + 2, 0.9, 0, TAU); ctx.fill();
      }
    });
  }

  /* ---------------- ЮНИТ: МАШИНА ---------------- */
  function poseMachine(u, dt, gear) {
    var P;
    if (gear.kind === 'mech') {
      u._ph = (u._ph + dt * (u.state === 'walking' ? 1.8 : 0.4)) % 1;
      var a = u._ph * TAU, sw = u.state === 'walking' ? 26 : 3;
      P = { body: -6 + Math.sin(a * 2) * 2, arm: u._atk > 0 ? -8 : -34 + Math.sin(a) * 6,
        legF: 80 + Math.sin(a) * sw, legB: 100 + Math.sin(a + Math.PI) * sw };
    } else {
      var rec = u._atk > 0 ? (1 - u._atk) : 0;
      P = { body: 0, arm: gear.kind === 'catapult' ? (-120 + rec * 150) : (-14 + rec * 8),
        legF: 90, legB: 90 };
    }
    u._sk.pose(P, dt, u._atk > 0 ? 3 : 1.4);
  }
  function drawMachine(ctx, u, pal, gear) {
    var sk = u._sk, hurt = u._hit > 0;
    var metal = hurt ? '#fff' : pal.metal, metalD = hurt ? '#e8e8ff' : pal.metalD;
    var body = sk.b('body'), arm = sk.b('arm');

    if (gear.kind === 'tank') {
      // гусеницы
      ctx.fillStyle = '#2f333c';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(body.x - 4, body.y + 6, body.len + 12, 12, 6)
        : ctx.rect(body.x - 4, body.y + 6, body.len + 12, 12);
      ctx.fill();
      ctx.fillStyle = '#4a505c';
      for (var i = 0; i < 6; i++) {
        var wx = body.x + 2 + i * ((body.len + 4) / 6);
        ctx.beginPath(); ctx.arc(wx, body.y + 12, 3.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#20242c';
        ctx.beginPath(); ctx.arc(wx, body.y + 12, 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4a505c';
      }
      // корпус
      limb(ctx, body.x, body.y, body.ex, body.ey, body.w0, body.w1, metal, metalD, 'rgba(10,14,26,.5)');
      // труба + дым
      ctx.fillStyle = metalD;
      ctx.fillRect(body.x + 3, body.y - 16, 5, 12);
      // ствол
      ctx.save(); ctx.translate(arm.x, arm.y); ctx.rotate(arm.angle);
      ctx.fillStyle = metalD; ctx.fillRect(0, -2.6, arm.len + 6, 5.2);
      ctx.fillStyle = metal; ctx.fillRect(0, -2.6, arm.len + 6, 1.8);
      if (u._atk > 0 && u._atk > 0.6) {
        ctx.fillStyle = 'rgba(255,200,110,' + (u._atk - 0.6) * 2.4 + ')';
        ctx.beginPath(); ctx.arc(arm.len + 8, 0, 6, 0, TAU); ctx.fill();
      }
      ctx.restore();
    } else if (gear.kind === 'catapult') {
      // рама
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(body.x, body.y + 14); ctx.lineTo(body.ex, body.ey + 14);
      ctx.moveTo(body.x + 4, body.y + 14); ctx.lineTo(body.x + 12, body.y - 6);
      ctx.moveTo(body.ex - 4, body.ey + 14); ctx.lineTo(body.x + 12, body.y - 6);
      ctx.stroke();
      // колёса
      ctx.fillStyle = '#5a3d20';
      [body.x + 3, body.ex - 3].forEach(function (wx) {
        ctx.beginPath(); ctx.arc(wx, body.y + 15, 6.4, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3a2713'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(wx, body.y + 15, 6.4, 0, TAU); ctx.stroke();
      });
      // метательный рычаг
      ctx.save(); ctx.translate(body.x + 12, body.y - 6); ctx.rotate(arm.angle);
      ctx.strokeStyle = '#7a5630'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(arm.len, 0); ctx.stroke();
      ctx.fillStyle = '#4a3a2a';
      ctx.beginPath(); ctx.arc(arm.len + 3, 0, 5, 0, TAU); ctx.fill();
      if (u._atk > 0.5) {
        ctx.fillStyle = '#8a8477';
        ctx.beginPath(); ctx.arc(arm.len + 3, 0, 3.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    } else { // mech
      var legF = sk.b('legF'), legB = sk.b('legB');
      [legB, legF].forEach(function (L, idx) {
        limb(ctx, L.x, L.y, L.ex, L.ey, L.w0, L.w1, idx ? metal : metalD, metalD, null);
        ctx.fillStyle = '#2b3240';
        ctx.beginPath(); ctx.ellipse(L.ex, L.ey + 2, 6, 2.6, 0, 0, TAU); ctx.fill();
      });
      limb(ctx, body.x, body.y, body.ex, body.ey, body.w0, body.w1, metal, metalD, 'rgba(10,14,26,.5)');
      // кабина
      ctx.fillStyle = pal.accent;
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(body.ex - 3, body.ey - 4, 5, 3.4, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      // пушка
      ctx.save(); ctx.translate(arm.x, arm.y); ctx.rotate(arm.angle);
      ctx.fillStyle = metalD; ctx.fillRect(0, -3, arm.len, 6);
      ctx.fillStyle = pal.accent;
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 6 + (u._atk > 0 ? 14 : 0);
      ctx.beginPath(); ctx.arc(arm.len + 2, 0, 2.6 + (u._atk > 0 ? 2 : 0), 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- БАЗЫ ---------------- */
  function drawBase(ctx, eraKey, x, groundY, S, hpFrac, t, enemy) {
    var pal = PAL[eraKey] || PAL.stone;
    ctx.save();
    ctx.translate(x, groundY);
    ctx.scale(enemy ? -S : S, S);
    var dmg = 1 - clamp(hpFrac, 0, 1);

    if (eraKey === 'stone') {
      ctx.fillStyle = '#5b5348';
      ctx.beginPath();
      ctx.moveTo(-30, 0); ctx.quadraticCurveTo(-26, -34, 0, -36);
      ctx.quadraticCurveTo(26, -34, 30, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a352d';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 16, 0, Math.PI, 0); ctx.fill();
      // камни
      ctx.fillStyle = '#6e6558';
      [[-22, -8, 6], [-14, -22, 5], [16, -20, 5.4], [23, -9, 6]].forEach(function (s) {
        ctx.beginPath(); ctx.arc(s[0], s[1], s[2], 0, TAU); ctx.fill();
      });
      // костёр
      var f = 1 + Math.sin(t * 9) * 0.22;
      ctx.fillStyle = 'rgba(255,150,60,.85)';
      ctx.beginPath(); ctx.moveTo(-5, -1); ctx.quadraticCurveTo(0, -14 * f, 5, -1);
      ctx.quadraticCurveTo(0, 3, -5, -1); ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.moveTo(-2.4, -1); ctx.quadraticCurveTo(0, -8 * f, 2.4, -1);
      ctx.quadraticCurveTo(0, 2, -2.4, -1); ctx.fill();
    } else if (eraKey === 'egypt') {
      // юрта
      ctx.fillStyle = '#d8cbb0';
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(-26, -18);
      ctx.quadraticCurveTo(0, -40, 26, -18);
      ctx.lineTo(30, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a3906d'; ctx.lineWidth = 1.4;
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 11, 0); ctx.lineTo(i * 5, -30); ctx.stroke();
      }
      ctx.fillStyle = pal.accent;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-9, -16); ctx.lineTo(9, -16); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill();
      // флаг
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(24, -18); ctx.lineTo(24, -46); ctx.stroke();
      ctx.fillStyle = pal.cloth;
      ctx.beginPath(); ctx.moveTo(24, -46);
      ctx.lineTo(24 + 16, -42 + Math.sin(t * 4) * 2);
      ctx.lineTo(24, -36); ctx.closePath(); ctx.fill();
    } else if (eraKey === 'medieval') {
      ctx.fillStyle = '#8d94a6';
      ctx.fillRect(-26, -34, 52, 34);
      ctx.fillStyle = '#6f7788';
      for (var k = 0; k < 5; k++) ctx.fillRect(-26 + k * 11, -42, 7, 8);
      ctx.fillStyle = '#5b6272';
      ctx.fillRect(-8, -18, 16, 18);
      ctx.fillStyle = '#2b3040';
      ctx.beginPath(); ctx.ellipse(0, -18, 8, 10, 0, Math.PI, 0); ctx.fill();
      // кладка
      ctx.strokeStyle = 'rgba(30,34,46,.4)'; ctx.lineWidth = 1;
      for (var r = 0; r < 4; r++) { ctx.beginPath(); ctx.moveTo(-26, -34 + r * 9); ctx.lineTo(26, -34 + r * 9); ctx.stroke(); }
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, -42); ctx.lineTo(20, -60); ctx.stroke();
      ctx.fillStyle = pal.cloth;
      ctx.beginPath(); ctx.moveTo(20, -60); ctx.lineTo(20 + 15, -56 + Math.sin(t * 4) * 2); ctx.lineTo(20, -50); ctx.closePath(); ctx.fill();
    } else if (eraKey === 'industrial') {
      ctx.fillStyle = '#6a6156';
      ctx.fillRect(-28, -30, 56, 30);
      ctx.fillStyle = '#4c453c';
      ctx.beginPath();
      ctx.moveTo(-28, -30);
      for (var z = 0; z < 4; z++) { ctx.lineTo(-28 + z * 14 + 7, -40); ctx.lineTo(-28 + (z + 1) * 14, -30); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7d7466';
      ctx.fillRect(12, -52, 10, 24);
      ctx.fillStyle = 'rgba(210,205,195,.28)';
      for (var s2 = 0; s2 < 3; s2++) {
        var sy = -56 - s2 * 9 - (t * 12 % 9);
        ctx.beginPath(); ctx.arc(17, sy, 5 + s2 * 2.4, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,190,90,.55)';
      [-18, -4, 10].forEach(function (wx) { ctx.fillRect(wx, -22, 8, 7); });
    } else {
      // будущее: энергокупол
      ctx.fillStyle = '#243258';
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-22, -22); ctx.lineTo(22, -22); ctx.lineTo(30, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#31447a';
      ctx.beginPath(); ctx.ellipse(0, -22, 22, 20, 0, Math.PI, 0); ctx.fill();
      var pulse = 0.6 + Math.sin(t * 3) * 0.25;
      ctx.strokeStyle = 'rgba(33,212,253,' + pulse + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -22, 26, 24, 0, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = pal.accent;
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, -26, 6, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // повреждения
    if (dmg > 0.35) {
      ctx.strokeStyle = 'rgba(20,14,10,' + (dmg * 0.7) + ')';
      ctx.lineWidth = 1.6;
      for (var c2 = 0; c2 < 3; c2++) {
        ctx.beginPath();
        ctx.moveTo(-18 + c2 * 14, -4);
        ctx.lineTo(-14 + c2 * 14, -16 - c2 * 4);
        ctx.lineTo(-19 + c2 * 14, -26 - c2 * 3);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (dmg > 0.55 && Math.random() < 0.25) {
      spawnParts(x + rnd(-12, 12) * S, groundY - rnd(6, 26) * S, 1,
        { col: [70, 70, 70], kind: 'smoke', g: -40, rmin: 3, rmax: 6, lmin: 0.7, lmax: 1.3, up: 10 });
    }
  }

  /* ---------------- ТУРЕЛИ ---------------- */
  function drawTurret(ctx, eraKey, x, y, S, enemy, t, type) {
    var pal = PAL[eraKey] || PAL.stone;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(enemy ? -S : S, S);
    // основание
    ctx.fillStyle = '#5b6272';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-7, -14); ctx.lineTo(7, -14); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#767f92'; ctx.fillRect(-8, -17, 16, 4);
    var bob = Math.sin(t * 2.2) * 1.2;
    if (eraKey === 'stone' || eraKey === 'egypt') {
      ctx.fillStyle = '#7a5630';
      ctx.fillRect(-2, -26 + bob, 4, 10);
      ctx.fillStyle = pal.metalD;
      ctx.beginPath(); ctx.arc(3, -28 + bob, 5, 0, TAU); ctx.fill();
    } else if (eraKey === 'medieval') {
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(2, -24 + bob, 8, -1.4, 1.4); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(3, -32 + bob); ctx.lineTo(-3, -24 + bob); ctx.lineTo(3, -16 + bob); ctx.stroke();
    } else {
      ctx.fillStyle = pal.metalD;
      ctx.fillRect(-3, -28 + bob, 18, 5);
      ctx.fillStyle = pal.metal;
      ctx.fillRect(-3, -28 + bob, 18, 1.8);
      ctx.fillStyle = pal.accent;
      ctx.beginPath(); ctx.arc(-4, -25.5 + bob, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // значок типа
    if (type) {
      ctx.save();
      ctx.font = '900 ' + Math.round(9 * S) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(type === 'range' ? '◎' : type === 'rapid' ? '⚡' : '✦', x, y - 32 * S);
      ctx.restore();
    }
  }

  /* ---------------- СНАРЯДЫ ---------------- */
  function drawProjectile(ctx, p, W, groundY, S) {
    var x = W * p.x / 100, y = groundY - (p.y || 0) * S;
    var dir = (p.target && p.target.x != null ? p.target.x : 50) >= p.x ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * S, S);
    var t = p._spin = (p._spin || 0) + 0.35;
    switch (p.type) {
      case 'arrow':
        ctx.rotate(p.arc ? Math.sin(t * 0.1) * 0.35 : 0);
        ctx.fillStyle = '#d8c9a0'; ctx.fillRect(-9, -0.7, 16, 1.4);
        ctx.fillStyle = '#c2cadb';
        ctx.beginPath(); ctx.moveTo(7, -2.6); ctx.lineTo(12, 0); ctx.lineTo(7, 2.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e05a4a';
        ctx.beginPath(); ctx.moveTo(-9, -2.4); ctx.lineTo(-5, 0); ctx.lineTo(-9, 2.4); ctx.closePath(); ctx.fill();
        break;
      case 'rock':
        ctx.rotate(t * 0.4);
        ctx.fillStyle = '#8a8477';
        ctx.beginPath();
        ctx.moveTo(-4, -2); ctx.lineTo(0, -5); ctx.lineTo(5, -1); ctx.lineTo(3, 4); ctx.lineTo(-3, 3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath(); ctx.ellipse(-1, -1.6, 2, 1.2, 0, 0, TAU); ctx.fill();
        break;
      case 'grenade':
        ctx.rotate(t * 0.6);
        ctx.fillStyle = '#4d5361';
        ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#d08a1e'; ctx.fillRect(-1, -5.4, 2, 2.6);
        ctx.fillStyle = 'rgba(255,190,90,.9)';
        ctx.beginPath(); ctx.arc(0, -6.4, 1.6 + Math.sin(t) * 0.6, 0, TAU); ctx.fill();
        break;
      case 'bullet':
        ctx.fillStyle = 'rgba(255,220,140,.5)';
        ctx.fillRect(-14, -0.8, 14, 1.6);
        ctx.fillStyle = '#ffe9a0';
        ctx.beginPath(); ctx.ellipse(0, 0, 3, 1.3, 0, 0, TAU); ctx.fill();
        break;
      case 'laser':
        ctx.fillStyle = 'rgba(33,212,253,.35)';
        ctx.fillRect(-22, -2.4, 24, 4.8);
        ctx.shadowColor = '#21d4fd'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#dffaff';
        ctx.fillRect(-18, -1.1, 22, 2.2);
        break;
      default:
        ctx.fillStyle = '#ffd54a';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- ГЛАВНЫЙ ОБЪЕКТ ---------------- */
  var War = {
    cv: null, ctx: null, W: 0, H: 0, dpr: 1, S: 1,
    eraKey: 'stone', bg: null, t: 0, groundY: 0, shake: 0,

    init: function (canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.resize();
      var self = this;
      global.addEventListener('resize', function () { self.resize(); });
    },

    resize: function () {
      if (!this.cv) return;
      var r = this.cv.getBoundingClientRect();
      var w = Math.max(200, r.width), h = Math.max(120, r.height);
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.cv.width = Math.round(w * this.dpr);
      this.cv.height = Math.round(h * this.dpr);
      this.W = w; this.H = h;
      this.groundY = h * 0.95;
      // масштаб фигур: на узком экране юниты не должны стать точками
      this.S = clamp(h / 300, 0.62, 1.5);
      this.bg = null;   // перепечём фон под новый размер
    },

    setEra: function (key) {
      this.eraKey = key || 'stone';
      this.bg = null;
      parts.length = 0;
    },

    ensureBg: function () {
      if (this.bg) return;
      var th = THEME[this.eraKey] || THEME.stone;
      this.bg = bakeBg(th, Math.max(320, Math.round(this.W)), Math.max(180, Math.round(this.H)), 1000 + this.eraKey.length * 37);
    },

    /* Юнит получает скелет при рождении */
    makeUnit: function (u, eraKey) {
      var gear = gearOf(eraKey, u.tier);
      u._era = eraKey;
      u._gear = gear;
      u._arch = gear.arch || 'humanoid';
      u._sk = u._arch === 'beast' ? beastSkeleton() : (u._arch === 'machine' ? machineSkeleton() : humanoidSkeleton());
      u._ph = Math.random();
      u._t = Math.random() * 4;
      u._atk = 0; u._hit = 0; u._spawn = 1;
    },
    attack: function (u) { if (u) u._atk = 1; },
    hit: function (u) {
      if (!u) return;
      u._hit = 1;
      var W = this.W, S = this.S;
      spawnParts(W * u.x / 100, this.groundY - 18 * S, 5,
        { col: [255, 170, 90], smin: 40, smax: 130, rmin: 1.2, rmax: 2.6 });
    },
    die: function (u) {
      if (!u) return;
      var W = this.W, S = this.S;
      var pal = PAL[u._era] || PAL.stone;
      var c = [180, 160, 140];
      spawnParts(W * u.x / 100, this.groundY - 16 * S, 14,
        { col: c, smin: 50, smax: 190, rmin: 1.6, rmax: 3.6, up: 60 });
      spawnParts(W * u.x / 100, this.groundY - 14 * S, 6,
        { col: [90, 90, 90], kind: 'smoke', g: -30, rmin: 3, rmax: 7, lmin: 0.5, lmax: 1 });
      void pal;
    },
    boom: function (xPct, big) {
      var W = this.W, S = this.S;
      spawnParts(W * xPct / 100, this.groundY - 20 * S, big ? 26 : 12,
        { col: [255, 190, 90], smin: 60, smax: big ? 260 : 150, rmin: 2, rmax: big ? 5 : 3.4, up: 60 });
      spawnParts(W * xPct / 100, this.groundY - 18 * S, big ? 12 : 5,
        { col: [80, 76, 70], kind: 'smoke', g: -40, rmin: 4, rmax: 9, lmin: 0.6, lmax: 1.2 });
      this.shake = Math.max(this.shake, big ? 1 : 0.5);
    },

    /* Портрет юнита для кнопки магазина */
    thumb: function (eraKey, tier, w, h) {
      var c = mkCanvas(w * 2, h * 2), x = c.getContext('2d');
      x.scale(2, 2);
      var gear = gearOf(eraKey, tier);
      var u = { tier: tier, team: 'p', x: 50, state: null, _t: 0.6, _ph: 0.32, _atk: 0, _hit: 0, _spawn: 0 };
      this.makeUnit(u, eraKey);
      var S = h / 62 * (gear.sc || 1);
      x.save();
      x.translate(w / 2, h - 4);
      x.scale(S, S);
      if (u._arch === 'beast') {
        u._sk.pose({ spine: -4, neck: -22, head: 6, trunk: 62, trunk2: 96,
          fThigh: 84, fShin: 96, bThigh: 96, bShin: 84,
          fThighFar: 90, fShinFar: 92, bThighFar: 90, bShinFar: 88 }, 1, 60);
        u._sk.solve(-8, -22);
        drawBeast(x, u, PAL[eraKey]);
      } else if (u._arch === 'machine') {
        u._sk.pose({ body: 0, arm: gear.kind === 'catapult' ? -110 : -20, legF: 82, legB: 98 }, 1, 60);
        u._sk.solve(-14, -20);
        drawMachine(x, u, PAL[eraKey], gear);
      } else {
        u._sk.pose({ pelvis: -90, torso: -88, neck: -90, head: -92,
          thighF: 88, shinF: 94, footF: 8, thighB: 94, shinB: 98, footB: 6,
          armFU: 74, armFF: 62, armBU: 100, armBF: 122 }, 1, 60);
        u._sk.solve(0, -22);
        drawHumanoid(x, u, PAL[eraKey], gear, 1);
      }
      x.restore();
      return c.toDataURL('image/png');
    },

    /* ---------------- КАДР ---------------- */
    draw: function (dt, S) {
      var ctx = this.ctx;
      if (!ctx) return;
      dt = Math.min(dt || 0, 0.05);
      this.t += dt;
      this.ensureBg();

      var W = this.W, H = this.H, sc = this.S, gy = this.groundY;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 3);
        ctx.translate((Math.random() - 0.5) * this.shake * 8, (Math.random() - 0.5) * this.shake * 6);
      }

      ctx.drawImage(this.bg, 0, 0, W, H);

      // базы
      var eraKey = this.eraKey;
      drawBase(ctx, eraKey, W * 0.085, gy, sc * 1.2, S.pHp / S.pMax, this.t, false);
      drawBase(ctx, eraKey, W * 0.915, gy, sc * 1.2, S.eHp / S.eMax, this.t, true);

      // турели
      var i;
      for (i = 0; i < S.pTurrets.length; i++) {
        if (S.pTurrets[i]) drawTurret(ctx, eraKey, W * S.slotP[i] / 100, gy - (i * 2) * sc, sc, false, this.t, S.pTurrets[i].type);
      }
      for (i = 0; i < S.eTurrets.length; i++) {
        if (S.eTurrets[i]) drawTurret(ctx, eraKey, W * S.slotE[i] / 100, gy - (i * 2) * sc, sc, true, this.t, S.eTurrets[i].type);
      }

      // юниты (дальние — сначала)
      var units = S.units || [];
      var sorted = units.slice().sort(function (a, b) { return (a.tier > b.tier) - (a.tier < b.tier); });
      for (i = 0; i < sorted.length; i++) this.drawUnit(ctx, sorted[i], dt);

      // снаряды
      var pr = S.projectiles || [];
      for (i = 0; i < pr.length; i++) drawProjectile(ctx, pr[i], W, gy, sc);

      updateParts(dt);
      drawParts(ctx);

      // виньетка
      var vg = ctx.createRadialGradient(W / 2, H * 0.6, H * 0.3, W / 2, H * 0.6, H * 1.1);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,8,20,.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },

    drawUnit: function (ctx, u, dt) {
      if (!u._sk) this.makeUnit(u, this.eraKey);
      var gear = u._gear, pal = PAL[u._era] || PAL.stone;
      var sc = this.S * (gear.sc || 1);
      var x = this.W * u.x / 100, gy = this.groundY;

      u._t += dt;
      if (u._atk > 0) u._atk = Math.max(0, u._atk - dt * 2.6);
      if (u._hit > 0) u._hit = Math.max(0, u._hit - dt * 5);
      if (u._spawn > 0) u._spawn = Math.max(0, u._spawn - dt * 2.6);

      if (u._arch === 'beast') poseBeast(u, dt);
      else if (u._arch === 'machine') poseMachine(u, dt, gear);
      else poseHumanoid(u, dt, gear);

      // пыль из-под ног при ходьбе
      if (u.state === 'walking' && Math.random() < 0.05) {
        spawnParts(x - (u.team === 'p' ? 6 : -6) * sc, gy - 1, 1,
          { col: [200, 186, 160], smin: 8, smax: 30, rmin: 1.4, rmax: 3, g: 60, lmin: 0.3, lmax: 0.6, up: 6 });
      }

      shadowUnder(ctx, x, gy + 1, 14 * sc, 0.5);

      ctx.save();
      ctx.translate(x, gy);
      ctx.scale(u.team === 'e' ? -sc : sc, sc);
      if (u._spawn > 0) {
        ctx.globalAlpha = 1 - u._spawn;
        ctx.translate(0, u._spawn * 10);
      }

      if (u._arch === 'beast') {
        u._sk.solve(-10, -20);
        drawBeast(ctx, u, pal);
      } else if (u._arch === 'machine') {
        u._sk.solve(-14, -20);
        drawMachine(ctx, u, pal, gear);
      } else {
        u._sk.solve(0, -22);
        drawHumanoid(ctx, u, pal, gear, sc);
      }
      ctx.restore();

      // полоска здоровья
      var frac = clamp(u.hp / u.maxHp, 0, 1);
      if (frac < 1) {
        var bw = (u.tier === 'd' ? 26 : 18) * this.S;
        var by = gy - (u._arch === 'humanoid' ? 56 : 48) * sc;
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = u.team === 'p' ? '#9be870' : '#ff4d6d';
        ctx.fillRect(x - bw / 2, by, bw * frac, 2);
      }
    }
  };

  global.War = War;
})(window);
