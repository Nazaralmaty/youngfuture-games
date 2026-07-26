/* ============================================================
   06 · ГЕРОЙ: физика, состояния, процедурная анимация
   ============================================================ */

const HERO = {
  W: 18, H: 42,
  RUN: 250, ACC: 2000, AIR_ACC: 1100, FRICTION: 2600, AIR_DRAG: 400,
  JUMP: 560, JUMP2: 470, MAX_FALL: 900,
  COYOTE: 0.10, CUT: 0.42,
  DASH_V: 520, DASH_T: 0.17, DASH_CD: 0.55,
  ATK_T: 0.30, ATK_CD: 0.34, ATK_HIT_FROM: 0.06, ATK_HIT_TO: 0.20,
  HURT_T: 0.45, INVULN: 1.0,
};

const SKIN = '#eab88f', SKIN_D = '#c68d64';
const TUNIC = '#2fb3a6', TUNIC_D = '#1a7a73';
const PANTS = '#39477a', PANTS_D = '#232c52';
const BOOT = '#6b4526', BOOT_D = '#422914';
const CAPE = '#ff7a45', CAPE_D = '#c9451d';
const HAIR = '#241a2d';

class Hero {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = HERO.W; this.h = HERO.H;
    this.vx = 0; this.vy = 0;
    this.face = 1;
    this.onGround = false; this.wasGround = false;
    this.coyote = 0; this.jumps = 0; this.maxJumps = 2;
    this.hp = 3; this.maxHp = 3;
    this.coins = 0;
    this.state = 'idle';
    this.phase = 0;          // фаза цикла бега
    this.stateT = 0;
    this.dashT = 0; this.dashCd = 0; this.dashDir = 1;
    this.atkT = 0; this.atkCd = 0; this.atkHit = false;
    this.hurtT = 0; this.invuln = 0;
    this.vyPrev = 0; this.dropping = 0; this.carry = null;
    this.hitWall = false; this.hitCeil = false;
    this.rootY = y + 20; this.stretchK = 1;
    this.dead = false; this.won = false;
    this.stepT = 0; this.safeT = 0;
    this.blink = rnd(1.5, 4);
    this.squash = 0;         // сжатие/растяжение при прыжке и приземлении
    this.spawnX = x; this.spawnY = y;

    this.sk = new Skeleton([
      { name: 'pelvis', parent: null, len: 1, w0: 0, w1: 0, a: -90, stiff: 26 },
      { name: 'torso', parent: 'pelvis', attach: 1, len: 15, w0: 7.2, w1: 5.4, a: -90, stiff: 18 },
      { name: 'neck', parent: 'torso', attach: 1, len: 4, w0: 3.2, w1: 3, a: -90, stiff: 16 },
      { name: 'head', parent: 'neck', attach: 1, len: 8, w0: 0, w1: 0, a: -90, stiff: 15 },

      { name: 'armBU', parent: 'torso', attach: 0.84, len: 11, w0: 3.3, w1: 2.7, a: 100, stiff: 20 },
      { name: 'armBF', parent: 'armBU', attach: 1, len: 10, w0: 2.7, w1: 2.1, a: 105, stiff: 22 },
      { name: 'armFU', parent: 'torso', attach: 0.84, len: 11, w0: 3.4, w1: 2.8, a: 80, stiff: 20 },
      { name: 'armFF', parent: 'armFU', attach: 1, len: 10, w0: 2.8, w1: 2.2, a: 85, stiff: 24 },

      { name: 'thighB', parent: 'pelvis', attach: 0, len: 11, w0: 4.3, w1: 3.5, a: 95, stiff: 20 },
      { name: 'shinB', parent: 'thighB', attach: 1, len: 10.5, w0: 3.5, w1: 2.6, a: 95, stiff: 22 },
      { name: 'footB', parent: 'shinB', attach: 1, len: 6.5, w0: 2.9, w1: 2.2, a: 5, stiff: 24 },
      { name: 'thighF', parent: 'pelvis', attach: 0, len: 11, w0: 4.4, w1: 3.6, a: 88, stiff: 20 },
      { name: 'shinF', parent: 'thighF', attach: 1, len: 10.5, w0: 3.6, w1: 2.7, a: 88, stiff: 22 },
      { name: 'footF', parent: 'shinF', attach: 1, len: 6.5, w0: 3.0, w1: 2.3, a: 5, stiff: 24 },
    ]);

