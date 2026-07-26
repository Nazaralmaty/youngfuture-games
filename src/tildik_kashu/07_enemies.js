/* ============================================================
   07 · ВРАГИ: у каждого свой скелет и свой цикл движения
   ============================================================ */

class Enemy {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.face = -1;
    this.onGround = false;
    this.hp = 2; this.maxHp = 2;
    this.dead = false; this.remove = false;
    this.hurtT = 0; this.deadT = 0;
    this.t = rnd(0, 10);
    this.type = 'enemy';
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  hurtBox() { return this.dead ? null : { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 4 }; }
  bodyBox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  takeHit(dir, dmg = 1) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.hurtT = 0.22;
    this.vx = dir * 190;
    this.vy = -150;
    Sfx.play('hit');
    Cam.shake(0.5);
    FX.spark(this.cx, this.cy, 12, [255, 200, 120]);
    FX.smoke(this.cx, this.cy, 6, this.smokeCol || [90, 60, 140]);
    if (this.hp <= 0) {
      this.dead = true; this.deadT = 0;
      FX.smoke(this.cx, this.cy, 22, this.smokeCol || [90, 60, 140]);
      FX.ring(this.cx, this.cy, [180, 140, 255], 6, 52, 0.45);
      FX.text(this.cx, this.y - 4, '+50', '#a78bfa', 13);
      Sfx.play('die');
    }
    return true;
  }
}

/* ------------------------------------------------------------
   КӨЛЕҢКЕ — четвероногая тень. Диагональная походка, верле-хвост.
   ------------------------------------------------------------ */
class ShadowBeast extends Enemy {
  constructor(x, y, opts = {}) {
    const sc = opts.scale || 1;
    super(x, y, 34 * sc, 24 * sc);
    this.type = 'beast';
    this.scale = sc;
    this.isBoss = !!opts.boss;
    this.hp = this.maxHp = this.isBoss ? 8 : 2;
    this.speed = (this.isBoss ? 84 : 62) * (0.9 + rnd(0.2));
    this.chargeSpeed = this.isBoss ? 250 : 185;
    this.state = 'walk';
    this.stateT = 0;
    this.phase = rnd(0, 1);
    this.smokeCol = [86, 58, 140];
    this.homeX = x;

    const S = sc;
    this.sk = new Skeleton([
      { name: 'spine', parent: null, len: 24 * S, w0: 10 * S, w1: 8 * S, a: 0, stiff: 14 },
      { name: 'neck', parent: 'spine', attach: 1, len: 8 * S, w0: 6 * S, w1: 5 * S, a: -34, stiff: 14 },
      { name: 'head', parent: 'neck', attach: 1, len: 10 * S, w0: 5.5 * S, w1: 3 * S, a: 6, stiff: 16 },
      // дальняя пара (рисуется первой, темнее)
      { name: 'fThighFar', parent: 'spine', attach: 0.86, len: 9 * S, w0: 3.4 * S, w1: 2.8 * S, a: 84, stiff: 22 },
      { name: 'fShinFar', parent: 'fThighFar', attach: 1, len: 9 * S, w0: 2.8 * S, w1: 2 * S, a: 96, stiff: 24 },
      { name: 'bThighFar', parent: 'spine', attach: 0.14, len: 10 * S, w0: 4 * S, w1: 3 * S, a: 96, stiff: 22 },
      { name: 'bShinFar', parent: 'bThighFar', attach: 1, len: 9 * S, w0: 3 * S, w1: 2 * S, a: 84, stiff: 24 },
      // ближняя пара
      { name: 'fThigh', parent: 'spine', attach: 0.86, len: 9 * S, w0: 3.6 * S, w1: 3 * S, a: 84, stiff: 22 },
      { name: 'fShin', parent: 'fThigh', attach: 1, len: 9 * S, w0: 3 * S, w1: 2.2 * S, a: 96, stiff: 24 },
      { name: 'bThigh', parent: 'spine', attach: 0.14, len: 10 * S, w0: 4.2 * S, w1: 3.2 * S, a: 96, stiff: 22 },
      { name: 'bShin', parent: 'bThigh', attach: 1, len: 9 * S, w0: 3.2 * S, w1: 2.2 * S, a: 84, stiff: 24 },
    ]);
    this.tail = new Chain(6, 4.6 * S, { grav: 900, drag: 0.9, iter: 4 });
    this.tail.place(x, y);
  }

