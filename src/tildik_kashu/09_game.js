/* ============================================================
   09 · ИГРА: цикл, экраны, HUD, обучающий слой
   ============================================================ */

/* Словарь по уровням: казахский → английский */
const WORDS = [
  [ // 1 — табиғат / природа
    { kk: 'кітап', en: 'book' }, { kk: 'ағаш', en: 'tree' }, { kk: 'су', en: 'water' },
    { kk: 'күн', en: 'sun' }, { kk: 'тау', en: 'mountain' }, { kk: 'құс', en: 'bird' },
    { kk: 'гүл', en: 'flower' }, { kk: 'тас', en: 'stone' }, { kk: 'жел', en: 'wind' },
    { kk: 'аспан', en: 'sky' },
  ],
  [ // 2 — мектеп / школа
    { kk: 'мұғалім', en: 'teacher' }, { kk: 'сабақ', en: 'lesson' }, { kk: 'дәптер', en: 'notebook' },
    { kk: 'сынып', en: 'class' }, { kk: 'қалам', en: 'pen' }, { kk: 'сөз', en: 'word' },
    { kk: 'сан', en: 'number' }, { kk: 'дос', en: 'friend' }, { kk: 'үй', en: 'house' },
    { kk: 'жол', en: 'road' },
  ],
  [ // 3 — етістік / глаголы
    { kk: 'жүгіру', en: 'run' }, { kk: 'секіру', en: 'jump' }, { kk: 'оқу', en: 'read' },
    { kk: 'жазу', en: 'write' }, { kk: 'көру', en: 'see' }, { kk: 'айту', en: 'say' },
    { kk: 'білу', en: 'know' }, { kk: 'ойлау', en: 'think' }, { kk: 'ашу', en: 'open' },
    { kk: 'жеңу', en: 'win' },
  ],
];

