/*!
 * YoungFuture Games — модуль базы данных (Supabase)
 * ---------------------------------------------------------------------------
 * Заменяет старый YF_ACCOUNT: вместо localStorage + Google-таблицы результаты
 * пишутся в настоящую базу, с проверкой прав и подтверждением записи.
 *
 * Написан на чистом fetch, без библиотек — игры остаются самодостаточными
 * файлами, которые можно открыть где угодно, в том числе внутри WebView.
 *
 * Подключение в игре — одна строка:
 *   <script src="../db/games-db.js"></script>
 *
 * Использование:
 *   DB.init({ game: 'math_arcade' });
 *   await DB.signUp({ email, password, childName, childClass, parentPhone });
 *   await DB.signIn({ email, password });
 *   await DB.saveSession({ score, correct, mistakes, maxCombo, durationSec, difficulty });
 *   await DB.weeklyTop();
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  /*
   * Вход по НОМЕРУ ТЕЛЕФОНА. Родитель вводит только номер и пароль —
   * никакой почты он не видит и не заполняет.
   *
   * Почему внутри всё же почта: телефонный вход в Supabase требует платного
   * SMS-провайдера (~15–25 ₸ за сообщение, и при регистрации, и при каждом
   * входе). Для игры это лишние деньги, поэтому номер превращается в
   * технический адрес 77001234567@yf.games. Домен нероутируемый — письма
   * туда физически не уходят.
   *
   * Если позже подключите Twilio — переходим на настоящий SMS-вход, номер
   * для этого уже лежит в players.parent_phone.
   */
  var AUTH_DOMAIN = 'yf.games';

  var URL_BASE = 'https://ckayydaqncvnbecjlltf.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrYXl5ZGFxbmN2bmJlY2psbHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2ODE1MjUsImV4cCI6MjA3NTI1NzUyNX0.o_7QJTdpkl14axm8vDfVH7NahbTvJreHAuI62dYG6U8';
  var STORE_KEY = 'yf_session_v1';

  var state = { game: 'unknown', session: null, player: null };

  // --- Хранение сессии ------------------------------------------------------

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  }

  function saveSession(s) {
    state.session = s;
    try {
      if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* приватный режим — работаем без сохранения */ }
  }

  function storeAuth(data) {
    if (!data || !data.access_token) return null;
    var s = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user && data.user.id,
      expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000
    };
    saveSession(s);
    return s;
  }

  // --- Запросы --------------------------------------------------------------

  function request(path, options) {
    options = options || {};
    var headers = { apikey: ANON_KEY, 'Content-Type': 'application/json' };
    if (options.token) headers.Authorization = 'Bearer ' + options.token;
    if (options.headers) Object.assign(headers, options.headers);

    return fetch(URL_BASE + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!res.ok) {
          var msg = (data && (data.msg || data.message || data.error_description ||
                              data.error || data.hint)) || ('Қате ' + res.status);
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  /** Токен живёт час. Если истёк — молча обновляем и продолжаем. */
  function withToken() {
    var s = state.session;
    if (!s) return Promise.reject(new Error('Кіру қажет'));
    if (Date.now() < s.expires_at) return Promise.resolve(s.access_token);

    return request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: s.refresh_token }
    }).then(function (data) {
      var fresh = storeAuth(data);
      return fresh.access_token;
    }).catch(function (err) {
      saveSession(null);
      throw err;
    });
  }

  // --- Профиль --------------------------------------------------------------

  function fetchPlayer() {
    return withToken().then(function (token) {
      return request('/rest/v1/players?select=*&limit=1', { token: token });
    }).then(function (rows) {
      state.player = (rows && rows[0]) || null;
      DB.player = state.player;
      // Вошёл, но профиля нет — например, интернет оборвался между
      // регистрацией и записью профиля. Без профиля результаты сохранить
      // нельзя (внешний ключ), поэтому просим только имя ребёнка и дописываем.
      DB.needsProfile = !state.player;
      return state.player;
    });
  }

  /** Номер лежит в самом токене: 77001234567@yf.games → 77001234567 */
  function phoneFromToken() {
    try {
      var claims = JSON.parse(atob(state.session.access_token.split('.')[1]));
      return (claims.email || '').split('@')[0] || null;
    } catch (e) { return null; }
  }

  // --- Публичный API --------------------------------------------------------

  var DB = {

    /** Вызвать один раз при старте игры. */
    init: function (options) {
      state.game = (options && options.game) || 'unknown';
      state.session = loadSession();
      DB.game = state.game;
      DB.isSignedIn = Boolean(state.session);
      return state.session ? fetchPlayer().catch(function () { return null; }) : Promise.resolve(null);
    },

    /** Регистрация родителя + данные ребёнка одним шагом. Вход по номеру. */
    signUp: function (form) {
      var phone = normalizePhone(form.phone);
      if (!phone) return Promise.reject(new Error('Нөмірді дұрыс жазыңыз'));

      return request('/auth/v1/signup', {
        method: 'POST',
        body: { email: phoneToEmail(phone), password: form.password }
      }).then(function (data) {
        // Если в проекте включено подтверждение, токена ещё нет —
        // сразу логинимся, чтобы не терять игрока на этом шаге.
        if (data && data.access_token) return storeAuth(data);
        return DB.signIn({ phone: phone, password: form.password }).then(function () {
          return state.session;
        });
      }).then(function () {
        return withToken();
      }).then(function (token) {
        return request('/rest/v1/players', {
          method: 'POST',
          token: token,
          headers: { Prefer: 'return=representation' },
          body: {
            id: state.session.user_id,
            child_name: form.childName,
            child_class: form.childClass || null,
            parent_phone: phone,
            locale: form.locale || 'kk'
          }
        });
      }).then(function (rows) {
        state.player = (rows && rows[0]) || null;
        DB.player = state.player;
        DB.isSignedIn = true;
        return state.player;
      });
    },

    /**
     * Дописать профиль, если аккаунт есть, а профиля нет.
     * Номер берём из токена — заново его спрашивать незачем.
     */
    completeProfile: function (form) {
      var phone = phoneFromToken();
      if (!phone) return Promise.reject(new Error('Қайта кіріңіз'));

      return withToken().then(function (token) {
        return request('/rest/v1/players', {
          method: 'POST',
          token: token,
          headers: { Prefer: 'return=representation' },
          body: {
            id: state.session.user_id,
            child_name: form.childName,
            child_class: form.childClass || null,
            parent_phone: phone,
            locale: form.locale || 'kk'
          }
        });
      }).then(function (rows) {
        state.player = (rows && rows[0]) || null;
        DB.player = state.player;
        DB.needsProfile = !state.player;
        return state.player;
      });
    },

    signIn: function (form) {
      var phone = normalizePhone(form.phone);
      if (!phone) return Promise.reject(new Error('Нөмірді дұрыс жазыңыз'));

      return request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email: phoneToEmail(phone), password: form.password }
      }).then(function (data) {
        storeAuth(data);
        DB.isSignedIn = true;
        return fetchPlayer();
      });
    },

    signOut: function () {
      saveSession(null);
      state.player = null;
      DB.player = null;
      DB.isSignedIn = false;
      return Promise.resolve();
    },

    /** Записать сыгранную партию. Возвращает сохранённую строку. */
    saveSession: function (result) {
      return withToken().then(function (token) {
        return request('/rest/v1/game_sessions', {
          method: 'POST',
          token: token,
          headers: { Prefer: 'return=representation' },
          body: {
            player_id:    state.session.user_id,
            game:         state.game,
            difficulty:   result.difficulty || null,
            score:        result.score        | 0,
            correct:      result.correct      | 0,
            mistakes:     result.mistakes     | 0,
            max_combo:    result.maxCombo     | 0,
            duration_sec: result.durationSec  | 0,
            source:       result.source || 'web'
          }
        });
      }).then(function (rows) { return (rows && rows[0]) || null; });
    },

    /** Топ недели: [{place, child_name, best_score, is_me}] */
    weeklyTop: function (limit) {
      return withToken().then(function (token) {
        return request('/rest/v1/rpc/weekly_leaderboard', {
          method: 'POST',
          token: token,
          body: { p_game: state.game, p_limit: limit || 10 }
        });
      });
    },

    /** Своё место, даже если не в топе: {place, best_score, total_players} */
    myRank: function () {
      return withToken().then(function (token) {
        return request('/rest/v1/rpc/my_weekly_rank', {
          method: 'POST',
          token: token,
          body: { p_game: state.game }
        });
      }).then(function (rows) { return (rows && rows[0]) || null; });
    },

    // Заполняются в init() / signIn()
    isSignedIn: false,
    needsProfile: false,
    player: null,
    game: null
  };

  /**
   * Любой казахстанский формат → 77001234567.
   * «8 700 123 45 67», «+7 700 123 45 67», «700 123 45 67» — всё сводится
   * к одному виду, чтобы один и тот же человек не завёл два аккаунта.
   * Возвращает null, если номер не похож на настоящий.
   */
  function normalizePhone(raw) {
    var d = (raw || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '8') d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    return (d.length === 11 && d.charAt(0) === '7') ? d : null;
  }

  function phoneToEmail(phone) {
    return phone + '@' + AUTH_DOMAIN;
  }

  DB.normalizePhone = normalizePhone;

  /* ═══════════════════════════════════════════════════════════════════════
   * ИНТЕРФЕЙС
   * Экран входа и лидерборд живут здесь, а не в каждой игре — иначе одни и
   * те же 120 строк пришлось бы держать в четырёх файлах и править вчетверо.
   * Игре достаточно двух вызовов: DB.mountAuth() и DB.finish().
   * ═══════════════════════════════════════════════════════════════════════ */

  var AUTH_CSS = [
    '#yfAuth{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(7,11,30,.94);backdrop-filter:blur(6px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;overflow-y:auto}',
    '#yfAuth .bx{width:100%;max-width:340px;background:linear-gradient(160deg,#0e2247,#0b1a33);border:1px solid #22305f;border-radius:22px;padding:24px 20px;color:#eaf0ff;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);margin:auto}',
    '#yfAuth .lg{width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#6d4bff,#21d4fd);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px}',
    '#yfAuth h3{font-size:22px;font-weight:900;margin:0 0 4px}',
    '#yfAuth .sb{font-size:13px;color:#9fb0d8;margin-bottom:16px;line-height:1.45}',
    '#yfAuth input{width:100%;border:2px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:14px;padding:13px 15px;font-size:16px;font-family:inherit;margin-bottom:10px;outline:none}',
    '#yfAuth input:focus{border-color:#8a6bff}',
    '#yfAuth .er{color:#ff6b6b;font-size:13px;min-height:18px;margin-bottom:4px;line-height:1.35}',
    '#yfAuth .go{width:100%;border:none;cursor:pointer;font-family:inherit;font-weight:900;font-size:17px;color:#0b1330;background:linear-gradient(135deg,#9be870,#d6ff8a);border-radius:14px;padding:14px}',
    '#yfAuth .go:disabled{opacity:.55}',
    '#yfAuth .sw{margin-top:13px;font-size:13px;color:#9fb0d8}',
    '#yfAuth .sw b{color:#9be870;cursor:pointer;font-weight:800}',
    '#yfAuth .hn{font-size:11px;color:#7e8db0;margin-top:12px;line-height:1.45}',
    '#yfAuth .up{display:block}',
    '#yfAuth.in .up{display:none}',
    '#yfAuth.fix #yfPhone,#yfAuth.fix #yfPass,#yfAuth.fix .sw{display:none}',
    '.yfLb{width:100%;max-width:340px;margin:12px auto 0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:12px 14px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}',
    '.yfLb .t{font-size:11px;font-weight:800;letter-spacing:.8px;color:#9aa3d0;text-transform:uppercase;margin-bottom:9px}',
    '.yfLb .r{display:flex;align-items:center;gap:9px;padding:5px 0;font-size:13.5px;color:#eaf0ff}',
    '.yfLb .r .p{width:22px;font-weight:900;color:#9aa3d0;flex:none}',
    '.yfLb .r .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.yfLb .r .s{font-weight:900;color:#ffce4a}',
    '.yfLb .r.me{background:rgba(155,232,112,.12);border-radius:9px;padding:5px 7px;margin:0 -7px}',
    '.yfLb .r.me .n{color:#9be870;font-weight:800}',
    '.yfLb .e{font-size:12.5px;color:#7e8db0;text-align:center;padding:6px 0}'
  ].join('\n');

  var AUTH_HTML = [
    '<div class="bx">',
    '  <div class="lg">🎮</div>',
    '  <h3 id="yfH">Тіркелу</h3>',
    '  <div class="sb" id="yfS">Нөміріңізді жазыңыз — баланың прогресі сақталады.</div>',
    '  <input id="yfPhone" type="tel" inputmode="tel" placeholder="+7 700 000 00 00" autocomplete="tel">',
    '  <input id="yfPass" type="password" placeholder="Құпия сөз (кемінде 6 таңба)" autocomplete="current-password">',
    '  <input id="yfName" class="up" placeholder="Баланың аты" autocomplete="off">',
    '  <input id="yfClass" class="up" placeholder="Сыныбы (мыс. 5)" autocomplete="off">',
    '  <div class="er" id="yfE"></div>',
    '  <button class="go" id="yfGo">Тіркелу ▶</button>',
    '  <div class="sw" id="yfSw">Аккаунтыңыз бар ма? <b>Кіру</b></div>',
    '  <div class="hn">SMS жіберілмейді, растау қажет емес.<br>Аккаунт барлық ойындарға ортақ 🔒</div>',
    '</div>'
  ].join('\n');

  function el(id) { return document.getElementById(id); }

  /**
   * Показывает экран входа, если родитель ещё не зарегистрирован.
   * Аккаунт общий для всех игр: сессия лежит в localStorage одного домена,
   * поэтому со второй игры входить заново не нужно.
   */
  DB.mountAuth = function (options) {
    var style = document.createElement('style');
    style.textContent = AUTH_CSS;
    document.head.appendChild(style);

    var box = document.createElement('div');
    box.id = 'yfAuth';
    box.innerHTML = AUTH_HTML;
    document.body.appendChild(box);

    var mode = 'up';

    var TEXTS = {
      up:  { h: 'Тіркелу', s: 'Нөміріңізді жазыңыз — баланың прогресі сақталады.',
             go: 'Тіркелу ▶', sw: 'Аккаунтыңыз бар ма? <b>Кіру</b>' },
      in:  { h: 'Кіру', s: 'Нөміріңіз бен құпия сөзді енгізіңіз.',
             go: 'Кіру ▶', sw: 'Аккаунтыңыз жоқ па? <b>Тіркелу</b>' },
      fix: { h: 'Аз ғана қалды', s: 'Баланың атын жазыңыз — сонда нәтижелері сақталады.',
             go: 'Сақтау ▶', sw: '' }
    };

    function setMode(next) {
      mode = next;
      box.classList.toggle('in',  mode === 'in');
      box.classList.toggle('fix', mode === 'fix');
      var t = TEXTS[mode];
      el('yfH').textContent  = t.h;
      el('yfS').textContent  = t.s;
      el('yfGo').textContent = t.go;
      el('yfSw').innerHTML   = t.sw;
      el('yfE').textContent  = '';
    }

    function hide() { box.style.display = 'none'; }

    function submit() {
      el('yfE').textContent = '';
      var form = {};

      if (mode !== 'fix') {
        form.phone = normalizePhone(el('yfPhone').value);
        form.password = el('yfPass').value;
        if (!form.phone) { el('yfE').textContent = 'Нөмірді дұрыс жазыңыз: +7 700 000 00 00'; return; }
        if (form.password.length < 6) { el('yfE').textContent = 'Құпия сөз кемінде 6 таңба'; return; }
      }

      if (mode !== 'in') {
        form.childName  = el('yfName').value.trim();
        form.childClass = el('yfClass').value.trim();
        if (!form.childName) { el('yfE').textContent = 'Баланың атын жазыңыз'; return; }
      }

      el('yfGo').disabled = true;
      el('yfGo').textContent = 'Күте тұрыңыз…';

      var action = mode === 'up'  ? DB.signUp(form)
                 : mode === 'in'  ? DB.signIn(form)
                 :                  DB.completeProfile(form);

      action
        .then(function () {
          // После входа могло выясниться, что профиля нет — дописываем.
          if (DB.needsProfile) { setMode('fix'); return; }
          hide();
        })
        .catch(function (e) {
          var m = String(e.message || e);
          if (/already registered|already exists|duplicate/i.test(m)) {
            el('yfE').textContent = 'Бұл нөмір тіркелген. «Кіру» батырмасын басыңыз';
            setMode('in');
          } else if (/Invalid login/i.test(m)) {
            el('yfE').textContent = 'Нөмір немесе құпия сөз қате';
          } else {
            el('yfE').textContent = m;
          }
        })
        .then(function () {
          el('yfGo').disabled = false;
          el('yfGo').textContent = TEXTS[mode].go;
        });
    }

    el('yfGo').addEventListener('click', submit);
    el('yfSw').addEventListener('click', function (e) {
      if (e.target.tagName === 'B') setMode(mode === 'up' ? 'in' : 'up');
    });
    el('yfPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

    return DB.init(options).then(function () {
      if (DB.needsProfile) setMode('fix');
      else if (DB.isSignedIn) hide();
      else setMode('up');
    });
  };

  function escapeText(t) {
    var d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
  }

  /**
   * Сохранить партию и показать топ недели.
   * container — любой элемент; если его нет, лидерборд просто не рисуется.
   */
  DB.finish = function (result, container) {
    if (!DB.isSignedIn) {
      if (container) container.style.display = 'none';
      return Promise.resolve(null);
    }

    if (container) {
      container.style.display = 'block';
      container.className = 'yfLb';
      container.innerHTML = '<div class="t">Апта үздіктері</div><div class="e">Жүктелуде…</div>';
    }

    return DB.saveSession(result)
      .then(function () { return Promise.all([DB.weeklyTop(5), DB.myRank()]); })
      .then(function (r) { if (container) renderBoard(container, r[0] || [], r[1]); })
      .catch(function (e) {
        // Не сваливаем всё в «нет интернета» — причины разные, и врать не нужно.
        var m = String(e && e.message || '');
        var hint = /foreign key/i.test(m) ? 'Профиль толтырылмаған — ойынды қайта ашыңыз'
                 : /Кіру қажет/.test(m)   ? 'Қайта кіру қажет'
                 :                          'Нәтиже сақталмады — байланысты тексеріңіз';
        if (container) {
          container.innerHTML = '<div class="t">Апта үздіктері</div><div class="e">' + hint + '</div>';
        }
        if (global.console) console.warn('[DB]', m);
      });
  };

  function renderBoard(container, top, mine) {
    if (!top.length) {
      container.innerHTML = '<div class="t">Апта үздіктері</div>' +
        '<div class="e">Сен осы аптада біріншісің 🎉</div>';
      return;
    }
    var html = '<div class="t">Апта үздіктері</div>', inTop = false;
    top.forEach(function (r) {
      if (r.is_me) inTop = true;
      html += '<div class="r' + (r.is_me ? ' me' : '') + '">' +
                '<span class="p">' + r.place + '</span>' +
                '<span class="n">' + escapeText(r.child_name) + '</span>' +
                '<span class="s">' + r.best_score + '</span></div>';
    });
    if (!inTop && mine) {
      html += '<div class="r me"><span class="p">' + mine.place + '</span>' +
              '<span class="n">Сен</span><span class="s">' + mine.best_score + '</span></div>';
    }
    container.innerHTML = html;
  }

  global.DB = DB;
  global.YF_DB = DB;
})(window);