    this.cape = new Chain(6, 4.6, { grav: 1500, drag: 0.9, iter: 6 });
    this.hair = [new Chain(4, 2.8, { grav: 900, drag: 0.86, iter: 4 }),
                 new Chain(4, 2.5, { grav: 850, drag: 0.86, iter: 4 }),
                 new Chain(3, 2.3, { grav: 800, drag: 0.86, iter: 4 })];
    this.cape.place(0, 0);
    this.hair.forEach((h) => h.place(0, 0));
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  respawn(x, y) {
    this.x = x; this.y = y; this.vx = this.vy = 0;
    this.dead = false; this.hurtT = 0; this.invuln = 1.2;
    this.state = 'idle'; this.dashT = 0; this.atkT = 0;
    this.cape.place(this.cx, this.y + 12);
    this.hair.forEach((h) => h.place(this.cx, this.y + 6));
  }

  hurt(dmg, fromX) {
    if (this.invuln > 0 || this.dead || this.won) return false;
    this.hp -= dmg;
    this.invuln = HERO.INVULN;
    this.hurtT = HERO.HURT_T;
    this.state = 'hurt';
    const dir = sign(this.cx - fromX) || -this.face;
    this.vx = dir * 210;
    this.vy = -240;
    this.onGround = false;
    Cam.shake(0.9);
    FX.spark(this.cx, this.cy, 12, [255, 120, 110]);
    FX.text(this.cx, this.y - 6, '-1', '#ff6b6b', 15);
    Sfx.play('hurt');
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.state = 'dead';
    this.stateT = 0;
    this.vy = -320;
    Sfx.play('die');
    FX.smoke(this.cx, this.cy, 14, [120, 90, 160]);
    Cam.shake(1.2);
  }

  /* ---------------- обновление ---------------- */
  update(dt, world) {
    this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.blink -= dt;
    if (this.blink < -0.14) this.blink = rnd(1.8, 4.5);

    if (this.dead) {
      this.vy = Math.min(this.vy + GRAVITY * dt, HERO.MAX_FALL);
      this.y += this.vy * dt;
      this.animate(dt);
      return;
    }
    if (this.won) {
      this.vx = damp(this.vx, 0, 8, dt);
      if (!this.onGround) this.vy = Math.min(this.vy + GRAVITY * dt, HERO.MAX_FALL);
      world.moveActor(this, dt);
      this.animate(dt);
      return;
    }

    const ax = Input.axisX;
    const control = this.hurtT <= 0 && this.dashT <= 0;

    /* --- рывок --- */
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashDir * HERO.DASH_V;
      this.vy = 0;
      this.invuln = Math.max(this.invuln, 0.05);
      if (Math.random() < 0.6) FX.glow(this.cx - this.dashDir * 8, this.cy + rnd(-10, 10), [120, 235, 255]);
      if (this.dashT <= 0) this.vx *= 0.45;
    } else if (Input.consumeDash() && this.dashCd <= 0 && control) {
      this.dashT = HERO.DASH_T;
      this.dashCd = HERO.DASH_CD;
      this.dashDir = ax !== 0 ? sign(ax) : this.face;
      this.face = this.dashDir;
      this.state = 'dash';
      Sfx.play('dash');
      FX.ring(this.cx, this.cy, [140, 240, 255], 4, 34, 0.3);
      Cam.shake(0.35);
    }

    /* --- горизонталь --- */
    if (control) {
      if (ax !== 0) {
        const acc = this.onGround ? HERO.ACC : HERO.AIR_ACC;
        this.vx = approach(this.vx, ax * HERO.RUN, acc * dt);
        this.face = sign(ax);
      } else {
        const fr = this.onGround ? HERO.FRICTION : HERO.AIR_DRAG;
        this.vx = approach(this.vx, 0, fr * dt);
      }
    }

