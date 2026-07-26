/* ============================================================
   01 · ВВОД: клавиатура + мультитач (джойстик и кнопки)
   ============================================================ */

const Input = {
  axisX: 0,          // -1..1 — плавная ось (джойстик даёт полутона)
  up: false,
  down: false,
  jumpHeld: false,
  _jumpBuf: 0,       // буфер прыжка: нажал чуть раньше приземления — прыжок засчитается
  _attackBuf: 0,
  _dashBuf: 0,
  usingTouch: false,

  keys: Object.create(null),
  _stick: null,      // {id, cx, cy, dx, dy}
  _btnPointers: Object.create(null),

  /* --- Публичное --- */
  pressJump() { this._jumpBuf = 0.13; this.jumpHeld = true; },
  releaseJump() { this.jumpHeld = false; },
  pressAttack() { this._attackBuf = 0.13; },
  pressDash() { this._dashBuf = 0.13; },

  consumeJump() { if (this._jumpBuf > 0) { this._jumpBuf = 0; return true; } return false; },
  consumeAttack() { if (this._attackBuf > 0) { this._attackBuf = 0; return true; } return false; },
  consumeDash() { if (this._dashBuf > 0) { this._dashBuf = 0; return true; } return false; },

  clear() {
    this.axisX = 0; this.up = this.down = false; this.jumpHeld = false;
    this._jumpBuf = this._attackBuf = this._dashBuf = 0;
    this.keys = Object.create(null);
    this._stick = null;
    this._btnPointers = Object.create(null);
    document.querySelectorAll('.tbtn.on').forEach((b) => b.classList.remove('on'));
    const st = document.getElementById('stick');
    if (st) st.classList.remove('on');
  },

  update(dt) {
    this._jumpBuf = Math.max(0, this._jumpBuf - dt);
    this._attackBuf = Math.max(0, this._attackBuf - dt);
    this._dashBuf = Math.max(0, this._dashBuf - dt);

    // Клавиатура перебивает джойстик, если что-то зажато
    const k = this.keys;
    const kx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    if (kx !== 0) this.axisX = kx;
    else if (!this._stick) this.axisX = damp(this.axisX, 0, 30, dt);
    this.up = !!(k.ArrowUp || k.KeyW) || this._stickUp();
    this.down = !!(k.ArrowDown || k.KeyS);
  },

  _stickUp() { return !!(this._stick && this._stick.dy < -0.55); },

  /* --- Инициализация --- */
  init(root) {
    /* Клавиатура */
    addEventListener('keydown', (e) => {
      if (e.repeat) { e.preventDefault(); return; }
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.pressJump();
      if (e.code === 'KeyJ' || e.code === 'KeyX' || e.code === 'Enter') this.pressAttack();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK' || e.code === 'KeyZ') this.pressDash();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyP' || e.code === 'Escape') Game.togglePause();
      if (e.code === 'KeyM') Sfx.toggleMute();
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.releaseJump();
    });
    addEventListener('blur', () => this.clear());

    /* Кнопки на экране */
    root.querySelectorAll('.tbtn').forEach((btn) => {
      const act = btn.dataset.act;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.usingTouch = true;
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('on');
        if (act === 'jump') this.pressJump();
        if (act === 'attack') this.pressAttack();
        if (act === 'dash') this.pressDash();
      });
      const off = (e) => {
        btn.classList.remove('on');
        if (act === 'jump') this.releaseJump();
        if (e) e.preventDefault();
      };
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });

    /* Джойстик: появляется там, где палец коснулся левой зоны */
    const zone = root.querySelector('#stickZone');
    const stickEl = root.querySelector('#stick');
    const knobEl = root.querySelector('#knob');
    const R = 46; // радиус хода

    const place = (x, y) => {
      const b = root.getBoundingClientRect();
      stickEl.style.left = (x - b.left) + 'px';
      stickEl.style.top = (y - b.top) + 'px';
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.usingTouch = true;
      zone.setPointerCapture(e.pointerId);
      this._stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY, dx: 0, dy: 0 };
      place(e.clientX, e.clientY);
      stickEl.classList.add('on');
      knobEl.style.transform = 'translate(-50%,-50%)';
    });

    zone.addEventListener('pointermove', (e) => {
      const s = this._stick;
      if (!s || s.id !== e.pointerId) return;
      e.preventDefault();
      let dx = e.clientX - s.cx, dy = e.clientY - s.cy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      s.dx = dx / R; s.dy = dy / R;
      this.axisX = Math.abs(s.dx) < 0.16 ? 0 : clamp(s.dx * 1.35, -1, 1);
      knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });

    const endStick = (e) => {
      const s = this._stick;
      if (!s || s.id !== e.pointerId) return;
      this._stick = null;
      this.axisX = 0;
      stickEl.classList.remove('on');
      knobEl.style.transform = 'translate(-50%,-50%)';
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    /* Никакого зума/скролла/выделения на телефоне */
    root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    root.addEventListener('gesturestart', (e) => e.preventDefault());
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  },
};