const Game = {
  canvas: null, ctx: null, wrap: null,
  W: 640, H: 360, scale: 1, dpr: 1,
  state: 'boot',       // boot | menu | play | gate | pause | dead | levelend | over | final
  hero: null,
  level: 0,
  score: 0,
  best: 0,
  unlocked: 1,
  acc: 0, last: 0, raf: 0,
  stats: null,
  learned: [],
  gate: null,
  deathT: 0,
  flash: 0,

  /* ---------------- запуск ---------------- */
  init() {
    this.wrap = document.getElementById('wrap');
    this.canvas = document.getElementById('cv');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    try {
      this.best = +(localStorage.getItem('tk_best') || 0);
      this.unlocked = +(localStorage.getItem('tk_unlocked') || 1);
      Sfx.muted = localStorage.getItem('tk_mute') === '1';
    } catch (e) {}

    Tex.init();
    Input.init(this.wrap);
    this.bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));

    document.getElementById('bestVal').textContent = this.best;
    this.renderLevelPicker();
    this.state = 'menu';
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
    document.getElementById('muteBtn').textContent = Sfx.muted ? '🔇' : '🔊';
  },

  bindUI() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { Sfx.resume(); Sfx.play('click'); fn(); });
    };
    on('btnPlay', () => this.startGame(0));
    on('btnHow', () => this.show('scrHow'));
    on('btnHowBack', () => this.show('scrStart'));
    on('btnPause', () => this.togglePause());
    on('btnResume', () => this.togglePause());
    on('btnRestart', () => this.startGame(this.level));
    const toMenu = () => { this.show('scrStart'); this.state = 'menu'; this.renderLevelPicker(); };
    on('btnMenu', toMenu);
    on('btnMenu2', toMenu);
    on('btnNext', () => this.startGame(this.level + 1));
    on('btnRetry', () => this.startGame(this.level));
    on('btnFinalMenu', () => { this.show('scrStart'); this.state = 'menu'; this.renderLevelPicker(); });
    const mb = document.getElementById('muteBtn');
    if (mb) mb.addEventListener('click', () => { Sfx.resume(); Sfx.toggleMute(); });
  },

  renderLevelPicker() {
    const box = document.getElementById('levelPick');
    if (!box) return;
    box.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button');
      const open = i < this.unlocked;
      b.className = 'lvbtn' + (open ? '' : ' locked');
      b.innerHTML = `<b>${i + 1}. ${L.name}</b><span>${open ? L.nameRu : 'жабық 🔒'}</span>`;
      if (open) b.addEventListener('click', () => { Sfx.resume(); Sfx.play('click'); this.startGame(i); });
      box.appendChild(b);
    });
  },

  show(id) {
    ['scrStart', 'scrHow', 'scrGate', 'scrPause', 'scrEnd', 'scrOver', 'scrFinal'].forEach((s) => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hide', s !== id);
    });
    document.getElementById('hud').classList.toggle('hide', id !== null);
    document.getElementById('pad').classList.toggle('hide', id !== null);
    if (id === null) {
      document.getElementById('hud').classList.remove('hide');
      document.getElementById('pad').classList.remove('hide');
    }
  },

  hideAll() {
    ['scrStart', 'scrHow', 'scrGate', 'scrPause', 'scrEnd', 'scrOver', 'scrFinal']
      .forEach((s) => { const el = document.getElementById(s); if (el) el.classList.add('hide'); });
    document.getElementById('hud').classList.remove('hide');
    document.getElementById('pad').classList.remove('hide');
  },

  /* ---------------- размер под экран ---------------- */
  resize() {
    const box = document.getElementById('stage').getBoundingClientRect();
    const a = box.width / Math.max(1, box.height);
    // держим постоянный масштаб по высоте, но не даём обзору сузиться
    // меньше VIEW_W_MIN по ширине — иначе на телефоне не видно, куда прыгать
    let h = VIEW_H, w = h * a;
    if (w < VIEW_W_MIN) { w = VIEW_W_MIN; h = w / a; }
    if (w > VIEW_W_MAX) { w = VIEW_W_MAX; h = w / a; }
    h = clamp(h, 260, 620);
    w = h * a;

    this.W = Math.round(w); this.H = Math.round(h);
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = box.width + 'px';
    this.canvas.style.height = box.height + 'px';
    Cam.w = this.W; Cam.h = this.H;
  },

  /* ---------------- игра ---------------- */
  startGame(idx) {
    if (idx >= LEVELS.length) { this.showFinal(); return; }
    Sfx.resume();
    Sfx.startMusic();
    this.level = idx;
    this.score = idx === 0 ? 0 : this.score;
    World.load(idx);
    this.hero = new Hero(World.spawn.x, World.spawn.y);
    this.hero.respawn(World.spawn.x, World.spawn.y);
    FX.reset();
    Cam.reset(World.spawn.x - this.W / 2, World.spawn.y - this.H * 0.6);
    this.stats = { coins: 0, kills: 0, words: 0, wrong: 0, t: 0, deaths: 0 };
    if (idx === 0) this.learned = [];
    this.deathT = 0;
    this.hideAll();
    this.state = 'play';
    Input.clear();
    this.showBanner(`${idx + 1}. ${LEVELS[idx].name}`, LEVELS[idx].nameRu);
  },

  showBanner(a, b) {
    const el = document.getElementById('banner');
    el.innerHTML = `<b>${a}</b><span>${b}</span>`;
    el.classList.remove('hide');
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    setTimeout(() => el.classList.add('hide'), 2200);
  },

  togglePause() {
    if (this.state === 'play') { this.state = 'pause'; this.show('scrPause'); Input.clear(); }
    else if (this.state === 'pause') { this.state = 'play'; this.hideAll(); }
  },

  /* --- словарные ворота --- */
  openGate(g) {
    if (this.state !== 'play' || g.done) return;
    this.gate = g;
    this.state = 'gate';
    Input.clear();
    const bank = WORDS[this.level % WORDS.length];
    const word = bank[g.wordIdx % bank.length];
    g.word = word;
    // варианты: правильный + два чужих
    const opts = [word.en];
    while (opts.length < 3) {
      const o = pick(bank).en;
      if (!opts.includes(o)) opts.push(o);
    }
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    document.getElementById('gateWord').textContent = word.kk;
    document.getElementById('gateHint').textContent = g.tries > 0
      ? 'Тағы бір мүмкіндік · Ещё попытка' : 'Ағылшынша қалай? · Как по-английски?';
    const box = document.getElementById('gateOpts');
    box.innerHTML = '';
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.className = 'optbtn';
      b.textContent = o;
      b.addEventListener('click', () => this.answerGate(o, b));
      box.appendChild(b);
    });
    this.show('scrGate');
  },

  answerGate(ans, btn) {
    const g = this.gate;
    if (!g || g.done) return;
    Sfx.resume();
    const right = ans === g.word.en;
    if (right) {
      btn.classList.add('ok');
      Sfx.play('right');
      g.done = true;
      this.stats.words++;
      this.score += 100;
      if (!this.learned.find((w) => w.kk === g.word.kk)) this.learned.push(g.word);
      setTimeout(() => {
        World.breakDoor(g);
        FX.text(g.tx * TILE, (g.ty0 + 1) * TILE, '+100', '#7cf0a6', 15);
        this.hideAll();
        this.state = 'play';
        this.gate = null;
      }, 420);
    } else {
      btn.classList.add('bad');
      Sfx.play('wrong');
      g.tries++;
      this.stats.wrong++;
      // подсветить правильный
      [...document.querySelectorAll('#gateOpts .optbtn')].forEach((b) => {
        if (b.textContent === g.word.en) b.classList.add('ok');
      });
      setTimeout(() => {
        if (g.tries >= 2) {
          // не запираем ребёнка: открываем, но без очков
          g.done = true;
          World.breakDoor(g);
          this.hideAll();
          this.state = 'play';
          this.gate = null;
        } else {
          this.hideAll();
          this.state = 'play';
          this.gate = null;
          // отодвигаем героя, чтобы ворота не сработали сразу снова
          this.hero.x -= this.hero.face * 26;
          this.hero.vx = -this.hero.face * 120;
        }
      }, 1100);
    }
  },

  /* --- завершение уровня --- */
  levelComplete() {
    if (this.state === 'levelend') return;
    this.state = 'levelend';
    Sfx.play('win');
    this.hero.won = true;
    FX.ring(this.hero.cx, this.hero.cy, [150, 240, 255], 8, 120, 0.8);
    const bonus = this.hero.hp * 100;
    this.score += bonus;
    this.unlocked = Math.max(this.unlocked, Math.min(LEVELS.length, this.level + 2));
    this.saveProgress();

    setTimeout(() => {
      document.getElementById('endTitle').textContent = LEVELS[this.level].name + ' — өттің!';
      document.getElementById('endStats').innerHTML =
        `<div><b>${this.stats.words}</b><span>сөз ашылды</span></div>` +
        `<div><b>${this.hero.coins}</b><span>алтын</span></div>` +
        `<div><b>${this.score}</b><span>ұпай</span></div>` +
        `<div><b>+${bonus}</b><span>жүрек бонусы</span></div>`;
      const nb = document.getElementById('btnNext');
      nb.textContent = this.level + 1 < LEVELS.length ? 'Келесі деңгей →' : 'Қорытынды →';
      this.show('scrEnd');
    }, 1100);
  },

  showFinal() {
    this.state = 'final';
    this.saveProgress();
    const box = document.getElementById('finalWords');
    box.innerHTML = this.learned.length
      ? this.learned.map((w) => `<span class="wchip"><b>${w.kk}</b> — ${w.en}</span>`).join('')
      : '<span class="wchip">—</span>';
    document.getElementById('finalScore').textContent = this.score;
    document.getElementById('finalCount').textContent = this.learned.length;
    this.show('scrFinal');
    Sfx.play('win');
  },

  gameOver() {
    this.state = 'over';
    this.saveProgress();
    document.getElementById('overScore').textContent = this.score;
    this.show('scrOver');
  },

  saveProgress() {
    this.best = Math.max(this.best, this.score);
    try {
      localStorage.setItem('tk_best', this.best);
      localStorage.setItem('tk_unlocked', this.unlocked);
    } catch (e) {}
    const bv = document.getElementById('bestVal');
    if (bv) bv.textContent = this.best;
  },

  /* ---------------- цикл ---------------- */
  loop(ts) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (dt > 0.25) dt = 0.25;
    this.acc += dt;

    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 5) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    this.draw();
  },

  step(dt) {
    if (this.state === 'play') {
      Input.update(dt);
      this.stats.t += dt;
      this.hero.update(dt, World);
      World.update(dt, this.hero);
      Cam.follow(this.hero, dt);
      FX.update(dt);

      if (this.hero.dead) { this.state = 'dead'; this.deathT = 0; }
      this.updateHud();
    } else if (this.state === 'dead') {
      this.hero.update(dt, World);
      FX.update(dt);
      Cam.follow(this.hero, dt);
      this.deathT += dt;
      if (this.deathT > 1.15) {
        if (this.hero.hp > 0) {
          this.hero.respawn(this.hero.spawnX, this.hero.spawnY);
          this.stats.deaths++;
          this.state = 'play';
          Cam.reset(this.hero.cx - this.W / 2, this.hero.cy - this.H * 0.6);
          FX.ring(this.hero.cx, this.hero.cy, [150, 240, 255], 4, 40, 0.4);
        } else {
          this.stats.deaths++;
          this.gameOver();
        }
      }
      this.updateHud();
    } else if (this.state === 'levelend') {
      this.hero.update(dt, World);
      World.update(dt, this.hero);
      Cam.follow(this.hero, dt);
      FX.update(dt);
    } else {
      // на паузе/в меню мир живёт, но не двигается: только частицы затухают
      FX.update(dt * 0.35);
    }
  },

  updateHud() {
    const h = this.hero;
    const hearts = document.getElementById('hearts');
    if (hearts.dataset.hp !== String(h.hp)) {
      hearts.dataset.hp = h.hp;
      hearts.innerHTML = '';
      for (let i = 0; i < h.maxHp; i++) {
        const s = document.createElement('span');
        s.className = 'heart' + (i < h.hp ? '' : ' off');
        s.textContent = '♥';
        hearts.appendChild(s);
      }
    }
    document.getElementById('coinVal').textContent = h.coins;
    document.getElementById('scoreVal').textContent = this.score;
    const total = World.gates.length || 1;
    const done = World.gates.filter((g) => g.done).length;
    document.getElementById('wordVal').textContent = `${done}/${total}`;
    // прогресс по уровню
    const p = clamp(h.cx / (World.cols * TILE), 0, 1);
    document.getElementById('progFill').style.width = (p * 100).toFixed(1) + '%';
  },

  /* ---------------- отрисовка ---------------- */
  draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.state === 'menu' || this.state === 'boot') {
      // фон меню — тот же движок, чтобы было видно качество картинки
      World.theme = World.theme || LEVELS[0].theme;
      World.drawSky(ctx, W, H);
      const t = performance.now() / 1000;
      ctx.save();
      const fake = { px: t * 24, py: 0 };
      World.drawParallax(ctx, fake, W, H);
      ctx.restore();
      return;
    }

    World.drawSky(ctx, W, H);
    World.drawParallax(ctx, Cam, W, H);

    ctx.save();
    ctx.translate(-Cam.px, -Cam.py);

    World.drawTiles(ctx, Cam, W, H);
    World.drawObjects(ctx, Cam, W);
    World.drawEnemies(ctx, Cam, W);
    if (this.hero) this.hero.draw(ctx);
    FX.draw(ctx);
    FX.drawTexts(ctx);

    ctx.restore();

    // виньетка и лёгкий цветовой фильтр темы
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,8,20,.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (this.state === 'dead') {
      ctx.fillStyle = `rgba(20,4,10,${clamp(this.deathT / 1.2, 0, 0.55)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.state === 'pause' || this.state === 'gate') {
      ctx.fillStyle = 'rgba(6,10,24,.55)';
      ctx.fillRect(0, 0, W, H);
    }
  },
};

/* ---------------- старт ---------------- */
function boot() {
  Game.init();
  // отладочная ручка: в консоли браузера доступны все модули
  window.__TK = { Game, Input, World, FX, Cam, Sfx, Tex, LEVELS, WORDS };
  // первый пользовательский жест — включаем звук
  const wake = () => { Sfx.resume(); document.removeEventListener('pointerdown', wake); };
  document.addEventListener('pointerdown', wake);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
