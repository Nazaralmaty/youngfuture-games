/*!
 * StudyLine Game Bridge v1
 * ---------------------------------------------------------------------------
 * Единый контракт между HTML5-игрой и мобильным приложением StudyLine.
 *
 * Зачем: игра не должна знать, где она запущена — в Android, в iOS или в
 * обычном браузере. Она просто зовёт SL.ready() / SL.finish(), а мост сам
 * доставляет сообщение туда, куда нужно.
 *
 * Подключение в игре — одна строка в <head>:
 *   <script src="../bridge/studyline-bridge.js"></script>
 *
 * Использование в игре — четыре вызова:
 *   SL.init({ game: 'math_arcade' });   // один раз при старте
 *   SL.ready();                          // игра загрузилась и готова
 *   SL.finish({ score: 42, ... });       // игра завершена (главное!)
 *   SL.close();                          // ребёнок нажал «выйти»
 *
 * ВАЖНО: игра НЕ считает XP. Она отправляет сырой результат, а XP начисляет
 * бэкенд StudyLine по своим правилам. Так экономику XP можно менять без
 * перевыпуска игр — тот же принцип, что «конфиг без релиза».
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var PROTOCOL_VERSION = 1;
  var SOURCE = 'studyline-game';

  var state = {
    game: 'unknown',
    host: null,
    finished: false,
    listeners: {}
  };

  // --- 1. Где мы запущены ---------------------------------------------------

  function detectHost() {
    if (global.ReactNativeWebView && typeof global.ReactNativeWebView.postMessage === 'function') {
      return 'react-native';
    }
    if (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.StudyLine) {
      return 'ios';
    }
    if (global.StudyLineAndroid && typeof global.StudyLineAndroid.postMessage === 'function') {
      return 'android';
    }
    if (global.flutter_inappwebview) {
      return 'flutter';
    }
    if (global.parent && global.parent !== global) {
      return 'iframe'; // симулятор приложения или встраивание на страницу
    }
    return 'browser'; // открыли игру напрямую — режим отладки
  }

  /*
   * «Внутри приложения» = либо нативный WebView, либо нам передали sid
   * (идентификатор сессии). Второе нужно, чтобы симулятор из /test вёл себя
   * ровно как настоящее приложение, а игра, случайно встроенная на обычный
   * сайт, — нет.
   */
  function isInApp() {
    if (state.host !== 'browser' && state.host !== 'iframe') return true;
    return Boolean(state.sessionId);
  }

  // --- 2. Кто играет --------------------------------------------------------
  // Приложение передаёт данные ребёнка параметрами ссылки:
  //   math_arcade.html?uid=8421&name=Алихан&cls=5&sid=abc123&lang=kk

  function readQueryParams() {
    var params = {};
    var query = (global.location.search || '').replace(/^\?/, '');
    if (!query) return params;

    query.split('&').forEach(function (pair) {
      if (!pair) return;
      var eq = pair.indexOf('=');
      var key = eq < 0 ? pair : pair.slice(0, eq);
      var value = eq < 0 ? '' : pair.slice(eq + 1);
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
      } catch (e) {
        params[key] = value;
      }
    });
    return params;
  }

  function buildUser(params) {
    if (!params.uid) return null;
    return {
      id: params.uid,
      name: params.name || '',
      cls: params.cls || '',
      lang: params.lang || 'kk'
    };
  }

  // --- 3. Отправка сообщений в приложение -----------------------------------

  function buildMessage(type, payload) {
    return {
      source: SOURCE,
      v: PROTOCOL_VERSION,
      type: type,
      game: state.game,
      sessionId: state.sessionId || null,
      userId: state.user ? state.user.id : null,
      ts: new Date().toISOString(),
      payload: payload || {}
    };
  }

  function send(type, payload) {
    var message = buildMessage(type, payload);
    var json = JSON.stringify(message);

    switch (state.host) {
      case 'react-native':
        global.ReactNativeWebView.postMessage(json);
        break;
      case 'ios':
        global.webkit.messageHandlers.StudyLine.postMessage(json);
        break;
      case 'android':
        global.StudyLineAndroid.postMessage(json);
        break;
      case 'flutter':
        global.flutter_inappwebview.callHandler('StudyLine', json);
        break;
      case 'iframe':
        global.parent.postMessage(json, '*');
        break;
      default:
        // Обычный браузер — просто показываем в консоли, чтобы можно было
        // проверить игру без приложения.
        if (global.console && console.log) {
          console.log('[StudyLine Bridge] ' + type, message);
        }
    }
    return message;
  }

  // --- 4. Приём сообщений ОТ приложения -------------------------------------
  // Приложение может попросить игру: pause / resume / close.
  // Нативный код зовёт: window.StudyLine._receive('{"type":"pause"}')

  function receive(raw) {
    var message;
    try {
      message = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return;
    }
    if (!message || !message.type) return;

    var handlers = state.listeners[message.type] || [];
    handlers.forEach(function (handler) {
      try {
        handler(message.payload || {});
      } catch (e) {
        if (global.console && console.error) console.error('[StudyLine Bridge]', e);
      }
    });
  }

  global.addEventListener('message', function (event) {
    if (typeof event.data === 'string' && event.data.indexOf('studyline-app') > -1) {
      receive(event.data);
    }
  });

  // --- 5. Публичный API -----------------------------------------------------

  var SL = {
    version: PROTOCOL_VERSION,

    /** Вызвать один раз при старте игры. */
    init: function (options) {
      options = options || {};
      var params = readQueryParams();

      state.game = options.game || params.game || 'unknown';
      state.host = detectHost();
      state.user = buildUser(params);
      state.sessionId = params.sid || null;

      SL.user = state.user;
      SL.isInApp = isInApp();
      SL.host = state.host;
      SL.game = state.game;
      return SL;
    },

    /** Игра загрузилась и готова к показу. Приложение снимает свой лоадер. */
    ready: function () {
      return send('ready', {
        width: global.innerWidth,
        height: global.innerHeight
      });
    },

    /** Промежуточный прогресс. Необязательно — можно слать раз в уровень. */
    progress: function (data) {
      return send('progress', data || {});
    },

    /**
     * Игра завершена. Это главное сообщение — по нему начисляется XP.
     * Отправляем сырой результат, XP считает бэкенд.
     *
     * SL.finish({
     *   score: 42,           // очки внутри игры
     *   correct: 38,         // верных ответов
     *   mistakes: 4,         // ошибок
     *   durationSec: 145,    // сколько играл
     *   difficulty: 'medium',
     *   details: {}          // что угодно ещё
     * });
     */
    finish: function (result) {
      if (state.finished) return null; // защита от двойной отправки
      state.finished = true;
      return send('finish', result || {});
    },

    /** Ребёнок нажал «выйти». Приложение закрывает экран игры. */
    close: function () {
      return send('close', {});
    },

    /** Подписка на команды от приложения: 'pause' | 'resume' | 'close'. */
    on: function (type, handler) {
      if (!state.listeners[type]) state.listeners[type] = [];
      state.listeners[type].push(handler);
      return SL;
    },

    /** Внутреннее — сюда пишет нативный код приложения. */
    _receive: receive,

    // Заполняются в init()
    user: null,
    isInApp: false,
    host: null,
    game: null
  };

  global.StudyLine = SL;
  global.SL = SL;
})(window);
