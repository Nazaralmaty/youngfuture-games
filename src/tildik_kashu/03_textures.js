/* ============================================================
   03 · ТЕКСТУРЫ: всё рисуется кодом при загрузке и запекается
        в оффскрин-холсты. Ни одного внешнего файла.
   ============================================================ */

const Tex = {
  ready: false,
  ground: [], groundTop: [], stone: [], crate: [], plank: null,
  spike: null, grain: null, bgFar: null, bgMid: null, bgNear: null, clouds: [],
  TS: 64, // разрешение запекания тайла (рисуется потом в 32 — запас для ретины)

  init() {
    if (this.ready) return;
    const N = makeNoise(1337);
    this.grain = this._grain(128, N);
    for (let i = 0; i < 3; i++) {
      this.ground.push(this._ground(N, i, false));
      this.groundTop.push(this._ground(N, i, true));
      this.stone.push(this._stone(N, i));
      this.crate.push(this._crate(N, i));
    }
    this.plank = this._plank(N);
    this.spike = this._spike();
    this.bgFar = this._mountains(N, 1400, 300, ['#2d3a63', '#3a4a7a'], 0.5, 3);
    this.bgMid = this._forest(N, 1400, 260, '#1f2c4d', 26);
    this.bgNear = this._bushes(N, 1400, 150, '#141d33');
    for (let i = 0; i < 4; i++) this.clouds.push(this._cloud(N, i));
    this.ready = true;
  },

  /* --- Тонирование под тему уровня: запекаем копии один раз при загрузке.
         Так каждый уровень выглядит своим миром, а не «то же самое, другое небо». --- */
  tinted: null,
  tintAll(col) {
    if (!col) { this.tinted = null; return; }
    const mk = (src) => {
      const c = makeCanvas(src.width, src.height), x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = col;
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in';   // сохраняем исходную прозрачность
      x.drawImage(src, 0, 0);
      return c;
    };
    this.tinted = {
      ground: this.ground.map(mk), groundTop: this.groundTop.map(mk),
      stone: this.stone.map(mk), crate: this.crate.map(mk),
      plank: mk(this.plank), spike: mk(this.spike),
    };
  },
  set() { return this.tinted || this; },

  /* --- Мелкое зерно, накладывается поверх всего для «плёночной» фактуры --- */
  _grain(s, N) {
    const c = makeCanvas(s, s), x = c.getContext('2d');
    const img = x.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const v = (Math.random() * 255) | 0;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 16;
    }
    x.putImageData(img, 0, 0);
    return c;
  },

  /* --- Земля: суглинок с камушками, вариант с травяной шапкой --- */
  _ground(N, variant, withGrass) {
    const S = this.TS, c = makeCanvas(S, S), x = c.getContext('2d');
    const off = variant * 37.7;

    const img = x.createImageData(S, S);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const n = N.fbm((px + off) / 14, (py + off) / 14, 4);
        const n2 = N.noise2((px + off) / 4.5, (py + off) / 4.5);
        // затемнение вглубь — только у верхнего тайла, иначе земля полосит рядами
        const d = withGrass ? py / S : 0.55;
        let r = 108 - d * 34, g = 74 - d * 24, b = 46 - d * 16;
        const k = (n - 0.5) * 58 + (n2 - 0.5) * 18;
        const i = (py * S + px) * 4;
        img.data[i] = clamp(r + k, 0, 255);
        img.data[i + 1] = clamp(g + k * 0.85, 0, 255);
        img.data[i + 2] = clamp(b + k * 0.7, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);

    // камушки
    const rng = makeRng(700 + variant);
    for (let i = 0; i < 16; i++) {
      const px = rng() * S, py = 10 + rng() * (S - 12), r = 1.4 + rng() * 3.4;
      x.beginPath(); x.ellipse(px, py, r, r * (0.6 + rng() * 0.5), rng() * TAU, 0, TAU);
      x.fillStyle = rgba(150, 128, 104, 0.5); x.fill();
      x.beginPath(); x.ellipse(px - r * 0.25, py - r * 0.3, r * 0.55, r * 0.4, 0, 0, TAU);
      x.fillStyle = rgba(206, 190, 168, 0.35); x.fill();
    }
    // корешки
    x.strokeStyle = rgba(60, 40, 24, 0.5); x.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      let px = rng() * S, py = 14 + rng() * 30;
      x.moveTo(px, py);
      for (let s = 0; s < 4; s++) { px += (rng() - 0.5) * 12; py += 4 + rng() * 6; x.lineTo(px, py); }
      x.stroke();
    }

    if (withGrass) {
      const gh = 15 + variant;
      const gr = x.createLinearGradient(0, 0, 0, gh + 6);
      gr.addColorStop(0, '#68c15a'); gr.addColorStop(0.55, '#4a9c42'); gr.addColorStop(1, '#2f6b2c');
      x.fillStyle = gr;
      x.beginPath();
      x.moveTo(0, 0); x.lineTo(S, 0); x.lineTo(S, gh);
      for (let px = S; px >= 0; px -= 4) x.lineTo(px, gh + Math.sin((px + off) / 7) * 2.2 + N.noise2((px + off) / 9, 3) * 3);
      x.closePath(); x.fill();
      // травинки
      x.strokeStyle = '#7ad169'; x.lineWidth = 1.6; x.lineCap = 'round';
      for (let i = 0; i < 22; i++) {
        const px = (i / 22) * S + rng() * 3;
        const h = 4 + rng() * 7;
        x.beginPath(); x.moveTo(px, gh + 2);
        x.quadraticCurveTo(px + (rng() - 0.5) * 5, gh - h * 0.6, px + (rng() - 0.5) * 8, gh - h);
        x.stroke();
      }
      // тёмная линия под дёрном
      x.fillStyle = rgba(28, 46, 24, 0.45); x.fillRect(0, gh + 3, S, 2);
    }

    // затенение: у верхнего тайла заметное, у глубинных — слабое,
    // иначе ряды земли читаются как полосы
    const vg = x.createLinearGradient(0, 0, 0, S);
    if (withGrass) { vg.addColorStop(0, 'rgba(255,255,255,.06)'); vg.addColorStop(1, 'rgba(0,0,0,.26)'); }
    else { vg.addColorStop(0, 'rgba(255,255,255,.02)'); vg.addColorStop(1, 'rgba(0,0,0,.08)'); }
    x.fillStyle = vg; x.fillRect(0, 0, S, S);
    x.drawImage(this.grain, 0, 0, 128, 128, 0, 0, S, S);
    return c;
  },

  /* --- Камень: кладка с фаской и трещинами --- */
  _stone(N, variant) {
    const S = this.TS, c = makeCanvas(S, S), x = c.getContext('2d');
    const off = variant * 51.3;
    const img = x.createImageData(S, S);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const n = N.fbm((px + off) / 11, (py + off) / 11, 4);
        const k = (n - 0.5) * 52;
        const i = (py * S + px) * 4;
        img.data[i] = clamp(112 + k, 0, 255);
        img.data[i + 1] = clamp(120 + k, 0, 255);
        img.data[i + 2] = clamp(134 + k * 1.1, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);

    // швы кладки
    const rows = [0, S / 2], shift = variant % 2 ? S / 4 : 0;
    x.strokeStyle = 'rgba(30,34,46,.75)'; x.lineWidth = 2.4;
    rows.forEach((ry, ri) => {
      x.beginPath(); x.moveTo(0, ry); x.lineTo(S, ry); x.stroke();
      const vx = (ri % 2 ? S * 0.5 : S * 0.25) + shift;
      x.beginPath(); x.moveTo(vx, ry); x.lineTo(vx, ry + S / 2); x.stroke();
    });
    // фаска: свет сверху, тень снизу
    x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 1.6;
    rows.forEach((ry) => { x.beginPath(); x.moveTo(0, ry + 2); x.lineTo(S, ry + 2); x.stroke(); });
    x.strokeStyle = 'rgba(0,0,0,.25)';
    rows.forEach((ry) => { x.beginPath(); x.moveTo(0, ry + S / 2 - 2); x.lineTo(S, ry + S / 2 - 2); x.stroke(); });

    // трещины
    const rng = makeRng(90 + variant);
    x.strokeStyle = 'rgba(24,28,38,.5)'; x.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      let px = rng() * S, py = rng() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let s = 0; s < 5; s++) { px += (rng() - 0.5) * 14; py += (rng() - 0.5) * 14; x.lineTo(px, py); }
      x.stroke();
    }
    x.drawImage(this.grain, 0, 0, 128, 128, 0, 0, S, S);
    return c;
  },

  /* --- Ящик: доски с волокном и железные углы --- */
  _crate(N, variant) {
    const S = this.TS, c = makeCanvas(S, S), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#a9713a'); g.addColorStop(1, '#7d4f26');
    x.fillStyle = g; x.fillRect(0, 0, S, S);

    // волокна дерева
    for (let py = 0; py < S; py += 2) {
      const v = N.fbm(py / 6 + variant * 10, 0.5, 3);
      x.strokeStyle = rgba(60, 36, 16, 0.13 + v * 0.16);
      x.lineWidth = 1 + v;
      x.beginPath();
      for (let px = 0; px <= S; px += 8) x.lineTo(px, py + Math.sin(px / 11 + py) * 1.2);
      x.stroke();
    }
    // доски
    x.strokeStyle = 'rgba(46,26,10,.7)'; x.lineWidth = 2;
    [S / 3, (S / 3) * 2].forEach((y) => { x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); });
    // диагональная планка
    x.strokeStyle = 'rgba(150,100,54,.85)'; x.lineWidth = 7;
    x.beginPath(); x.moveTo(3, S - 3); x.lineTo(S - 3, 3); x.stroke();
    // железные углы
    x.fillStyle = '#4d5361';
    [[0, 0], [S - 12, 0], [0, S - 12], [S - 12, S - 12]].forEach(([bx, by]) => {
      x.fillRect(bx + 1, by + 1, 11, 11);
      x.fillStyle = '#767f92'; x.fillRect(bx + 3, by + 3, 4, 4); x.fillStyle = '#4d5361';
    });
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, S - 3, S - 3);
    x.drawImage(this.grain, 0, 0, 128, 128, 0, 0, S, S);
    return c;
  },

  /* --- Деревянная площадка (проходимая снизу) --- */
  _plank(N) {
    const W = 64, H = 20, c = makeCanvas(W, H), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#b98045'); g.addColorStop(0.5, '#96612f'); g.addColorStop(1, '#5f3c1c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let py = 1; py < H; py += 2) {
      x.strokeStyle = rgba(60, 34, 12, 0.1 + N.fbm(py / 4, 1, 2) * 0.2);
      x.beginPath();
      for (let px = 0; px <= W; px += 6) x.lineTo(px, py + Math.sin(px / 9) * 0.8);
      x.stroke();
    }
    x.fillStyle = 'rgba(255,235,200,.18)'; x.fillRect(0, 0, W, 2);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, H - 3, W, 3);
    x.fillStyle = '#3b4150';
    [6, W - 10].forEach((bx) => { x.beginPath(); x.arc(bx, 5, 2.2, 0, TAU); x.fill(); });
    return c;
  },

  /* --- Шипы --- */
  _spike() {
    const S = 32, c = makeCanvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#3c4250'; x.fillRect(0, S - 6, S, 6);
    x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, S - 6, S, 1.5);
    for (let i = 0; i < 3; i++) {
      const bx = 3 + i * 9.5;
      const g = x.createLinearGradient(bx, 0, bx + 8, 0);
      g.addColorStop(0, '#cfd6e4'); g.addColorStop(0.45, '#9aa3b8'); g.addColorStop(1, '#5c6478');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(bx, S - 5); x.lineTo(bx + 4.2, 3); x.lineTo(bx + 8.4, S - 5); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(20,24,34,.6)'; x.lineWidth = 1; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.5)';
      x.beginPath(); x.moveTo(bx + 3.4, S - 8); x.lineTo(bx + 4.2, 5); x.lineTo(bx + 5, S - 8); x.closePath(); x.fill();
    }
    return c;
  },

  /* --- Дальние горы --- */
  _mountains(N, W, H, cols, alpha, layers) {
    const c = makeCanvas(W, H), x = c.getContext('2d');
    for (let L = 0; L < layers; L++) {
      const y0 = H * (0.35 + L * 0.16);
      const amp = 70 - L * 16;
      const col = L === 0 ? cols[0] : shade(cols[1], -L * 14);
      x.fillStyle = col;
      x.beginPath(); x.moveTo(0, H);
      for (let px = 0; px <= W; px += 6) {
        const r = N.fbm(px / 190 + L * 5, L * 3, 5, 0.55);
        const ridge = 1 - Math.abs(r - 0.5) * 2;
        x.lineTo(px, y0 - ridge * amp + Math.sin(px / 60 + L) * 6);
      }
      x.lineTo(W, H); x.closePath(); x.fill();
      // подсветка гребня — солнце сверху-справа
      x.strokeStyle = L === 0 ? 'rgba(226,236,255,.35)' : 'rgba(210,225,255,.16)';
      x.lineWidth = 2;
      x.beginPath();
      for (let px = 0; px <= W; px += 6) {
        const r = N.fbm(px / 190 + L * 5, L * 3, 5, 0.55);
        const ridge = 1 - Math.abs(r - 0.5) * 2;
        x.lineTo(px, y0 - ridge * amp + Math.sin(px / 60 + L) * 6);
      }
      x.stroke();
    }
    // дымка снизу
    const g = x.createLinearGradient(0, H * 0.5, 0, H);
    g.addColorStop(0, 'rgba(120,150,210,0)'); g.addColorStop(1, 'rgba(150,175,225,.35)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    return c;
  },

  /* --- Средний план: лес --- */
  _forest(N, W, H, col, count) {
    const c = makeCanvas(W, H), x = c.getContext('2d');
    const rng = makeRng(4242);
    // холм
    x.fillStyle = shade(col, 12);
    x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W; px += 8) x.lineTo(px, H - 40 - N.fbm(px / 140, 7, 3) * 46);
    x.lineTo(W, H); x.closePath(); x.fill();

    for (let i = 0; i < count; i++) {
      const px = (i / count) * W + rng() * 40;
      const base = H - 34 - rng() * 26;
      const h = 60 + rng() * 70, w = 16 + rng() * 12;
      x.fillStyle = i % 3 === 0 ? shade(col, 10) : col;
      // ствол
      x.fillRect(px - 2, base - h * 0.25, 4, h * 0.3);
      // ярусы ели
      for (let t = 0; t < 4; t++) {
        const ty = base - h * (0.22 + t * 0.2), tw = w * (1 - t * 0.18);
        x.beginPath();
        x.moveTo(px - tw, ty); x.lineTo(px, ty - h * 0.3); x.lineTo(px + tw, ty);
        x.closePath(); x.fill();
      }
    }
    return c;
  },

  /* --- Ближний план: кусты и камни --- */
  _bushes(N, W, H, col) {
    const c = makeCanvas(W, H), x = c.getContext('2d');
    const rng = makeRng(909);
    for (let i = 0; i < 40; i++) {
      const px = rng() * W, py = H - rng() * 40;
      const r = 16 + rng() * 34;
      x.fillStyle = rng() > 0.5 ? col : shade(col, 10);
      x.beginPath();
      for (let a = 0; a < TAU; a += 0.5) {
        const rr = r * (0.72 + N.noise2(Math.cos(a) * 2 + i, Math.sin(a) * 2) * 0.6);
        x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.62);
      }
      x.closePath(); x.fill();
    }
    // трава по нижнему краю
    x.strokeStyle = shade(col, 16); x.lineWidth = 2; x.lineCap = 'round';
    for (let i = 0; i < 200; i++) {
      const px = rng() * W, py = H - rng() * 10;
      x.beginPath(); x.moveTo(px, py);
      x.quadraticCurveTo(px + rng() * 6 - 3, py - 10, px + rng() * 12 - 6, py - 18 - rng() * 10);
      x.stroke();
    }
    return c;
  },

  /* --- Облака --- */
  _cloud(N, i) {
    const W = 220 + i * 40, H = 90, c = makeCanvas(W, H), x = c.getContext('2d');
    const rng = makeRng(31 + i);
    x.fillStyle = 'rgba(255,255,255,.85)';
    for (let k = 0; k < 9; k++) {
      const px = 30 + rng() * (W - 60), py = 34 + rng() * 26, r = 16 + rng() * 26;
      x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    }
    // мягкая нижняя тень
    x.globalCompositeOperation = 'source-atop';
    const g = x.createLinearGradient(0, 10, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(168,190,230,.75)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    return c;
  },
};
