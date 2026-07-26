/* ============================================================
   05 · СКЕЛЕТ: кости, позы, тряпичная физика (плащ/волосы/хвост)
   ------------------------------------------------------------
   Углы — абсолютные (в мировой системе персонажа): 90° = вниз,
   -90° = вверх, 0° = вперёд. Так позы читаются глазами.
   Иерархия нужна только для позиций: ребро крепится к точке
   родителя (attach = доля длины родителя).
   ============================================================ */

class Bone {
  constructor(name, parent, len, w0, w1, opts = {}) {
    this.name = name;
    this.parent = parent;       // имя родителя или null
    this.len = len;
    this.w0 = w0;               // толщина у основания
    this.w1 = w1;               // толщина у конца
    this.attach = opts.attach !== undefined ? opts.attach : 1;
    this.angle = (opts.a || 90) * DEG;
    this.col = opts.col || '#7a8296';
    this.stiff = opts.stiff || 20;  // как быстро кость догоняет целевой угол
    this.x = 0; this.y = 0; this.ex = 0; this.ey = 0;
  }
  pointAt(t) {
    return { x: this.x + (this.ex - this.x) * t, y: this.y + (this.ey - this.y) * t };
  }
}

class Skeleton {
  constructor(defs) {
    this.bones = defs.map((d) => new Bone(d.name, d.parent, d.len, d.w0, d.w1, d));
    this.map = Object.create(null);
    this.bones.forEach((b) => (this.map[b.name] = b));
    this.rootX = 0; this.rootY = 0;
  }

  b(name) { return this.map[name]; }

  /* Плавно ведём кости к целевой позе (углы в градусах) */
  pose(target, dt, mul = 1) {
    for (const k in target) {
      const bone = this.map[k];
      if (!bone) continue;
      bone.angle = angDamp(bone.angle, target[k] * DEG, bone.stiff * mul, dt);
    }
  }

  /* Мгновенно — для телепорта/респауна */
  snap(target) {
    for (const k in target) if (this.map[k]) this.map[k].angle = target[k] * DEG;
  }

  /* Пересчёт мировых позиций костей */
  solve(rootX, rootY) {
    this.rootX = rootX; this.rootY = rootY;
    for (const bone of this.bones) {
      let bx = rootX, by = rootY;
      if (bone.parent) {
        const p = this.map[bone.parent];
        const pt = p.pointAt(bone.attach);
        bx = pt.x; by = pt.y;
      }
      bone.x = bx; bone.y = by;
      bone.ex = bx + Math.cos(bone.angle) * bone.len;
      bone.ey = by + Math.sin(bone.angle) * bone.len;
    }
  }
}

/* ------------------------------------------------------------
   Верле-цепочка: плащ, волосы, хвост, ремни.
   Даёт вторичную анимацию — то, что отличает «живое» от «двигаю картинку».
   ------------------------------------------------------------ */
class Chain {
  constructor(n, segLen, opts = {}) {
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push({ x: 0, y: i * segLen, px: 0, py: i * segLen });
    this.segLen = segLen;
    this.grav = opts.grav !== undefined ? opts.grav : 900;
    this.drag = opts.drag !== undefined ? opts.drag : 0.986;
    this.iter = opts.iter || 5;
    this.stiffTo = opts.stiffTo || null;  // предпочтительное направление (рад), тянет цепь назад
    this.stiffK = opts.stiffK || 0;
  }

  place(x, y) {
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      p.x = p.px = x; p.y = p.py = y + i * this.segLen;
    }
  }

  /* windX/windY — ускорения (px/с²), как и гравитация */
  update(dt, ax, ay, windX = 0, windY = 0) {
    const dt2 = Math.min(dt, 1 / 45);
    for (let i = 1; i < this.pts.length; i++) {
      const p = this.pts[i];
      const vx = (p.x - p.px) * this.drag + windX * dt2 * dt2;
      const vy = (p.y - p.py) * this.drag + (this.grav + windY) * dt2 * dt2;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy;
    }
    // якорь + ограничения длины
    for (let k = 0; k < this.iter; k++) {
      this.pts[0].x = ax; this.pts[0].y = ay;
      for (let i = 0; i < this.pts.length - 1; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - this.segLen) / d * 0.5;
        const mx = dx * diff, my = dy * diff;
        if (i > 0) { a.x += mx; a.y += my; }
        b.x -= mx; b.y -= my;
      }
      // мягкое стремление к «естественному» направлению — плащ не липнет к спине
      if (this.stiffTo !== null && this.stiffK > 0) {
        for (let i = 1; i < this.pts.length; i++) {
          const a = this.pts[i - 1], b = this.pts[i];
          const tx = a.x + Math.cos(this.stiffTo) * this.segLen;
          const ty = a.y + Math.sin(this.stiffTo) * this.segLen;
          b.x = lerp(b.x, tx, this.stiffK);
          b.y = lerp(b.y, ty, this.stiffK);
        }
      }
    }
  }
}

/* ------------------------------------------------------------
   Рисование форм: конечности — не линии, а конусные капсулы
   с градиентом поперёк (свет сверху-слева) и обводкой.
   ------------------------------------------------------------ */
function drawLimb(ctx, x1, y1, x2, y2, w1, w2, colMain, colDark, outline = 'rgba(10,14,26,.55)') {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 0.0001;
  const nx = -dy / len, ny = dx / len;   // нормаль к кости

  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
  // скруглённый кончик
  ctx.arc(x2, y2, w2, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.arc(x1, y1, w1, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
  ctx.closePath();

  const g = ctx.createLinearGradient(x1 + nx * w1, y1 + ny * w1, x1 - nx * w1, y1 - ny * w1);
  g.addColorStop(0, colMain);
  g.addColorStop(0.55, colMain);
  g.addColorStop(1, colDark);
  ctx.fillStyle = g;
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke(); }
}

/* Мягкий блик вдоль кости — «объём» */
function limbHilite(ctx, x1, y1, x2, y2, w, col = 'rgba(255,255,255,.22)') {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, w * 0.42);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w * 0.4, y1 + ny * w * 0.4);
  ctx.lineTo(x2 + nx * w * 0.28, y2 + ny * w * 0.28);
  ctx.stroke();
}

/* Лента по цепочке (хвост зверя): расширяется/сужается по длине */
function drawRibbon(ctx, pts, w0, w1, fill, stroke = null) {
  const n = pts.length;
  if (n < 2) return;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = lerp(w0, w1, i / (n - 1));
    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.1; ctx.stroke(); }
}

/* Тень-эллипс под персонажем (мягкость зависит от высоты полёта) */
function drawShadow(ctx, x, y, w, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, w);
  g.addColorStop(0, 'rgba(0,0,0,.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.32, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