  update(dt, world, hero) {
    this.t += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.stateT += dt;

    if (this.dead) {
      this.deadT += dt;
      this.vy = Math.min(this.vy + GRAVITY * dt, 700);
      this.vx *= 0.9;
      world.moveActor(this, dt);
      if (Math.random() < 0.4) FX.smoke(this.cx + rnd(-8, 8), this.cy + rnd(-6, 6), 1, this.smokeCol);
      if (this.deadT > 0.8) this.remove = true;
      this.animate(dt, true);
      return;
    }

    const dx = hero.cx - this.cx;
    const dy = Math.abs(hero.cy - this.cy);
    const sees = Math.abs(dx) < (this.isBoss ? 300 : 190) && dy < 70 && !hero.dead;

    if (this.state === 'walk') {
      this.vx = this.face * this.speed;
      // разворот у обрыва или стены
      const aheadX = this.face > 0 ? this.x + this.w + 4 : this.x - 4;
      const groundAhead = world.solidAtPixel(aheadX, this.y + this.h + 6);
      const wallAhead = world.solidAtPixel(aheadX, this.y + this.h - 8);
      if (!groundAhead || wallAhead) this.face *= -1;
      if (sees && sign(dx) === this.face) { this.state = 'alert'; this.stateT = 0; }
    } else if (this.state === 'alert') {
      this.vx = damp(this.vx, 0, 10, dt);
      if (this.stateT > 0.45) { this.state = 'charge'; this.stateT = 0; Sfx.play(this.isBoss ? 'boss' : 'hit'); }
    } else if (this.state === 'charge') {
      this.vx = this.face * this.chargeSpeed;
      const aheadX = this.face > 0 ? this.x + this.w + 4 : this.x - 4;
      if (!world.solidAtPixel(aheadX, this.y + this.h + 6) || world.solidAtPixel(aheadX, this.y + this.h - 8)) {
        this.state = 'walk'; this.face *= -1;
      }
      if (this.stateT > (this.isBoss ? 1.6 : 1.1)) { this.state = 'walk'; this.stateT = 0; }
      if (Math.random() < 0.25) FX.smoke(this.cx - this.face * 12, this.y + this.h - 4, 1, this.smokeCol);
    }

    this.vy = Math.min(this.vy + GRAVITY * dt, 800);
    world.moveActor(this, dt);
    if (this.hitWall) this.face *= -1;

    this.animate(dt, false);
  }

  animate(dt, dying) {
    const sp = Math.abs(this.vx);
    this.phase = (this.phase + dt * (0.7 + sp / 120)) % 1;
    const a = this.phase * TAU;
    const S = this.scale;
    const bob = Math.sin(a * 2) * 1.4 * S;
    const sw = 26 + sp / 8;

    let P;
    if (dying) {
      P = { spine: 14, neck: 26, head: 40,
        fThigh: 120, fShin: 140, bThigh: 60, bShin: 40,
        fThighFar: 130, fShinFar: 150, bThighFar: 50, bShinFar: 30 };
    } else {
      const crouch = this.state === 'alert' ? 16 : 0;
      P = {
        spine: -3 + Math.sin(a * 2) * 2 + (this.state === 'charge' ? -6 : 0),
        neck: -34 + crouch + Math.sin(a * 2 + 1) * 3 + (this.state === 'charge' ? 14 : 0),
        head: 6 - crouch * 0.4 + Math.sin(a * 2) * 2,
        fThigh: 84 + Math.sin(a) * sw,
        fShin: 96 + Math.sin(a - 0.7) * sw * 0.8,
        bThigh: 96 + Math.sin(a + Math.PI) * sw,
        bShin: 84 + Math.sin(a + Math.PI - 0.7) * sw * 0.8,
        fThighFar: 84 + Math.sin(a + Math.PI) * sw,
        fShinFar: 96 + Math.sin(a + Math.PI - 0.7) * sw * 0.8,
        bThighFar: 96 + Math.sin(a) * sw,
        bShinFar: 84 + Math.sin(a - 0.7) * sw * 0.8,
      };
    }
    this.sk.pose(P, dt);
    // корень — «бедро» зверя
    const rootX = this.cx - this.face * 10 * S;
    const rootY = this.y + this.h - 13 * S + bob;
    this.sk.solve(rootX, rootY);
    this.rootY = rootY;

    const hip = this.sk.b('spine');
    this.tail.update(dt, hip.x, hip.y - 2 * S, this.face * -700, -260);
  }

