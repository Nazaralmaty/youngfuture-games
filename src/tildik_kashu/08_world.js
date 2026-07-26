/* ============================================================
   08 · МИР: тайлы, коллизии, генерация уровня, объекты
   ============================================================ */

const T_EMPTY = 0, T_GROUND = 1, T_STONE = 2, T_PLANK = 3, T_SPIKE = 4, T_CRATE = 5, T_DOOR = 6;

const SOLID = { 1: true, 2: true, 5: true, 6: true };
const ONEWAY = { 3: true };

const World = {
  cols: 0, rows: 0,
  grid: null,
  spawn: { x: 64, y: 200 },
  coins: [], gates: [], torches: [], plats: [], checks: [], enemies: [],
  portal: null,
  decor: [],
  theme: null,
  levelIdx: 0,
  done: false,

  /* ---------------- генерация ---------------- */
  load(idx) {
    const cfg = LEVELS[idx];
    this.levelIdx = idx;
    this.theme = cfg.theme;
    Tex.tintAll(cfg.theme.tint);
    this.rows = 18;
    this.done = false;
    this.coins = []; this.gates = []; this.torches = []; this.plats = [];
    this.checks = []; this.enemies = []; this.decor = []; this.portal = null;

    const rng = makeRng(cfg.seed);
    const GY = 13;               // базовая строка земли
    const cols = cfg.length;
    this.cols = cols;
    this.grid = new Uint8Array(cols * this.rows);

    const fillCol = (tx, fromY) => {
      for (let ty = fromY; ty < this.rows; ty++) this.set(tx, ty, T_GROUND);
    };

    let x = 0;
    let gy = GY;
    // стартовая площадка — сразу за спавном ямы быть не должно
    for (; x < 13; x++) fillCol(x, gy);
    this.spawn = { x: 3 * TILE, y: (gy - 3) * TILE };
    this.addCoinRow(6, gy - 2, 3);

    const gateCols = [];
    let sinceGate = 0;
    let sinceCheck = 0;
    let first = true;

    while (x < cols - 12) {
      const room = cols - 12 - x;
      let kind = pick(cfg.chunks);
      if (sinceGate > 26 && room > 16) kind = 'gate';
      if (room < 12) kind = 'flat';
      if (first) { kind = 'flat'; first = false; }

      if (kind === 'flat') {
        const len = rndi(5, 9);
        for (let i = 0; i < len && x < cols; i++, x++) fillCol(x, gy);
        // первые 26 тайлов — без врагов: игрок должен успеть освоиться
        if (x > 26 && rng() < cfg.enemyRate) this.enemies.push(new ShadowBeast((x - len / 2) * TILE, (gy - 1) * TILE - 24));
        if (rng() < 0.6) this.addCoinRow(x - len + 1, gy - 2, rndi(2, 4));
      } else if (kind === 'gap') {
        const len = rndi(3, cfg.maxGap);
        // площадка-плашка посередине широких ям
        if (len >= 4) this.addPlank(x + Math.floor(len / 2), gy - 2, 2);
        this.addCoinArc(x, gy - 4, len);
        x += len;
        for (let i = 0; i < 3 && x < cols; i++, x++) fillCol(x, gy);
      } else if (kind === 'stairs') {
        const up = rng() < 0.5 ? -1 : 1;
        const steps = rndi(2, 4);
        for (let s = 0; s < steps && x < cols; s++) {
          gy = clamp(gy + up, 6, 15);
          for (let i = 0; i < 2 && x < cols; i++, x++) fillCol(x, gy);
        }
        for (let i = 0; i < 3 && x < cols; i++, x++) fillCol(x, gy);
      } else if (kind === 'platforms') {
        const len = rndi(9, 13);
        for (let i = 0; i < len && x < cols; i++, x++) {
          if (i === 3 || i === 4 || i === 8 || i === 9) continue; // ямы
          fillCol(x, gy);
        }
        this.addPlank(x - len + 3, gy - 3, 3);
        this.addPlank(x - len + 8, gy - 5, 3);
        this.addCoinRow(x - len + 3, gy - 4, 3);
        this.addCoinRow(x - len + 8, gy - 6, 3);
        if (cfg.flyers && rng() < 0.8) this.enemies.push(new Flyer((x - len / 2) * TILE, (gy - 7) * TILE));
      } else if (kind === 'spikes') {
        const len = rndi(3, 5);
        for (let i = 0; i < len && x < cols; i++, x++) {
          fillCol(x, gy + 1);
          this.set(x, gy, T_SPIKE);
        }
        this.addPlank(x - len - 1, gy - 3, 2);
        this.addPlank(x - Math.floor(len / 2), gy - 4, 2);
        for (let i = 0; i < 3 && x < cols; i++, x++) fillCol(x, gy);
      } else if (kind === 'crates') {
        const len = rndi(5, 8);
        for (let i = 0; i < len && x < cols; i++, x++) {
          fillCol(x, gy);
          if (i === 2) { this.set(x, gy - 1, T_CRATE); this.set(x, gy - 2, T_CRATE); }
          if (i === 3) this.set(x, gy - 1, T_CRATE);
          if (i === len - 2 && rng() < 0.6) this.set(x, gy - 1, T_CRATE);
        }
        this.addCoinRow(x - len + 2, gy - 4, 3);
      } else if (kind === 'tower') {
        const len = 10;
        const top = clamp(gy - rndi(4, 6), 4, 12);
        for (let i = 0; i < len && x < cols; i++, x++) {
          fillCol(x, gy);
          if (i === 4 || i === 5) for (let ty = top; ty < gy; ty++) this.set(x, ty, T_STONE);
        }
        this.addPlank(x - len + 1, gy - 3, 2);
        this.addPlank(x - len + 7, gy - 3, 2);
        this.addCoinRow(x - len + 4, top - 2, 2);
        this.torches.push({ x: (x - len + 4) * TILE + 4, y: (top + 1) * TILE, t: rnd(0, 6) });
        if (cfg.flyers && rng() < 0.7) this.enemies.push(new Flyer((x - len + 5) * TILE, (top - 3) * TILE));
      } else if (kind === 'moving') {
        const len = rndi(8, 11);
        for (let i = 0; i < len && x < cols; i++, x++) {
          if (i > 1 && i < len - 2) continue;  // пропасть
          fillCol(x, gy);
        }
        const px = (x - len + 2) * TILE, py = (gy - 2) * TILE;
        const vertical = rng() < 0.4;
        this.plats.push({
          x: px, y: py, w: TILE * 2.6, h: 14, x0: px, y0: py,
          dx: vertical ? 0 : (len - 5) * TILE, dy: vertical ? 70 : 0,
          spd: 0.55 + rng() * 0.4, ph: rng() * TAU, vx: 0, vy: 0,
        });
        this.addCoinArc(x - len + 3, gy - 4, len - 5);
      } else if (kind === 'gate') {
        // ровная площадка + каменная дверь, которая откроется правильным ответом
        for (let i = 0; i < 4 && x < cols; i++, x++) fillCol(x, gy);
        const doorX = x;
        for (let ty = gy - 4; ty < gy; ty++) this.set(doorX, ty, T_DOOR);
        this.gates.push({
          tx: doorX, ty0: gy - 4, ty1: gy - 1,
          x: (doorX - 3) * TILE, y: (gy - 4) * TILE, w: TILE * 3, h: TILE * 4,
          wordIdx: gateCols.length, done: false, tries: 0,
        });
        gateCols.push(doorX);
        this.torches.push({ x: (doorX - 1) * TILE + 8, y: (gy - 3) * TILE, t: rnd(0, 6) });
        x++;
        for (let i = 0; i < 5 && x < cols; i++, x++) fillCol(x, gy);
        sinceGate = 0;
      }

      sinceGate += 8;
      sinceCheck += 8;
      if (sinceCheck > 30) {
        this.checks.push({ x: (x - 2) * TILE, y: (gy - 2) * TILE, on: false, t: 0 });
        sinceCheck = 0;
      }
    }

    // финальная площадка + портал
    for (; x < cols; x++) fillCol(x, gy);
    this.portal = { x: (cols - 5) * TILE, y: (gy - 3) * TILE, w: 40, h: 60, t: 0 };
    if (cfg.boss) {
      this.enemies.push(new ShadowBeast((cols - 14) * TILE, (gy - 3) * TILE, { scale: 1.7, boss: true }));
    }

    // декор: трава и камешки на верхних тайлах
    for (let tx = 0; tx < this.cols; tx++) {
      for (let ty = 0; ty < this.rows; ty++) {
        if (this.get(tx, ty) === T_GROUND && this.get(tx, ty - 1) === T_EMPTY) {
          const h = (tx * 73856093) ^ (ty * 19349663);
          if ((h & 7) === 0) this.decor.push({ x: tx * TILE + (h % 20), y: ty * TILE, k: (h >> 3) & 3 });
          break;
        }
      }
    }

    Cam.bounds = { w: this.cols * TILE, h: this.rows * TILE };
    return cfg;
  },

  addPlank(tx, ty, len) {
    for (let i = 0; i < len; i++) this.set(tx + i, ty, T_PLANK);
  },
  addCoinRow(tx, ty, n) {
    for (let i = 0; i < n; i++) this.coins.push({ x: (tx + i) * TILE + TILE / 2, y: ty * TILE + TILE / 2, got: false, t: rnd(0, TAU) });
  },
  addCoinArc(tx, ty, len) {
    for (let i = 0; i < len; i++) {
      const k = i / Math.max(1, len - 1);
      this.coins.push({
        x: (tx + i) * TILE + TILE / 2,
        y: ty * TILE + TILE / 2 - Math.sin(k * Math.PI) * TILE * 1.2,
        got: false, t: rnd(0, TAU),
      });
    }
  },

  /* ---------------- доступ к тайлам ---------------- */
  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return T_EMPTY;
    return this.grid[ty * this.cols + tx];
  },
  set(tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return;
    this.grid[ty * this.cols + tx] = v;
  },
  isSolid(tx, ty) { return !!SOLID[this.get(tx, ty)]; },
  solidAtPixel(px, py) { return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)); },

  /* Годится ли точка как место возрождения: под ногами твердь, рядом нет шипов */
  isSafeSpot(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    // под ногами твердь и она продолжается по обе стороны —
    // иначе точка возрождения окажется на краю пропасти
    if (!this.isSolid(tx, ty + 1)) return false;
    if (!this.isSolid(tx - 1, ty + 1) || !this.isSolid(tx + 1, ty + 1)) return false;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        if (this.get(tx + i, ty + j) === T_SPIKE) return false;
    return true;
  },

  /* ---------------- физика ---------------- */
  movingRects() { return this.plats; },

  moveActor(a, dt) {
    a.hitWall = false; a.hitCeil = false;
    const prevBottom = a.y + a.h;

    /* --- едем вместе с платформой, на которой стоим --- */
    if (a.onGround && a.carry) {
      a.x += a.carry.vx * dt;
      a.y += a.carry.vy * dt;
    }
    a.carry = null;

    /* --- X --- */
    let dx = a.vx * dt;
    a.x += dx;
    if (dx !== 0) {
      const y0 = Math.floor(a.y / TILE), y1 = Math.floor((a.y + a.h - 1) / TILE);
      if (dx > 0) {
        const tx = Math.floor((a.x + a.w) / TILE);
        for (let ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) {
          a.x = tx * TILE - a.w - 0.01; a.vx = 0; a.hitWall = true; break;
        }
      } else {
        const tx = Math.floor(a.x / TILE);
        for (let ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) {
          a.x = (tx + 1) * TILE + 0.01; a.vx = 0; a.hitWall = true; break;
        }
      }
      // движущиеся платформы — тоже стены
      for (const p of this.plats) {
        if (!rectsOverlap(a, p)) continue;
        if (dx > 0 && prevBottom - 2 > p.y) { a.x = p.x - a.w - 0.01; a.vx = 0; a.hitWall = true; }
        else if (dx < 0 && prevBottom - 2 > p.y) { a.x = p.x + p.w + 0.01; a.vx = 0; a.hitWall = true; }
      }
    }
    a.x = clamp(a.x, 0, this.cols * TILE - a.w);

    /* --- Y --- */
    a.onGround = false;
    const dy = a.vy * dt;
    a.y += dy;
    const x0 = Math.floor((a.x + 2) / TILE), x1 = Math.floor((a.x + a.w - 2) / TILE);

    if (dy >= 0) {
      const ty = Math.floor((a.y + a.h) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.get(tx, ty);
        const solid = !!SOLID[t];
        const oneway = !!ONEWAY[t] && prevBottom <= ty * TILE + 2 && !(a.dropping > 0);
        if (solid || oneway) {
          a.y = ty * TILE - a.h; a.vy = 0; a.onGround = true; break;
        }
      }
      // платформы
      if (!a.onGround) {
        for (const p of this.plats) {
          if (a.x + a.w < p.x || a.x > p.x + p.w) continue;
          if (prevBottom <= p.y + 4 && a.y + a.h >= p.y) {
            a.y = p.y - a.h; a.vy = 0; a.onGround = true; a.carry = p; break;
          }
        }
      }
    } else {
      const ty = Math.floor(a.y / TILE);
      for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) {
        a.y = (ty + 1) * TILE + 0.01; a.vy = 0; a.hitCeil = true; break;
      }
    }
    if (a.dropping > 0) a.dropping -= dt;
  },

  /* ---------------- обновление мира ---------------- */
  update(dt, hero) {
    // движущиеся платформы
    for (const p of this.plats) {
      p.ph += dt * p.spd;
      const nx = p.x0 + Math.sin(p.ph) * p.dx * 0.5 + (p.dx ? p.dx * 0.5 : 0);
      const ny = p.y0 + Math.sin(p.ph) * p.dy;
      p.vx = (nx - p.x) / Math.max(dt, 1e-4);
      p.vy = (ny - p.y) / Math.max(dt, 1e-4);
      p.x = nx; p.y = ny;
    }

    // монеты
    for (const c of this.coins) {
      if (c.got) continue;
      c.t += dt * 3;
      if (Math.abs(c.x - hero.cx) < 22 && Math.abs(c.y - hero.cy) < 30) {
        c.got = true;
        hero.coins++;
        Game.score += 10;
        Sfx.play('coin');
        FX.glow(c.x, c.y, [255, 210, 90], 6);
        FX.text(c.x, c.y - 8, '+10', '#ffd54a', 11);
      }
    }

    // факелы
    for (const t of this.torches) {
      t.t += dt;
      if (Math.random() < 0.35) FX.glow(t.x + rnd(-2, 2), t.y - 6, [255, 170, 60], 1);
    }

    // чекпоинты
    for (const c of this.checks) {
      c.t += dt;
      if (!c.on && Math.abs(c.x - hero.cx) < 26 && Math.abs(c.y - hero.cy) < 40) {
        c.on = true;
        hero.spawnX = c.x; hero.spawnY = c.y - 10;
        Sfx.play('check');
        FX.ring(c.x, c.y, [120, 255, 190], 4, 40, 0.5);
        FX.text(c.x, c.y - 20, 'Бақылау нүктесі', '#7cf0a6', 11);
      }
    }

    // шипы
    const tx0 = Math.floor(hero.x / TILE), tx1 = Math.floor((hero.x + hero.w) / TILE);
    const ty0 = Math.floor(hero.y / TILE), ty1 = Math.floor((hero.y + hero.h) / TILE);
    for (let tx = tx0; tx <= tx1; tx++)
      for (let ty = ty0; ty <= ty1; ty++)
        if (this.get(tx, ty) === T_SPIKE) {
          const r = { x: tx * TILE + 3, y: ty * TILE + 12, w: TILE - 6, h: TILE - 12 };
          if (rectsOverlap({ x: hero.x, y: hero.y, w: hero.w, h: hero.h }, r)) hero.hurt(1, hero.cx);
        }

    // словарные ворота
    for (const g of this.gates) {
      if (g.done) continue;
      if (rectsOverlap({ x: hero.x, y: hero.y, w: hero.w, h: hero.h }, g)) Game.openGate(g);
    }

    // портал
    if (this.portal) {
      this.portal.t += dt;
      const p = this.portal;
      if (!this.done && Math.abs(p.x + p.w / 2 - hero.cx) < 26 && Math.abs(p.y + p.h / 2 - hero.cy) < 40) {
        this.done = true;
        Game.levelComplete();
      }
    }

    // враги
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.abs(e.cx - hero.cx) > 620) { if (e.type === 'beast') continue; }
      e.update(dt, this, hero);
      if (e.remove) { this.enemies.splice(i, 1); continue; }
      if (e.dead) continue;

      const hb = hero.attackBox();
      if (hb && rectsOverlap(hb, e.bodyBox()) && !hero.atkHit) {
        e.takeHit(hero.face, 1);
        hero.atkHit = true;
        Game.score += 50;
        hero.vx -= hero.face * 60;
        break;
      }
      const eb = e.hurtBox();
      if (eb && rectsOverlap({ x: hero.x + 3, y: hero.y + 3, w: hero.w - 6, h: hero.h - 6 }, eb)) {
        // прыжок сверху на зверя — добиваем
        if (hero.vy > 120 && hero.y + hero.h - 12 < e.y) {
          e.takeHit(sign(hero.vx) || hero.face, 1);
          hero.vy = -420;
          Game.score += 50;
        } else {
          hero.hurt(1, e.cx);
        }
      }
    }

    // падение в пропасть
    if (hero.y > this.rows * TILE + 40 && !hero.dead) { hero.hp--; hero.die(); }
  },

  breakDoor(g) {
    for (let ty = g.ty0; ty <= g.ty1; ty++) {
      this.set(g.tx, ty, T_EMPTY);
      FX.shard(g.tx * TILE + TILE / 2, ty * TILE + TILE / 2, 8, [130, 140, 160]);
    }
    FX.ring(g.tx * TILE + TILE / 2, (g.ty0 + 2) * TILE, [255, 214, 110], 8, 80, 0.6);
    Cam.shake(0.8);
    Sfx.play('door');
  },

  /* ---------------- отрисовка ---------------- */
  drawSky(ctx, w, h) {
    const th = this.theme;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.sky0); g.addColorStop(0.55, th.sky1); g.addColorStop(1, th.sky2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // светило
    const sx = w * 0.76, sy = h * 0.2;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.5);
    sg.addColorStop(0, th.sun); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
  },

  drawParallax(ctx, cam, w, h) {
    const layer = (img, speed, yOff, alpha) => {
      const iw = img.width;
      let x = -((cam.px * speed) % iw);
      ctx.globalAlpha = alpha;
      const y = h - img.height + yOff - cam.py * speed * 0.25;
      for (let px = x - iw; px < w + iw; px += iw) ctx.drawImage(img, px, y);
      ctx.globalAlpha = 1;
    };
    // облака
    ctx.globalAlpha = this.theme.cloudA !== undefined ? this.theme.cloudA : 0.5;
    Tex.clouds.forEach((c, i) => {
      const sp = 0.06 + i * 0.02;
      const iw = c.width * 3;
      let x = -((cam.px * sp + i * 340) % iw);
      for (let px = x - iw; px < w + iw; px += iw) {
        ctx.drawImage(c, px, 20 + i * 26 - cam.py * 0.05);
      }
    });
    ctx.globalAlpha = 1;
    layer(Tex.bgFar, 0.16, 40, 0.85);
    layer(Tex.bgMid, 0.34, 26, 0.95);
    layer(Tex.bgNear, 0.58, 10, 1);
  },

  drawTiles(ctx, cam, w, h) {
    const tx0 = Math.max(0, Math.floor(cam.px / TILE) - 1);
    const tx1 = Math.min(this.cols - 1, Math.floor((cam.px + w) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(cam.py / TILE) - 1);
    const ty1 = Math.min(this.rows - 1, Math.floor((cam.py + h) / TILE) + 1);

    const TX = Tex.set();
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.get(tx, ty);
        if (t === T_EMPTY) continue;
        const px = tx * TILE, py = ty * TILE;
        const v = ((tx * 73856093) ^ (ty * 19349663)) % 3;
        const vi = v < 0 ? -v : v;

        if (t === T_GROUND) {
          const top = this.get(tx, ty - 1) === T_EMPTY || ONEWAY[this.get(tx, ty - 1)];
          ctx.drawImage(top ? TX.groundTop[vi] : TX.ground[vi], px, py, TILE, TILE);
        } else if (t === T_STONE) {
          ctx.drawImage(TX.stone[vi], px, py, TILE, TILE);
        } else if (t === T_CRATE) {
          ctx.drawImage(TX.crate[vi], px, py, TILE, TILE);
        } else if (t === T_PLANK) {
          ctx.drawImage(TX.plank, px, py, TILE, 10);
        } else if (t === T_SPIKE) {
          ctx.drawImage(TX.spike, px, py, TILE, TILE);
        } else if (t === T_DOOR) {
          ctx.drawImage(TX.stone[vi], px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(255,206,74,.14)';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = 'rgba(255,206,74,.5)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
        }

        // грань между тайлом и пустотой — контур объёма
        if (SOLID[t]) {
          ctx.strokeStyle = 'rgba(8,12,26,.35)';
          ctx.lineWidth = 1.5;
          if (this.get(tx - 1, ty) === T_EMPTY) { ctx.beginPath(); ctx.moveTo(px + .5, py); ctx.lineTo(px + .5, py + TILE); ctx.stroke(); }
          if (this.get(tx + 1, ty) === T_EMPTY) { ctx.beginPath(); ctx.moveTo(px + TILE - .5, py); ctx.lineTo(px + TILE - .5, py + TILE); ctx.stroke(); }
        }
      }
    }

    // декор поверх земли
    for (const d of this.decor) {
      if (d.x < cam.px - 40 || d.x > cam.px + w + 40) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.k === 0) {
        ctx.strokeStyle = '#5cae4e'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i * 3, 0);
          ctx.quadraticCurveTo(i * 4, -5, i * 6, -8);
          ctx.stroke();
        }
      } else if (d.k === 1) {
        ctx.fillStyle = '#8b8477';
        ctx.beginPath(); ctx.ellipse(0, -2, 4, 3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath(); ctx.ellipse(-1, -3, 1.8, 1.2, 0, 0, TAU); ctx.fill();
      } else if (d.k === 2) {
        ctx.fillStyle = '#e0655f';
        ctx.beginPath(); ctx.arc(0, -4, 2, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#4c8a3f'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 0); ctx.stroke();
      }
      ctx.restore();
    }
  },

  drawObjects(ctx, cam, w) {
    // факелы
    for (const t of this.torches) {
      if (t.x < cam.px - 60 || t.x > cam.px + w + 60) continue;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = '#4a2f1a';
      ctx.fillRect(-2, 0, 4, 16);
      const f = Math.sin(t.t * 9) * 0.3 + 1;
      const g = ctx.createRadialGradient(0, -4, 0, 0, -4, 26);
      g.addColorStop(0, 'rgba(255,190,90,.55)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -4, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.moveTo(-3.5, 0); ctx.quadraticCurveTo(0, -10 * f, 3.5, 0);
      ctx.quadraticCurveTo(0, 3, -3.5, 0); ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.moveTo(-1.8, 0); ctx.quadraticCurveTo(0, -6 * f, 1.8, 0);
      ctx.quadraticCurveTo(0, 2, -1.8, 0); ctx.fill();
      ctx.restore();
    }

    // движущиеся платформы
    for (const p of this.plats) {
      if (p.x < cam.px - 80 || p.x > cam.px + w + 80) continue;
      ctx.drawImage(Tex.plank, p.x, p.y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,206,74,.5)';
      ctx.fillRect(p.x + p.w / 2 - 8, p.y - 2, 16, 2);
      // цепи наверх для вертикальных
      if (p.dy) {
        ctx.strokeStyle = 'rgba(180,190,210,.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(p.x + 6, p.y); ctx.lineTo(p.x + 6, p.y0 - 60);
        ctx.moveTo(p.x + p.w - 6, p.y); ctx.lineTo(p.x + p.w - 6, p.y0 - 60);
        ctx.stroke();
      }
    }

    // чекпоинты
    for (const c of this.checks) {
      if (c.x < cam.px - 40 || c.x > cam.px + w + 40) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.fillStyle = '#6b7488';
      ctx.fillRect(-1.5, 0, 3, 34);
      const wave = Math.sin(c.t * 4) * 2;
      ctx.fillStyle = c.on ? '#2fe08a' : '#8b93a8';
      ctx.beginPath();
      ctx.moveTo(1.5, 2);
      ctx.quadraticCurveTo(12, 5 + wave, 20, 2);
      ctx.lineTo(20, 14); ctx.quadraticCurveTo(12, 17 - wave, 1.5, 14);
      ctx.closePath(); ctx.fill();
      if (c.on) {
        ctx.shadowColor = '#2fe08a'; ctx.shadowBlur = 12;
        ctx.fill();
      }
      ctx.restore();
    }

    // монеты — восьмиугольные, с бликом и вращением
    for (const c of this.coins) {
      if (c.got) continue;
      if (c.x < cam.px - 30 || c.x > cam.px + w + 30) continue;
      const sc = Math.abs(Math.cos(c.t));
      const y = c.y + Math.sin(c.t * 0.8) * 2.5;
      ctx.save();
      ctx.translate(c.x, y);
      ctx.scale(clamp(sc, 0.18, 1), 1);
      const g = ctx.createLinearGradient(-7, -7, 7, 7);
      g.addColorStop(0, '#fff1a8'); g.addColorStop(0.5, '#ffce4a'); g.addColorStop(1, '#c88a12');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a5f0d'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.ellipse(-2, -2.4, 2, 1.4, -0.6, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.25;
      const gg = ctx.createRadialGradient(c.x, y, 0, c.x, y, 16);
      gg.addColorStop(0, 'rgba(255,214,110,.8)'); gg.addColorStop(1, 'rgba(255,214,110,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(c.x, y, 16, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // портал
    const p = this.portal;
    if (p && p.x > cam.px - 120 && p.x < cam.px + w + 120) {
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      const t = p.t;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 44);
      g.addColorStop(0, 'rgba(180,255,235,.85)');
      g.addColorStop(0.45, 'rgba(90,200,255,.35)');
      g.addColorStop(1, 'rgba(90,120,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(160, 240, 255, 0.55 - i * 0.13);
        ctx.lineWidth = 2.4 - i * 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 16 + i * 7, 28 + i * 5, Math.sin(t * (0.7 + i * 0.3)) * 0.6, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      if (Math.random() < 0.5) FX.glow(p.x + p.w / 2 + rnd(-14, 14), p.y + p.h, [150, 240, 255], 1);
    }

    // ворота со словом — рамка и знак вопроса
    for (const g of this.gates) {
      if (g.done) continue;
      if (g.x < cam.px - 100 || g.x > cam.px + w + 100) continue;
      const cx = g.tx * TILE + TILE / 2, cy = (g.ty0 + 2) * TILE;
      ctx.save();
      ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 400) * 0.2;
      ctx.fillStyle = '#ffce4a';
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', cx, cy - 30);
      ctx.restore();
    }
  },

  drawEnemies(ctx, cam, w) {
    for (const e of this.enemies) {
      if (e.cx < cam.px - 90 || e.cx > cam.px + w + 90) continue;
      e.draw(ctx);
    }
  },
};

/* ------------------------------------------------------------
   Уровни: набор паттернов + тема оформления
   ------------------------------------------------------------ */
const LEVELS = [
  {
    name: 'Жасыл алқап',
    nameRu: 'Зелёная долина',
    seed: 11, length: 132, maxGap: 4, enemyRate: 0.55, flyers: false, boss: false,
    chunks: ['flat', 'gap', 'stairs', 'platforms', 'crates', 'flat', 'gap', 'platforms'],
    theme: { sky0: '#8fd3ff', sky1: '#bfe6ff', sky2: '#e8f6ff', sun: 'rgba(255,240,190,.75)',
             tint: null, cloudA: 0.55 },
  },
  {
    name: 'Тас шатқал',
    nameRu: 'Каменное ущелье',
    seed: 27, length: 156, maxGap: 5, enemyRate: 0.75, flyers: true, boss: false,
    chunks: ['flat', 'gap', 'spikes', 'platforms', 'tower', 'moving', 'stairs', 'crates', 'spikes'],
    theme: { sky0: '#f7b26a', sky1: '#e98a63', sky2: '#7a5580', sun: 'rgba(255,210,140,.8)',
             tint: 'rgb(232,186,150)', cloudA: 0.4 },
  },
  {
    name: 'Көлеңке қамалы',
    nameRu: 'Крепость теней',
    seed: 43, length: 168, maxGap: 5, enemyRate: 0.9, flyers: true, boss: true,
    chunks: ['flat', 'spikes', 'moving', 'tower', 'platforms', 'gap', 'spikes', 'moving', 'crates'],
    theme: { sky0: '#1b2452', sky1: '#33265e', sky2: '#5b2f63', sun: 'rgba(180,150,255,.45)',
             tint: 'rgb(122,116,178)', cloudA: 0.16 },
  },
];