    /* --- прыжок --- */
    if (this.onGround) { this.coyote = HERO.COYOTE; this.jumps = this.maxJumps; }
    else this.coyote = Math.max(0, this.coyote - dt);

    if (control && Input.consumeJump()) {
      if (this.coyote > 0 || this.jumps === this.maxJumps) {
        this.vy = -HERO.JUMP;
        this.jumps = this.maxJumps - 1;
        this.coyote = 0; this.onGround = false;
        this.squash = -1;
        Sfx.play('jump');
        FX.dust(this.cx, this.y + this.h, 7, 55, 30);
      } else if (this.jumps > 0) {
        this.vy = -HERO.JUMP2;
        this.jumps--;
        this.squash = -1;
        Sfx.play('jump');
        FX.ring(this.cx, this.y + this.h - 4, [140, 255, 220], 3, 26, 0.28);
        FX.glow(this.cx, this.y + this.h - 6, [140, 255, 220], 6);
      }
    }
    // короткое нажатие — низкий прыжок
    if (!Input.jumpHeld && this.vy < -140) this.vy += HERO.JUMP * HERO.CUT * dt * 9;

    /* --- атака --- */
    if (this.atkT > 0) {
      this.atkT -= dt;
      if (this.atkT <= 0) this.atkHit = false;
    } else if (control && Input.consumeAttack() && this.atkCd <= 0) {
      this.atkT = HERO.ATK_T;
      this.atkCd = HERO.ATK_CD;
      this.atkHit = false;
      this.state = 'attack';
      Sfx.play('swing');
      if (this.onGround) this.vx += this.face * 60;
    }