  draw(ctx) {
    const S = this.scale;
    drawShadow(ctx, this.cx, this.y + this.h + 1, 15 * S, 0.45);

    ctx.save();
    if (this.dead) ctx.globalAlpha = clamp(1 - this.deadT / 0.8, 0, 1);
    ctx.translate(this.sk.rootX, this.rootY);
    ctx.scale(this.face, 1);
    ctx.translate(-this.sk.rootX, -this.rootY);

    const flash = this.hurtT > 0;
    const body = flash ? '#ffffff' : '#3a2f5c';
    const bodyD = flash ? '#dcd8ff' : '#241c3c';
    const far = flash ? '#e8e4ff' : '#241c3e';

    // хвост
    ctx.save();
    drawRibbon(ctx, this.tail.pts, 4 * S, 1 * S, far, null);
    ctx.restore();

    // дальние лапы
    ['fThighFar,fShinFar', 'bThighFar,bShinFar'].forEach((pair) => {
      const [t, s] = pair.split(',').map((n) => this.sk.b(n));
      drawLimb(ctx, t.x, t.y, t.ex, t.ey, t.w0, t.w1, far, far, null);
      drawLimb(ctx, s.x, s.y, s.ex, s.ey, s.w0, s.w1, far, far, null);
      // коготь
      ctx.fillStyle = flash ? '#fff' : '#0f0a1c';
      ctx.beginPath(); ctx.ellipse(s.ex, s.ey, 3 * S, 1.8 * S, 0, 0, TAU); ctx.fill();
    });

    // корпус — плоская заливка + контровой свет по хребту
    const sp = this.sk.b('spine');
    drawLimb(ctx, sp.x, sp.y, sp.ex, sp.ey, sp.w0, sp.w1, body, body, null);
    ctx.strokeStyle = flash ? '#fff' : 'rgba(150,130,220,.35)';
    ctx.lineWidth = 1.6 * S;
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y - sp.w0 * 0.75);
    ctx.lineTo(sp.ex, sp.ey - sp.w1 * 0.75);
    ctx.stroke();
    ctx.fillStyle = flash ? '#eee' : bodyD;
    ctx.beginPath();
    ctx.ellipse((sp.x + sp.ex) / 2, (sp.y + sp.ey) / 2 + sp.w0 * 0.4, sp.len * 0.42, sp.w0 * 0.42, sp.angle, 0, TAU);
    ctx.fill();
    // гребень на спине
    ctx.fillStyle = flash ? '#fff' : '#3d2f5e';
    for (let i = 0; i < 5; i++) {
      const p = sp.pointAt(0.18 + i * 0.16);
      const hgt = (5 - Math.abs(i - 2)) * 1.7 * S;
      ctx.beginPath();
      ctx.moveTo(p.x - 3 * S, p.y - sp.w0 * 0.55);
      ctx.lineTo(p.x, p.y - sp.w0 * 0.5 - hgt);
      ctx.lineTo(p.x + 3 * S, p.y - sp.w0 * 0.55);
      ctx.closePath(); ctx.fill();
    }

    // шея и голова
    const nk = this.sk.b('neck'), hd = this.sk.b('head');
    drawLimb(ctx, nk.x, nk.y, nk.ex, nk.ey, nk.w0, nk.w1, body, body, null);
    drawLimb(ctx, hd.x, hd.y, hd.ex, hd.ey, hd.w0, hd.w1, body, body, null);

    // челюсть
    ctx.save();
    ctx.translate(hd.ex, hd.ey);
    ctx.rotate(hd.angle);
    const open = this.state === 'charge' ? 1 : 0.25;
    ctx.fillStyle = flash ? '#fff' : '#0d0918';
    ctx.beginPath();
    ctx.moveTo(-4 * S, 0); ctx.lineTo(2 * S, -1 * S * open); ctx.lineTo(2 * S, 3 * S * open);
    ctx.closePath(); ctx.fill();
    // клыки
    ctx.fillStyle = '#e8e4ff';
    for (let i = 0; i < 3; i++) {
      const px = -2 * S + i * 2 * S;
      ctx.beginPath();
      ctx.moveTo(px, -0.5 * S); ctx.lineTo(px + 1.1 * S, 2.2 * S * open + 0.5); ctx.lineTo(px + 2 * S, -0.5 * S);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // светящиеся глаза
    const eye = hd.pointAt(0.42);
    const glow = this.state === 'charge' ? 1 : 0.65;
    ctx.save();
    ctx.shadowColor = this.isBoss ? '#ff4d6d' : '#7cf0ff';
    ctx.shadowBlur = 12 * glow;
    ctx.fillStyle = this.isBoss ? '#ff6b82' : '#8ef2ff';
    ctx.beginPath(); ctx.ellipse(eye.x + 1.5 * S, eye.y - 1.5 * S, 2.4 * S, 1.6 * S, hd.angle, 0, TAU); ctx.fill();
    ctx.restore();

    // ближние лапы
    ['fThigh,fShin', 'bThigh,bShin'].forEach((pair) => {
      const [t, s] = pair.split(',').map((n) => this.sk.b(n));
      drawLimb(ctx, t.x, t.y, t.ex, t.ey, t.w0, t.w1, body, body, null);
      drawLimb(ctx, s.x, s.y, s.ex, s.ey, s.w0, s.w1, body, body, null);
      ctx.fillStyle = flash ? '#fff' : '#0f0a1c';
      ctx.beginPath(); ctx.ellipse(s.ex, s.ey, 3.2 * S, 2 * S, 0, 0, TAU); ctx.fill();
      // когти
      ctx.strokeStyle = '#cfc8f5'; ctx.lineWidth = 1.1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(s.ex + i * 1.6 * S, s.ey + 1);
        ctx.lineTo(s.ex + i * 1.6 * S + this.face * 1.5, s.ey + 3 * S);
        ctx.stroke();
      }
    });

