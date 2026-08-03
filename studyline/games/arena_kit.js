/*!
 * StudyLine · Arena Kit
 * ---------------------------------------------------------------------------
 * Общая обвязка предметных арен: прогресс в localStorage, недельная шкала,
 * экран карты (17 тапсырм = 1 биом) и экран «Қателермен жұмыс».
 *
 * Зачем отдельный файл, а не копия в каждой игре: карта, недельная шкала и
 * антиугадайка в разборе ошибок — это ОДНО продуктовое решение на все арены
 * (см. АРЕНА_2.0_ТЗ_RU.md, п. 1.4). Скопировать их в третий и четвёртый раз
 * значит потом чинить одно и то же в четырёх местах.
 *
 * Игра остаётся одним HTML-файлом со своей механикой, звуком и рисованием —
 * kit не знает, во что играют. Подключается как бридж, одной строкой:
 *   <script src="arena_kit.js"></script>
 *
 * Ноль внешних файлов и библиотек — правило репозитория соблюдено.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var BIOME_NODES = 17;   /* биом 1 = ранг Балапан, StudyLine_ГЕЙМИФИКАЦИЯ_ДЕҢГЕЙ_RU.md */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Детерминированный ГПСЧ: тапсырма №N обязана быть той же самой при
     повторе, иначе «переиграть» ничего не значит. */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ═════════ ПРОГРЕСС ═════════
     Источник истины по XP — бэкенд StudyLine. Здесь только «где я на карте»,
     чтобы ребёнок вернулся и продолжил, а не начал сначала. */
  function makeSave(key, maxNodes) {
    var S = {
      key: key,
      max: maxNodes || BIOME_NODES,
      data: { stars: {}, cur: 1, week: null },

      load: function () {
        try {
          var r = localStorage.getItem(this.key);
          if (r) { var d = JSON.parse(r); if (d && d.stars) this.data = d; }
        } catch (e) {}
        return this;
      },
      put: function () {
        try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {}
      },
      starsOf: function (n) { return this.data.stars[n] || 0; },
      unlocked: function (n) { return n <= this.data.cur; },
      complete: function (n, stars) {
        if (stars > this.starsOf(n)) this.data.stars[n] = stars;
        /* cur уходит на max+1 — это «биом пройден целиком», иначе счётчик
           на карте навсегда застревал бы на 16 / 17 */
        if (n >= this.data.cur) this.data.cur = Math.min(this.max + 1, n + 1);
        this.put();
      },
      total: function () {
        var s = 0; for (var k in this.data.stars) s += this.data.stars[k];
        return s;
      },

      /* Недельная шкала вместо стрика: стрик наказывает за пропуск и после
         срыва выталкивает ребёнка совсем — запрещено продуктовым документом
         StudyLine_ГЕЙМИФИКАЦИЯ_ДЕҢГЕЙ_RU.md. Шкала сама обнуляется в
         понедельник, пропуск дня ничего не отнимает. */
      weekKey: function () {
        var d = new Date(); d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      },
      weekDays: function () {
        var k = this.weekKey();
        if (!this.data.week || this.data.week.k !== k)
          this.data.week = { k: k, d: [0, 0, 0, 0, 0, 0, 0] };
        return this.data.week.d;
      },
      markToday: function () {
        var d = this.weekDays(), i = (new Date().getDay() + 6) % 7;
        if (!d[i]) { d[i] = 1; this.put(); return true; }
        return false;
      },
      daysThisWeek: function () {
        var d = this.weekDays(), n = 0;
        for (var i = 0; i < 7; i++) if (d[i]) n++;
        return n;
      }
    };
    return S;
  }

  /* ═════════ СТИЛИ ═════════
     Инжектим один раз: игре не нужно держать у себя разметку карты. */
  var CSS = ''
    + '.ak-scr{position:absolute;inset:0;z-index:7;display:none;flex-direction:column;'
    + '  background:var(--ak-bg,#0a2018);color:#fff;font-family:inherit}'
    + '.ak-scr.on{display:flex}'
    + '.ak-top{flex:none;padding:calc(12px + env(safe-area-inset-top)) 16px 10px;'
    + '  display:flex;align-items:center;gap:9px}'
    + '.ak-top h3{font-size:17px;font-weight:900;letter-spacing:-.3px}'
    + '.ak-top .ak-sub{font-size:11.5px;color:var(--ak-dim,#9fd6b6);font-weight:800;margin-top:2px}'
    + '.ak-week{margin-left:auto;display:flex;gap:4px}'
    + '.ak-week i{width:9px;height:9px;border-radius:3px;background:rgba(255,255,255,.18);font-style:normal}'
    + '.ak-week i.on{background:var(--ak-accent,#9be870)}'
    /* min-height:0 обязателен: без него flex-элемент растягивается под всю
       высоту содержимого, карта не скроллится, а кнопка уезжает за экран */
    + '.ak-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;position:relative;'
    + '  -webkit-overflow-scrolling:touch;padding:14px 0 26px}'
    + '.ak-path{position:absolute;inset:0;width:100%;pointer-events:none}'
    + '.ak-node{position:absolute;transform:translate(-50%,-50%);width:62px;text-align:center;'
    + '  border:none;background:none;cursor:pointer;font-family:inherit;padding:0}'
    + '.ak-node i{display:grid;place-items:center;width:54px;height:54px;margin:0 auto;border-radius:19px;'
    + '  font-style:normal;font-size:19px;font-weight:900;color:#0d2a18;'
    + '  background:linear-gradient(180deg,#ffe9a8,#f4c14e);box-shadow:0 5px 0 #b8862a,0 10px 20px rgba(0,0,0,.4)}'
    + '.ak-node.done i{background:linear-gradient(180deg,#c7f59a,#7fce4c);box-shadow:0 5px 0 #4d8f2b,0 10px 20px rgba(0,0,0,.4)}'
    + '.ak-node.lock i{background:linear-gradient(180deg,#5b6b63,#3c4a44);box-shadow:0 5px 0 #26302b;color:#9fb5a8}'
    + '.ak-node.cur i{animation:ak-pulse 1.5s ease-in-out infinite}'
    + '@keyframes ak-pulse{0%,100%{transform:none}50%{transform:scale(1.11)}}'
    + '.ak-node:active i{transform:translateY(3px)}'
    + '.ak-node b{display:block;margin-top:5px;font-size:11px;letter-spacing:.6px;color:#ffdf8a;height:12px}'
    + '.ak-node.lock b{color:transparent}'
    + '.ak-boss i{width:62px;height:62px;font-size:24px}'
    + '.ak-dock{flex:none;padding:10px 16px calc(14px + env(safe-area-inset-bottom))}'
    /* разбор ошибок */
    + '.ak-drill{position:absolute;inset:0;z-index:8;display:none;align-items:center;justify-content:center;'
    + '  padding:24px 20px;background:rgba(5,22,17,.78);backdrop-filter:blur(7px)}'
    + '.ak-drill.on{display:flex}'
    + '.ak-card{width:100%;max-width:340px;background:linear-gradient(170deg,#1b3a2c,#0f2620);'
    + '  border:1px solid rgba(255,255,255,.16);border-radius:26px;padding:22px 20px 18px;text-align:center;'
    + '  box-shadow:0 26px 60px rgba(0,0,0,.5);animation:ak-pop .34s cubic-bezier(.2,1.4,.5,1)}'
    + '@keyframes ak-pop{0%{transform:scale(.84) translateY(14px);opacity:0}100%{transform:none;opacity:1}}'
    + '.ak-tag{display:inline-block;padding:5px 13px;border-radius:999px;font-size:11.5px;font-weight:900;'
    + '  letter-spacing:.8px;background:rgba(255,206,74,.18);color:#ffce4a;margin-bottom:12px}'
    + '.ak-q{font-size:30px;font-weight:900;letter-spacing:-.5px;line-height:1.15;word-break:break-word}'
    + '.ak-sub2{font-size:13.5px;color:#bfe6cf;margin-top:8px}'
    + '.ak-opts{display:grid;gap:9px;margin-top:16px}'
    + '.ak-opt{border:none;cursor:pointer;font-family:inherit;font-weight:900;font-size:16px;line-height:1.25;'
    + '  padding:14px 12px;border-radius:15px;color:#0d2a18;'
    + '  background:linear-gradient(180deg,#ffe9a8,#f4c14e);box-shadow:0 5px 0 #b8862a;transition:opacity .2s}'
    + '.ak-opt:active{transform:translateY(3px);box-shadow:0 2px 0 #b8862a}'
    + '.ak-opt.wait{opacity:.45;pointer-events:none}'
    + '.ak-opt.gone{opacity:.25;pointer-events:none;background:#4a5a50;box-shadow:0 5px 0 #2b352f;color:#9fb5a8}'
    + '.ak-dots{display:flex;justify-content:center;gap:7px;margin-top:15px}'
    + '.ak-dots i{width:9px;height:9px;border-radius:99px;background:rgba(255,255,255,.22);font-style:normal}'
    + '.ak-dots i.on{background:var(--ak-accent,#9be870)}'
    + '.ak-hint{font-size:12px;color:#8fc7a8;margin-top:13px;line-height:1.5}';

  var cssDone = false;
  function injectCSS() {
    if (cssDone) return; cssDone = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ═════════ КАРТА БИОМА ═════════
     Змейка из 17 узлов. Пройденные показывают заработанные звёзды,
     следующий пульсирует, остальные закрыты — «куда идти» видно без текста. */
  function makeMap(opt) {
    injectCSS();
    var host = opt.host, save = opt.save, onPick = opt.onPick;
    var nodes = opt.nodes || BIOME_NODES;

    var el = document.createElement('div');
    el.className = 'ak-scr';
    el.innerHTML =
      '<div class="ak-top"><div><h3>' + opt.title + '</h3>' +
      '<div class="ak-sub" data-sub>' + (opt.subtitle || '') + '</div></div>' +
      '<div class="ak-week" data-week></div></div>' +
      '<div class="ak-scroll" data-scroll><svg class="ak-path" data-svg></svg></div>' +
      '<div class="ak-dock"><button class="btn" data-play>Ойнау</button></div>';
    host.appendChild(el);

    var scroll = el.querySelector('[data-scroll]');
    var svg = el.querySelector('[data-svg]');
    var btn = el.querySelector('[data-play]');
    var built = false, nodeEls = [];

    function build() {
      var w = scroll.clientWidth || 360;
      var step = 96, padB = 70;
      var H = padB * 2 + (nodes - 1) * step;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + H);
      svg.setAttribute('height', H);
      svg.style.height = H + 'px';

      var pts = [], i;
      for (i = 0; i < nodes; i++) {
        pts.push({ x: w * 0.5 + Math.sin(i * 0.85) * w * 0.27,
                   y: H - padB - i * step });
      }
      var d = 'M' + pts[0].x + ' ' + pts[0].y;
      for (i = 1; i < nodes; i++) {
        var p0 = pts[i - 1], p1 = pts[i], my = (p0.y + p1.y) / 2;
        d += ' C' + p0.x + ' ' + my + ' ' + p1.x + ' ' + my + ' ' + p1.x + ' ' + p1.y;
      }
      svg.innerHTML =
        '<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="14" stroke-linecap="round"/>' +
        '<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="5" ' +
        'stroke-dasharray="9 13" stroke-linecap="round"/>';

      nodeEls = [];
      for (i = 0; i < nodes; i++) {
        (function (i) {
          var n = i + 1;
          var b = document.createElement('button');
          b.className = 'ak-node' + (n === nodes ? ' ak-boss' : '');
          b.style.left = pts[i].x + 'px';
          b.style.top = pts[i].y + 'px';
          b.innerHTML = '<i></i><b></b>';
          b.addEventListener('click', function () {
            if (!save.unlocked(n)) { if (opt.onLocked) opt.onLocked(n); return; }
            onPick(n);
          });
          scroll.appendChild(b);
          nodeEls.push(b);
        })(i);
      }
      /* высоту содержимого задаёт svg — задавать её ещё и контейнеру нельзя,
         иначе он перестаёт быть окном прокрутки и растёт на всю карту */
      built = true;
    }

    function paint() {
      var wk = el.querySelector('[data-week]'), d = save.weekDays(), i;
      wk.innerHTML = '';
      for (i = 0; i < 7; i++) {
        var w2 = document.createElement('i');
        if (d[i]) w2.className = 'on';
        wk.appendChild(w2);
      }
      for (i = 0; i < nodeEls.length; i++) {
        var n = i + 1, b = nodeEls[i], st = save.starsOf(n);
        b.className = 'ak-node' + (n === nodes ? ' ak-boss' : '')
          + (st ? ' done' : (save.unlocked(n) ? '' : ' lock'))
          + (n === save.data.cur && save.unlocked(n) ? ' cur' : '');
        b.querySelector('i').textContent = st ? (n === nodes ? '🏆' : n)
                                              : (save.unlocked(n) ? n : '🔒');
        b.querySelector('b').textContent = st ? '★'.repeat(st) : '';
      }
      var sub = el.querySelector('[data-sub]');
      if (sub) sub.textContent = (opt.subtitle || '') +
        ' · ★ ' + save.total() + '/' + nodes * 3;
      btn.textContent = save.data.cur > nodes ? 'Қайта ойнау' : 'Ойнау';
    }

    btn.addEventListener('click', function () {
      onPick(Math.min(save.data.cur, nodes));
    });

    return {
      el: el,
      show: function () {
        if (!built) build();
        paint();
        el.classList.add('on');
        /* прокрутка к текущему узлу: карта растёт снизу вверх */
        var i = clamp(save.data.cur, 1, nodes) - 1;
        var b = nodeEls[i];
        if (b) scroll.scrollTop = Math.max(0, b.offsetTop - scroll.clientHeight * 0.62);
      },
      hide: function () { el.classList.remove('on'); },
      refresh: paint
    };
  }

  /* ═════════ РАЗБОР ОШИБОК ═════════
     Каждые 5 тапсырм, только по темам, где ребёнок реально ошибся в этой
     сессии. Ошибок не было — разбора нет: наказывать не за что.

     Защита от угадывания (иначе это капча, а не проверка): варианты
     оживают через ARM_MS, после промаха пауза MISS_MS, правильный ответ
     не подсвечивается — неверный просто гаснет. */
  function makeDrill(opt) {
    injectCSS();
    var ARM_MS = 800, MISS_MS = 1000;
    var el = document.createElement('div');
    el.className = 'ak-drill';
    el.innerHTML =
      '<div class="ak-card">' +
      '<div class="ak-tag" data-tag></div>' +
      '<div class="ak-q" data-q></div>' +
      '<div class="ak-sub2" data-sub></div>' +
      '<div class="ak-opts" data-opts></div>' +
      '<div class="ak-dots" data-dots></div>' +
      '<div class="ak-hint">' + (opt.hint || 'Қателескен жерді бекітеміз') + '</div>' +
      '</div>';
    opt.host.appendChild(el);

    var qs = [], qi = 0, onDone = null, armed = false, lockT = 0;
    var q$ = el.querySelector('[data-q]'), sub$ = el.querySelector('[data-sub]');
    var tag$ = el.querySelector('[data-tag]'), opts$ = el.querySelector('[data-opts]');
    var dots$ = el.querySelector('[data-dots]');

    function render() {
      var q = qs[qi];
      tag$.textContent = q.topic || '';
      q$.textContent = q.text;
      sub$.textContent = q.sub || opt.ask || 'Дұрысын тап';
      opts$.innerHTML = '';
      q.opts.forEach(function (o) {
        var b = document.createElement('button');
        b.className = 'ak-opt wait';
        b.textContent = o;
        b.addEventListener('click', function () { answer(b, o, q); });
        opts$.appendChild(b);
      });
      dots$.innerHTML = '';
      for (var i = 0; i < qs.length; i++) {
        var d = document.createElement('i');
        if (i < qi) d.className = 'on';
        dots$.appendChild(d);
      }
      armed = false;
      setTimeout(function () {
        armed = true;
        var list = opts$.querySelectorAll('.ak-opt');
        for (var i = 0; i < list.length; i++) list[i].classList.remove('wait');
      }, ARM_MS);
    }

    function answer(btn, val, q) {
      if (!armed || Date.now() < lockT) return;
      var ok = (val === q.answer);
      if (opt.onAnswer) opt.onAnswer(q, ok);
      if (ok) {
        qi++;
        if (qi >= qs.length) {
          el.classList.remove('on');
          var cb = onDone; onDone = null;
          if (cb) cb();
          return;
        }
        render();
      } else {
        btn.classList.add('gone');
        lockT = Date.now() + MISS_MS;     /* пауза: перебором не пройти */
        sub$.textContent = opt.slow || 'Асықпа, тағы ойлан';
      }
    }

    return {
      /* questions: [{topic,text,opts:[...],answer,sub}] — вернёт false,
         если разбирать нечего (список пуст). */
      open: function (questions, done) {
        if (!questions || !questions.length) return false;
        qs = questions; qi = 0; onDone = done; lockT = 0;
        el.classList.add('on');
        render();
        return true;
      },
      close: function () { el.classList.remove('on'); }
    };
  }

  global.ArenaKit = {
    BIOME_NODES: BIOME_NODES,
    clamp: clamp, rng: rng, shuffle: shuffle,
    save: makeSave, map: makeMap, drill: makeDrill
  };
})(typeof window !== 'undefined' ? window : this);