    /* --- гравитация и движение --- */
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.dashT <= 0) this.vy = Math.min(this.vy + GRAVITY * dt, HERO.MAX_FALL);

    this.wasGround = this.onGround;
    world.moveActor(this, dt);

    if (!this.wasGround && this.onGround) {
      const impact = clamp(this.vyPrev / 700, 0, 1.4);
      this.squash = clamp(impact, 0.25, 1);
      if (impact > 0.28) { Sfx.play('land'); FX.dust(this.cx, this.y + this.h, 5 + impact * 6, 60, 26); }
      if (impact > 0.9) Cam.shake(0.4);
    }
    this.vyPrev = this.vy;

    /* --- запоминаем безопасную точку: смерть не отбрасывает в начало --- */
    if (this.onGround && !this.carry && this.hurtT <= 0 && Math.abs(this.vy) < 20) {
      this.safeT += dt;
      if (this.safeT > 0.3 && world.isSafeSpot(this.cx, this.y + this.h - 2)) {
        this.spawnX = this.x; this.spawnY = this.y - 4;
        this.safeT = 0;
      }
    } else this.safeT = 0;

    /* --- шаги --- */
    if (this.onGround && Math.abs(this.vx) > 40) {
      this.stepT -= dt * Math.abs(this.vx) / 130;
      if (this.stepT <= 0) {
        this.stepT = 0.5;
        Sfx.play('step');
        FX.dust(this.cx - this.face * 4, this.y + this.h - 1, 2, 22, 14);
      }
    }

    /* --- состояние --- */
    const prev = this.state;
    if (this.hurtT > 0) this.state = 'hurt';
    else if (this.dashT > 0) this.state = 'dash';
    else if (this.atkT > 0) this.state = 'attack';
    else if (!this.onGround) this.state = this.vy < -40 ? 'jump' : 'fall';
    else if (Math.abs(this.vx) > 26) this.state = 'run';
    else this.state = 'idle';
    if (prev !== this.state) this.stateT = 0;

    this.squash = damp(this.squash, 0, 9, dt);
    this.animate(dt);
  }

  /* Прямоугольник удара — используется миром для проверки попаданий */
  attackBox() {
    if (this.atkT <= 0) return null;
    const p = 1 - this.atkT / HERO.ATK_T;
    if (p < HERO.ATK_HIT_FROM / HERO.ATK_T || p > HERO.ATK_HIT_TO / HERO.ATK_T + 0.35) return null;
    const w = 34, h = 34;
    return { x: this.face > 0 ? this.x + this.w - 4 : this.x - w + 4, y: this.y + 2, w, h };
  }

  /* ---------------- анимация ---------------- */
  animate(dt) {
    const spd = Math.abs(this.vx);
    const t = this.stateT;
    let P = {};

    if (this.state === 'run') {
      this.phase = (this.phase + dt * (1.05 + spd / 240) * 1.55) % 1;
      const a = this.phase * TAU;
      const lean = -90 + 11 + Math.sin(a * 2) * 1.6;
      const sw = 40 + spd / 22;
      P = {
        pelvis: -90,
        torso: lean,
        neck: -92 + Math.sin(a * 2 + 1) * 2,
        head: -95 + Math.sin(a * 2) * 2,
        thighF: 90 + Math.sin(a) * sw,
        shinF: 90 + Math.sin(a) * sw + 22 + Math.max(0, Math.sin(a + 1.1)) * 52,
        footF: 12 + Math.sin(a + 2.4) * 26,
        thighB: 90 + Math.sin(a + Math.PI) * sw,
        shinB: 90 + Math.sin(a + Math.PI) * sw + 22 + Math.max(0, Math.sin(a + Math.PI + 1.1)) * 52,
        footB: 12 + Math.sin(a + Math.PI + 2.4) * 26,
        armFU: 92 - Math.sin(a) * 34,
        armFF: 92 - Math.sin(a) * 34 + 34 + Math.max(0, -Math.sin(a)) * 26,
        armBU: 92 - Math.sin(a + Math.PI) * 34,
        armBF: 92 - Math.sin(a + Math.PI) * 34 + 34 + Math.max(0, -Math.sin(a + Math.PI)) * 26,
      };
    } else if (this.state === 'idle') {
      const b = Math.sin(t * 2.2);
      P = {
        pelvis: -90, torso: -90 + 3 + b * 1.2, neck: -90 - b * 1.5, head: -92 - b * 1.6,
        thighF: 92, shinF: 96, footF: 8,
        thighB: 87, shinB: 92, footB: 6,
        armFU: 100 + b * 3, armFF: 134 + b * 5,
        armBU: 94 + b * 3, armBF: 116 + b * 5,
      };
    } else if (this.state === 'jump') {
      const k = clamp(t * 6, 0, 1);
      P = {
        pelvis: -90, torso: -90 - 6, neck: -88, head: -90,
        thighF: 58, shinF: 128, footF: 34,
        thighB: 96, shinB: 118, footB: 24,
        armFU: 34, armFF: 8, armBU: 128, armBF: 150,
      };
      void k;
    } else if (this.state === 'fall') {
      const b = Math.sin(t * 8) * 3;
      P = {
        pelvis: -90, torso: -90 + 6, neck: -94, head: -96,
        thighF: 74 + b, shinF: 104 + b, footF: 20,
        thighB: 104 - b, shinB: 122 - b, footB: 16,
        armFU: 22 + b, armFF: -8 + b, armBU: 40 - b, armBF: 6 - b,
      };
    } else if (this.state === 'dash') {
      P = {
        pelvis: -90, torso: -90 + 26, neck: -78, head: -80,
        thighF: 48, shinF: 62, footF: 30,
        thighB: 118, shinB: 138, footB: 40,
        armFU: 8, armFF: -6, armBU: 150, armBF: 168,
      };
    } else if (this.state === 'attack') {
      const p = 1 - this.atkT / HERO.ATK_T;      // 0..1
      const swing = p < 0.28
        ? lerp(-130, -160, easeOutCubic(p / 0.28))          // замах
        : lerp(-160, 62, easeOutCubic(clamp((p - 0.28) / 0.42, 0, 1))); // удар
      const rec = p > 0.7 ? easeOutCubic((p - 0.7) / 0.3) : 0;
      P = {
        pelvis: -90,
        torso: -90 + (p < 0.28 ? -8 : 16) - rec * 10,
        neck: -90, head: -92,
        thighF: 84, shinF: 96, footF: 8,
        thighB: 96, shinB: 104, footB: 6,
        armFU: swing, armFF: swing + (p < 0.28 ? -34 : 14),
        armBU: 128 - rec * 20, armBF: 150,
      };
    } else if (this.state === 'hurt') {
      P = {
        pelvis: -90, torso: -90 - 22, neck: -70, head: -66,
        thighF: 62, shinF: 96, footF: 0,
        thighB: 112, shinB: 132, footB: 0,
        armFU: 6, armFF: -30, armBU: 46, armBF: 10,
      };
    } else if (this.state === 'dead') {
      P = {
        pelvis: -90, torso: -90 - 40, neck: -50, head: -40,
        thighF: 40, shinF: 70, footF: -10,
        thighB: 130, shinB: 150, footB: -10,
        armFU: -20, armFF: -60, armBU: 20, armBF: -20,
      };
    }

    const mul = this.state === 'attack' || this.state === 'dash' ? 2.2 : 1;
    this.sk.pose(P, dt, mul);

    /* Корень скелета: таз + приседание/растяжка */
    const sq = this.squash;
    const stretch = sq < 0 ? -sq : 0;         // в прыжке — вытягивание
    const crouch = sq > 0 ? sq : 0;           // при приземлении — приседание
    const rootX = this.cx;
    const rootY = this.y + 20 + crouch * 5 - stretch * 2
      + (this.state === 'run' ? Math.sin(this.phase * TAU * 2) * 1.6 : 0);
    this.sk.solve(rootX, rootY);
    this.rootY = rootY;
    this.stretchK = 1 + stretch * 0.16 - crouch * 0.14;

    /* Вторичная анимация: плащ и волосы */
    const torso = this.sk.b('torso');
    const anchor = torso.pointAt(0.86);
    // ветер: назад по ходу движения + отдача от вертикальной скорости
    const wind = -this.face * (900 + Math.abs(this.vx) * 26) - this.vx * 22;
    const lift = -Math.min(0, this.vy) * 24;
    this.cape.update(dt, anchor.x, anchor.y, wind, -lift);
    const head = this.sk.b('head');
    const hx = head.x, hy = head.y;
    this.hair.forEach((h, i) => {
      h.update(dt, hx - this.face * (1 + i * 1.5), hy - 3 + i * 1.4,
        wind * 0.5, -lift * 0.6);
    });

  }

  /* ---------------- отрисовка ---------------- */
  draw(ctx) {
    const s = this.sk;

    // тень на земле
    const groundY = this.y + this.h;
    drawShadow(ctx, this.cx, groundY + 1, 13, this.onGround ? 0.55 : 0.28);

    ctx.save();
    // мигание при неуязвимости
    if (this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0 && !this.dead) ctx.globalAlpha = 0.35;

    // зеркалим всё тело относительно таза
    ctx.translate(this.cx, this.rootY);
    ctx.scale(this.face, 1);
    ctx.scale(1 / (this.stretchK || 1) * 1, this.stretchK || 1);
    ctx.translate(-this.cx, -this.rootY);

    this._drawCape(ctx);
    this._drawLeg(ctx, 'thighB', 'shinB', 'footB', true);
    this._drawArm(ctx, 'armBU', 'armBF', true);
    this._drawTorso(ctx);
    this._drawLeg(ctx, 'thighF', 'shinF', 'footF', false);
    this._drawHead(ctx);
    this._drawArm(ctx, 'armFU', 'armFF', false);
    this._drawSword(ctx);

    ctx.restore();
    void s;
  }

  _drawCape(ctx) {
    const p = this.cape.pts;
    const n = p.length;
    const t = performance.now() / 1000;
    // ткань: у шеи узкая, к низу расширяется, край идёт волной
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const k = i / (n - 1);
      const w = lerp(3.6, 9.5, k) + Math.sin(t * 7 + i * 1.3) * 1.4 * k;
      const w2 = lerp(3.6, 8.2, k) - Math.sin(t * 7 + i * 1.3 + 0.9) * 1.4 * k;
      left.push({ x: p[i].x + nx * w, y: p[i].y + ny * w });
      right.push({ x: p[i].x - nx * w2, y: p[i].y - ny * w2 });
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    const g = ctx.createLinearGradient(p[0].x, p[0].y, p[n - 1].x, p[n - 1].y);
    g.addColorStop(0, CAPE); g.addColorStop(0.6, CAPE_D); g.addColorStop(1, '#9c3616');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,26,.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // складки
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    for (let s = 1; s <= 2; s++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const k = s / 3;
        const x = lerp(left[i].x, right[i].x, k), y = lerp(left[i].y, right[i].y, k);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // застёжка
    ctx.fillStyle = '#ffce4a';
    ctx.beginPath(); ctx.arc(p[0].x, p[0].y, 2.4, 0, TAU); ctx.fill();
  }

  /* Сустав — кружок в месте стыка костей. Без него конечности «расползаются». */
  _joint(ctx, x, y, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  _drawLeg(ctx, tn, sn, fn, back) {
    const t = this.sk.b(tn), s = this.sk.b(sn), f = this.sk.b(fn);
    const p = back ? PANTS_D : PANTS, pd = back ? '#1a2143' : PANTS_D;
    const b = back ? '#4d3119' : BOOT, bd = back ? '#33200f' : BOOT_D;

    drawLimb(ctx, t.x, t.y, t.ex, t.ey, t.w0, t.w1, p, pd, null);
    this._joint(ctx, t.ex, t.ey, s.w0 * 1.02, p);          // колено
    drawLimb(ctx, s.x, s.y, s.ex, s.ey, s.w0, s.w1, p, pd, null);

    // сапог: голенище, подошва, носок
    ctx.save();
    ctx.translate(s.ex, s.ey);
    ctx.rotate(f.angle);
    const L = f.len;
    ctx.beginPath();
    ctx.moveTo(-3.2, -4.2);
    ctx.lineTo(L - 1, -3.2);
    ctx.quadraticCurveTo(L + 2.2, -2.4, L + 2.4, 1.2);     // носок
    ctx.lineTo(L + 1.8, 2.8);
    ctx.lineTo(-3.6, 2.8);
    ctx.quadraticCurveTo(-4.6, 0, -3.2, -4.2);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -4, 0, 3);
    g.addColorStop(0, b); g.addColorStop(1, bd);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,26,.5)'; ctx.lineWidth = 1; ctx.stroke();
    // подошва
    ctx.fillStyle = back ? '#20150a' : '#2c1c0d';
    ctx.fillRect(-3.6, 1.9, L + 5.4, 1.5);
    // манжета
    ctx.fillStyle = back ? '#5b3a1e' : '#8a5a2e';
    ctx.fillRect(-3.4, -4.6, 5.2, 2.6);
    ctx.restore();
  }

  _drawArm(ctx, un, fnm, back) {
    const u = this.sk.b(un), f = this.sk.b(fnm);
    const c = back ? TUNIC_D : TUNIC, cd = back ? '#13605b' : TUNIC_D;
    const sk = back ? SKIN_D : SKIN, skd = back ? '#a9754f' : SKIN_D;

    drawLimb(ctx, u.x, u.y, u.ex, u.ey, u.w0, u.w1, c, cd, null);
    this._joint(ctx, u.x, u.y, u.w0 * 1.05, c);            // плечо
    // манжета рукава на локте
    this._joint(ctx, u.ex, u.ey, u.w1 * 1.15, cd);
    drawLimb(ctx, f.x, f.y, f.ex, f.ey, f.w0, f.w1, sk, skd, null);
    // кисть
    this._joint(ctx, f.ex, f.ey, 2.8, sk);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.arc(f.ex, f.ey + 0.6, 2.8, 0.2, Math.PI - 0.2); ctx.fill();
    if (!back) limbHilite(ctx, u.x, u.y, u.ex, u.ey, u.w0, 'rgba(255,255,255,.14)');
  }

  _drawTorso(ctx) {
    const t = this.sk.b('torso');
    const dx = t.ex - t.x, dy = t.ey - t.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    // туника — трапеция плечи/пояс
    const pts = [
      { x: t.x + nx * 5.6, y: t.y + ny * 5.6 },
      { x: t.ex + nx * 7.4, y: t.ey + ny * 7.4 },
      { x: t.ex + nx * 2, y: t.ey + ny * 2 - 1.5 },
      { x: t.ex - nx * 7.4, y: t.ey - ny * 7.4 },
      { x: t.x - nx * 5.6, y: t.y - ny * 5.6 },
    ];
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.quadraticCurveTo(t.x + nx * 7.6 + dx * 0.4, t.y + ny * 7.6 + dy * 0.4, pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.quadraticCurveTo(t.x - nx * 7.6 + dx * 0.4, t.y - ny * 7.6 + dy * 0.4, pts[4].x, pts[4].y);
    ctx.closePath();
    const g = ctx.createLinearGradient(t.x + nx * 8, t.y + ny * 8, t.x - nx * 8, t.y - ny * 8);
    g.addColorStop(0, '#3fd0c1'); g.addColorStop(0.5, TUNIC); g.addColorStop(1, TUNIC_D);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,26,.5)'; ctx.lineWidth = 1.1; ctx.stroke();

    // пояс
    const belt = t.pointAt(0.14);
    ctx.save();
    ctx.translate(belt.x, belt.y);
    ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    ctx.fillStyle = '#7a4a22'; ctx.fillRect(-6.4, -2.2, 12.8, 4.4);
    ctx.fillStyle = '#ffce4a'; ctx.fillRect(-2, -2.6, 4, 5.2);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-1.2, -1.8, 1.2, 3.6);
    ctx.restore();

    // воротник
    const col = t.pointAt(0.94);
    ctx.fillStyle = '#ffce4a';
    ctx.beginPath(); ctx.ellipse(col.x, col.y, 4.2, 2.2, Math.atan2(dy, dx), 0, TAU); ctx.fill();
  }

  _drawHead(ctx) {
    const n = this.sk.b('neck'), h = this.sk.b('head');
    // шея
    drawLimb(ctx, n.x, n.y, n.ex, n.ey, 2.8, 2.6, SKIN_D, '#a9754f', null);

    const cx = h.x + (h.ex - h.x) * 0.42;
    const cy = h.y + (h.ey - h.y) * 0.42;
    const ang = h.angle + Math.PI / 2;

    // пряди-верле рисуем ДО головы — они за затылком, а не поверх лица
    ctx.save();
    ctx.strokeStyle = HAIR; ctx.lineCap = 'round';
    this.hair.forEach((ch, i) => {
      ctx.lineWidth = 3.4 - i * 0.7;
      ctx.beginPath();
      ch.pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);

    // волосы сзади
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.ellipse(-1.4, -0.6, 7.6, 8, 0, 0, TAU); ctx.fill();

    // голова
    const g = ctx.createLinearGradient(-6, -6, 6, 6);
    g.addColorStop(0, '#f6cba3'); g.addColorStop(0.6, SKIN); g.addColorStop(1, SKIN_D);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -7.4);
    ctx.quadraticCurveTo(6.6, -7, 6.6, -0.6);
    ctx.quadraticCurveTo(6.6, 5.4, 2.4, 7.2);   // подбородок
    ctx.quadraticCurveTo(-2, 8, -5.4, 5.2);
    ctx.quadraticCurveTo(-7.2, 2, -6.6, -2.4);
    ctx.quadraticCurveTo(-6, -7.2, 0, -7.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,26,.4)'; ctx.lineWidth = 1; ctx.stroke();

    // ухо
    ctx.fillStyle = SKIN_D;
    ctx.beginPath(); ctx.ellipse(-3.6, 1.2, 1.5, 2.1, 0, 0, TAU); ctx.fill();

    // чёлка
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(-6.8, -2.2);
    ctx.quadraticCurveTo(-6.4, -8.6, 0.6, -8);
    ctx.quadraticCurveTo(6.4, -7.4, 6.2, -2.6);
    ctx.quadraticCurveTo(4.4, -5.6, 1.6, -4.4);
    ctx.quadraticCurveTo(-1.6, -3, -3.4, -5.4);
    ctx.quadraticCurveTo(-4.6, -3.4, -6.8, -2.2);
    ctx.closePath(); ctx.fill();

    // глаз (профиль ¾)
    const blinking = this.blink < 0;
    const shut = this.dead || blinking;
    ctx.fillStyle = '#fff';
    if (!shut) {
      ctx.beginPath(); ctx.ellipse(2.9, -0.6, 2.1, 2.3, 0, 0, TAU); ctx.fill();
      const look = clamp(this.vx / 300, -0.6, 0.6);
      ctx.fillStyle = '#20304e';
      ctx.beginPath(); ctx.arc(3.3 + look, -0.4, 1.15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(3.7 + look, -1.1, 0.42, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(1.4, -0.4); ctx.lineTo(4.4, -0.4); ctx.stroke();
    }

    // бровь — характер по состоянию
    const brow = this.state === 'attack' || this.state === 'hurt' ? -1.2
      : this.state === 'run' || this.state === 'dash' ? -0.6 : 0;
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1.3, -3.6 + brow * 0.4);
    ctx.lineTo(4.8, -4.2 - brow);
    ctx.stroke();

    // рот
    ctx.strokeStyle = '#8a4a3a'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (this.state === 'attack') { ctx.moveTo(2.4, 3.6); ctx.quadraticCurveTo(3.8, 5.4, 5.2, 3.4); }
    else if (this.state === 'hurt' || this.dead) { ctx.moveTo(2.6, 4.4); ctx.quadraticCurveTo(4, 2.8, 5.4, 4.2); }
    else { ctx.moveTo(2.6, 3.8); ctx.quadraticCurveTo(4, 4.8, 5.4, 3.6); }
    ctx.stroke();

    ctx.restore();
  }

  _drawSword(ctx) {
    const f = this.sk.b('armFF');
    const ang = f.angle;
    ctx.save();
    ctx.translate(f.ex, f.ey);
    ctx.rotate(ang);

    // рукоять
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(-1.6, -1.5, 6, 3);
    // гарда
    ctx.fillStyle = '#ffce4a';
    ctx.fillRect(4, -3.6, 2.2, 7.2);
    // клинок
    const g = ctx.createLinearGradient(0, -2, 0, 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#d7deec'); g.addColorStop(1, '#8b96ad');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(5.6, -2.1); ctx.lineTo(17, -1.3); ctx.lineTo(21, 0); ctx.lineTo(17, 1.3); ctx.lineTo(5.6, 2.1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20,26,40,.45)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(6.5, -0.4); ctx.lineTo(17, -0.2); ctx.stroke();
    ctx.restore();

    // светящаяся дуга удара
    if (this.atkT > 0) {
      const p = 1 - this.atkT / HERO.ATK_T;
      if (p > 0.2 && p < 0.75) {
        const k = 1 - Math.abs((p - 0.45) / 0.3);
        const shoulder = this.sk.b('armFU');
        ctx.save();
        ctx.translate(shoulder.x, shoulder.y);
        ctx.strokeStyle = rgba(255, 255, 255, 0.5 * k);
        ctx.lineWidth = 5 * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 27, -2.1 + p * 2.6, -1.6 + p * 3.0);
        ctx.stroke();
        ctx.strokeStyle = rgba(140, 230, 255, 0.75 * k);
        ctx.lineWidth = 2 * k;
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
