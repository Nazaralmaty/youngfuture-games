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
      return state.player;
    });
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
  global.DB = DB;
  global.YF_DB = DB;
})(window);
