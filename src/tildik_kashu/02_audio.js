/* ============================================================
   02 · ЗВУК: всё синтезируется в WebAudio, никаких файлов
   ============================================================ */

const Sfx = {
  ctx: null,
  master: null,
  musicGain: null,
  muted: false,
  _musicTimer: null,
  _step: 0,
  _next: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    const b = document.getElementById('muteBtn');
    if (b) b.textContent = this.muted ? '🔇' : '🔊';
    try { localStorage.setItem('tk_mute', this.muted ? '1' : '0'); } catch (e) {}
  },

  /* --- Кирпичики --- */
  _tone(freq, dur, { type = 'square', gain = 0.2, to = null, delay = 0, detune = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  _noise(dur, { freq = 900, q = 1, gain = 0.2, delay = 0, type = 'bandpass', sweep = null } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },

  /* --- Библиотека звуков --- */
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump':   this._tone(300, 0.16, { type: 'square', gain: 0.14, to: 620 }); break;
      case 'land':   this._noise(0.11, { freq: 260, gain: 0.16, sweep: 90 }); break;
      case 'step':   this._noise(0.05, { freq: 1400, gain: 0.05, q: 0.7 }); break;
      case 'dash':   this._noise(0.2, { freq: 1800, gain: 0.13, sweep: 300, q: 0.8 });
                     this._tone(520, 0.16, { type: 'sawtooth', gain: 0.07, to: 180 }); break;
      case 'swing':  this._noise(0.13, { freq: 2200, gain: 0.09, sweep: 600, q: 1.4 }); break;
      case 'hit':    this._noise(0.14, { freq: 700, gain: 0.2, sweep: 150 });
                     this._tone(160, 0.12, { type: 'square', gain: 0.12, to: 70 }); break;
      case 'coin':   this._tone(880, 0.07, { type: 'triangle', gain: 0.13 });
                     this._tone(1320, 0.12, { type: 'triangle', gain: 0.11, delay: 0.06 }); break;
      case 'hurt':   this._tone(420, 0.3, { type: 'sawtooth', gain: 0.15, to: 90 }); break;
      case 'die':    this._tone(330, 0.6, { type: 'square', gain: 0.16, to: 60 });
                     this._noise(0.5, { freq: 500, gain: 0.1, sweep: 80 }); break;
      case 'door':   [523, 659, 784, 1046].forEach((f, i) =>
                       this._tone(f, 0.4, { type: 'triangle', gain: 0.12, delay: i * 0.07 })); break;
      case 'right':  [660, 880, 1100].forEach((f, i) =>
                       this._tone(f, 0.22, { type: 'triangle', gain: 0.13, delay: i * 0.06 })); break;
      case 'wrong':  this._tone(220, 0.28, { type: 'sawtooth', gain: 0.13, to: 130 });
                     this._tone(210, 0.28, { type: 'square', gain: 0.08, to: 120, delay: 0.05 }); break;
      case 'win':    [523, 659, 784, 1046, 1318].forEach((f, i) =>
                       this._tone(f, 0.5, { type: 'triangle', gain: 0.14, delay: i * 0.1 })); break;
      case 'click':  this._tone(700, 0.05, { type: 'square', gain: 0.09 }); break;
      case 'check':  this._tone(880, 0.14, { type: 'sine', gain: 0.12, to: 1200 }); break;
      case 'boss':   this._tone(90, 0.9, { type: 'sawtooth', gain: 0.16, to: 55 });
                     this._noise(0.8, { freq: 300, gain: 0.14, sweep: 60 }); break;
    }
  },

  /* --- Фоновая музыка: пентатоника, собирается на лету --- */
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    const scale = [0, 3, 5, 7, 10, 12, 15];   // минорная пентатоника
    const base = 220;
    this._next = this.ctx.currentTime + 0.1;
    this._musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      while (this._next < now + 0.6) {
        const s = this._step % 16;
        const t = this._next;
        // бас на сильных долях
        if (s % 4 === 0) this._mNote(base / 2 * Math.pow(2, scale[(this._step / 4 | 0) % 3] / 12), t, 0.5, 'sine', 0.5);
        // арпеджио
        const deg = scale[(s * 3 + (this._step >> 4)) % scale.length];
        this._mNote(base * Math.pow(2, deg / 12), t, 0.24, 'triangle', s % 2 ? 0.18 : 0.3);
        this._next += 0.155;
        this._step++;
      }
    }, 180);
  },

  _mNote(freq, t, dur, type, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  },

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  },
};
