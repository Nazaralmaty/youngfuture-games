/* ============================================================
   04 · КАМЕРА, ЧАСТИЦЫ, ВСПЛЫВАЮЩИЙ ТЕКСТ
   ============================================================ */

const Cam = {
  x: 0, y: 0, w: 640, h: VIEW_H,
  shakeT: 0, shakeAmp: 0, ox: 0, oy: 0,
  bounds: { w: 4000, h: 720 },

  reset(x, y) { this.x = x; this.y = y; this.shakeT = 0; this.ox = this.oy = 0; },
  shake(amp, t = 0.28) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = Math.max(this.shakeT, t); },

  follow(t, dt) {
    // взгляд вперёд по направлению бега + чуть вниз при падении
    const look = t.face * 46 * clamp(Math.abs(t.vx) / 220, 0, 1);
    const tx = t.x + t.w / 2 + look - this.w / 2;
    const ty = t.y + t.h / 2 - this.h * 0.55 + clamp(t.vy * 0.09, -40, 60);
    this.x = damp(this.x, tx, 6.5, dt);
    this.y = damp(this.y, ty, 5.0, dt);
    this.x = clamp(this.x, 0, Math.max(0, this.bounds.w - this.w));
    this.y = clamp(this.y, -60, Math.max(0, this.bounds.h - this.h));

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) * this.shakeAmp;
      this.ox = (Math.random() - 0.5) * k * 20;
      this.oy = (Math.random() - 0.5) * k * 20;
      if (this.shakeT <= 0) { this.shakeAmp = 0; this.ox = this.oy = 0; }
    }
  },

  get px() { return Math.round(this.x + this.ox); },
  get py() { return Math.round(this.y + this.oy); },
};

/* ------------------------------------------------------------ */

const FX = {
  parts: [],
  texts: [],
  MAX: 420,

  reset() { this.parts.length = 0; this.texts.length = 0; },

  _add(p) {
    if (this.parts.length > this.MAX) this.parts.shift();
    this.parts.push(p);
  },

  /* Пыль из-под ног, при приземлении */
  dust(x, y, n = 6, spread = 40, up = 40) {
    for (let i = 0; i < n; i++) this._add({
      t: 'dust', x, y, vx: rnd(-spread, spread), vy: rnd(-up, -up * 0.2),
      life: rnd(0.3, 0.6), age: 0, r: rnd(1.6, 3.8), g: 240,
      col: [206, 188, 158],
    });
  },

  /* Искры от удара по врагу / металлу */
  spark(x, y, n = 10, col = [255, 214, 110]) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU), s = rnd(70, 300);
      this._add({ t: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: rnd(0.2, 0.5), age: 0, r: rnd(1.2, 2.6), g: 700, col });
    }
  },

  /* Дым/тень — для теневых врагов */
  smoke(x, y, n = 8, col = [70, 50, 110]) {
    for (let i = 0; i < n; i++) this._add({
      t: 'smoke', x: x + rnd(-6, 6), y: y + rnd(-6, 6),
      vx: rnd(-30, 30), vy: rnd(-60, -14), life: rnd(0.5, 1.1), age: 0,
      r: rnd(6, 16), g: -30, col,
    });
  },

  /* Осколки — разлетаются с вращением (двери, ящики) */
  shard(x, y, n = 12, col = [150, 120, 80]) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU), s = rnd(80, 260);
      this._add({ t: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
        life: rnd(0.6, 1.2), age: 0, r: rnd(3, 7), g: 900, rot: rnd(TAU), vr: rnd(-14, 14), col });
    }
  },

  /* Кольцо ударной волны */
  ring(x, y, col = [255, 255, 255], r0 = 6, r1 = 60, life = 0.34) {
    this._add({ t: 'ring', x, y, vx: 0, vy: 0, life, age: 0, r: r0, r1, g: 0, col });
  },

  /* Огонёк-искорка (порталы, монеты) */
  glow(x, y, col = [255, 210, 90], n = 1) {
    for (let i = 0; i < n; i++) this._add({
      t: 'glow', x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: rnd(-18, 18), vy: rnd(-46, -12),
      life: rnd(0.4, 0.9), age: 0, r: rnd(1.6, 3.4), g: -10, col,
    });
  },

  text(x, y, str, col = '#ffd54a', size = 13) {
    this.texts.push({ x, y, str, col, size, age: 0, life: 1.0, vy: -46 });
  },

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      if (p.t === 'ring') continue;
      p.vy += p.g * dt;
      p.vx *= (1 - 1.6 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt; t.y += t.vy * dt; t.vy *= (1 - 2.2 * dt);
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
  },

  draw(ctx) {
    for (const p of this.parts) {
      const k = 1 - p.age / p.life;
      const [r, g, b] = p.col;
      if (p.t === 'ring') {
        const rr = lerp(p.r, p.r1, easeOutCubic(1 - k));
        ctx.strokeStyle = rgba(r, g, b, k * 0.75);
        ctx.lineWidth = 1 + k * 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
      } else if (p.t === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = rgba(r, g, b, k);
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.7);
        ctx.restore();
      } else if (p.t === 'smoke') {
        ctx.fillStyle = rgba(r, g, b, k * 0.4);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.4 - k * 0.5), 0, TAU); ctx.fill();
      } else if (p.t === 'spark' || p.t === 'glow') {
        ctx.fillStyle = rgba(r, g, b, k);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + 0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(255, 255, 255, k * 0.6);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k * 0.45, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = rgba(r, g, b, k * 0.38);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - k) * 0.6), 0, TAU); ctx.fill();
      }
    }
  },

  drawTexts(ctx) {
    for (const t of this.texts) {
      const k = 1 - t.age / t.life;
      ctx.save();
      ctx.globalAlpha = clamp(k * 1.6, 0, 1);
      ctx.font = `900 ${t.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,12,26,.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  },
};