    ctx.restore();

    // полоска здоровья у босса
    if (this.isBoss && !this.dead) {
      const w = 46, h = 4;
      ctx.fillStyle = 'rgba(8,12,26,.75)';
      ctx.fillRect(this.cx - w / 2 - 1, this.y - 12, w + 2, h + 2);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(this.cx - w / 2, this.y - 11, w * (this.hp / this.maxHp), h);
    }
  }
}

/* ------------------------------------------------------------
   ҚАНАТТЫ КӨЛЕҢКЕ — летун. Машет крыльями, пикирует.
   ------------------------------------------------------------ */
class Flyer extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 20);
    this.type = 'flyer';
    this.hp = this.maxHp = 1;
    this.homeX = x; this.homeY = y;
    this.state = 'hover';
    this.stateT = 0;
    this.flap = rnd(0, TAU);
    this.smokeCol = [70, 90, 150];
    this.sk = new Skeleton([
      { name: 'body', parent: null, len: 16, w0: 7, w1: 5, a: 0, stiff: 16 },
      { name: 'head', parent: 'body', attach: 1, len: 8, w0: 5, w1: 2.6, a: -8, stiff: 18 },
      { name: 'wingNearU', parent: 'body', attach: 0.6, len: 15, w0: 4, w1: 3, a: -150, stiff: 30 },
      { name: 'wingNearF', parent: 'wingNearU', attach: 1, len: 16, w0: 3, w1: 1.6, a: -110, stiff: 30 },
      { name: 'wingFarU', parent: 'body', attach: 0.6, len: 14, w0: 3.6, w1: 2.6, a: -150, stiff: 30 },
      { name: 'wingFarF', parent: 'wingFarU', attach: 1, len: 15, w0: 2.6, w1: 1.4, a: -110, stiff: 30 },
      { name: 'tail', parent: 'body', attach: 0, len: 10, w0: 3.4, w1: 1.4, a: 168, stiff: 18 },
    ]);
  }

  update(dt, world, hero) {
    this.t += dt;
    this.stateT += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);

    if (this.dead) {
      this.deadT += dt;
      this.vy = Math.min(this.vy + GRAVITY * dt, 600);
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (Math.random() < 0.5) FX.smoke(this.cx, this.cy, 1, this.smokeCol);
      if (this.deadT > 0.7) this.remove = true;
      this.animate(dt, true);
      return;
    }

    const dx = hero.cx - this.cx, dy = hero.cy - this.cy;
    const near = Math.abs(dx) < 210 && Math.abs(dy) < 150 && !hero.dead;

    if (this.state === 'hover') {
      this.vx = damp(this.vx, Math.sin(this.t * 0.9) * 40, 4, dt);
      this.vy = damp(this.vy, Math.sin(this.t * 1.7) * 30, 4, dt);
      this.y = damp(this.y, this.homeY + Math.sin(this.t * 1.4) * 14, 2.4, dt);
      if (near && this.stateT > 1.1) { this.state = 'dive'; this.stateT = 0; this.dvx = dx; this.dvy = dy; }
    } else if (this.state === 'dive') {
      const len = Math.hypot(this.dvx, this.dvy) || 1;
      this.vx = damp(this.vx, (this.dvx / len) * 240, 6, dt);
      this.vy = damp(this.vy, (this.dvy / len) * 240, 6, dt);
      if (this.stateT > 0.85) { this.state = 'return'; this.stateT = 0; }
    } else {
      this.vx = damp(this.vx, (this.homeX - this.cx) * 1.6, 4, dt);
      this.vy = damp(this.vy, (this.homeY - this.cy) * 1.6, 4, dt);
      if (this.stateT > 1.0) { this.state = 'hover'; this.stateT = 0; }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (Math.abs(this.vx) > 12) this.face = sign(this.vx);
    this.animate(dt, false);
  }

  animate(dt, dying) {
    const speed = Math.hypot(this.vx, this.vy);
    this.flap += dt * (7 + speed / 26);
    const f = Math.sin(this.flap);
    const P = dying
      ? { body: 30, head: 20, tail: 200, wingNearU: -60, wingNearF: -20, wingFarU: -70, wingFarF: -30 }
      : {
        body: -6 + this.vy * 0.03,
        head: -6 - f * 5,
        tail: 168 + f * 10,
        wingNearU: -150 + f * 46,
        wingNearF: -104 + f * 62,
        wingFarU: -156 + Math.sin(this.flap - 0.5) * 46,
        wingFarF: -110 + Math.sin(this.flap - 0.5) * 62,
      };
    this.sk.pose(P, dt, 1.6);
    this.sk.solve(this.cx - this.face * 6, this.cy);
  }

  _wing(ctx, u, f, col, colD) {
    // перепонка: от плеча через локоть к кончику и обратно с прогибом
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.ex, u.ey);
    ctx.lineTo(f.ex, f.ey);
    ctx.quadraticCurveTo((f.ex + u.x) / 2 + 4, (f.ey + u.y) / 2 + 12, u.x, u.y + 3);
    ctx.closePath();
    const g = ctx.createLinearGradient(u.x, u.y, f.ex, f.ey);
    g.addColorStop(0, col); g.addColorStop(1, colD);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,26,.5)'; ctx.lineWidth = 1; ctx.stroke();
    // «пальцы» перепонки
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(u.ex, u.ey);
      const t = i / 3;
      ctx.lineTo(lerp(f.ex, u.x, t), lerp(f.ey, u.y + 6, t) + 6);
      ctx.stroke();
    }
    drawLimb(ctx, u.x, u.y, u.ex, u.ey, u.w0, u.w1, colD, colD, null);
    drawLimb(ctx, f.x, f.y, f.ex, f.ey, f.w0, f.w1, colD, colD, null);
  }

  draw(ctx) {
    ctx.save();
    if (this.dead) ctx.globalAlpha = clamp(1 - this.deadT / 0.7, 0, 1);
    ctx.translate(this.sk.rootX, this.cy);
    ctx.scale(this.face, 1);
    ctx.translate(-this.sk.rootX, -this.cy);

    const flash = this.hurtT > 0;
    const col = flash ? '#fff' : '#39406e';
    const colD = flash ? '#e6e8ff' : '#20254a';

    this._wing(ctx, this.sk.b('wingFarU'), this.sk.b('wingFarF'), '#2a2f57', '#171b38');

    const tail = this.sk.b('tail');
    drawLimb(ctx, tail.x, tail.y, tail.ex, tail.ey, tail.w0, tail.w1, colD, '#12162e', null);

    const body = this.sk.b('body');
    drawLimb(ctx, body.x, body.y, body.ex, body.ey, body.w0, body.w1, col, col, null);
    ctx.strokeStyle = flash ? '#fff' : 'rgba(160,175,255,.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(body.x, body.y - body.w0 * 0.7); ctx.lineTo(body.ex, body.ey - body.w1 * 0.7); ctx.stroke();

    const hd = this.sk.b('head');
    drawLimb(ctx, hd.x, hd.y, hd.ex, hd.ey, hd.w0, hd.w1, col, col, null);
    // клюв
    ctx.save();
    ctx.translate(hd.ex, hd.ey); ctx.rotate(hd.angle);
    ctx.fillStyle = '#ffb547';
    ctx.beginPath(); ctx.moveTo(0, -1.6); ctx.lineTo(7, 0); ctx.lineTo(0, 2.2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // глаз
    const eye = hd.pointAt(0.5);
    ctx.save();
    ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(eye.x + 1, eye.y - 1.4, 1.9, 0, TAU); ctx.fill();
    ctx.restore();

    this._wing(ctx, this.sk.b('wingNearU'), this.sk.b('wingNearF'), '#454c85', '#272c56');

    ctx.restore();
  }
}
