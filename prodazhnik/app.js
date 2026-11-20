/* Отбор и обучение менеджера по продажам. Тексты — content.js, база — db/prodazhnik.sql.
 * Вход по номеру без подтверждения (правило Елжана): номер = ключ записи.
 * ponytail: кто знает чужой номер, может открыть чужую анкету; если станет проблемой — код из 4 цифр при первом входе. */
(function () {
  'use strict';
  var H = window.HIRE;
  var SB = 'https://ckayydaqncvnbecjlltf.supabase.co';
  // anon-ключ публичный по устройству Supabase: таблица закрыта RLS, доступ только через hire_load / hire_save
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrYXl5ZGFxbmN2bmJlY2psbHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2ODE1MjUsImV4cCI6MjA3NTI1NzUyNX0.o_7QJTdpkl14axm8vDfVH7NahbTvJreHAuI62dYG6U8';
  var STORE = 'hire_v1';
  var PASS = 0.8;

  var app = document.getElementById('app');
  var S = load() || { phone: '', name: '', status: 'new', data: {} };
  var pending = {};

  // ---------- хранение ----------
  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function keep() { localStorage.setItem(STORE, JSON.stringify(S)); }

  function rpc(fn, body) {
    return fetch(SB + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
      return r.json();
    });
  }

  function save(section) {
    keep();
    pending[section] = true;
    return flush();
  }
  function flush() {
    var jobs = Object.keys(pending).map(function (sec) {
      return rpc('hire_save', { p_phone: S.phone, p_name: S.name, p_section: sec, p_value: S.data[sec] || {} })
        .then(function (r) { delete pending[sec]; if (r && r.status) S.status = r.status; keep(); });
    });
    return Promise.all(jobs).then(function () { mark(true); }, function () { mark(false); });
  }
  function mark(ok) {
    var el = document.getElementById('sync');
    if (el) { el.textContent = ok ? 'Сохранено' : 'Нет связи — сохранено на телефоне, отправим позже'; el.className = ok ? 'sync ok' : 'sync bad'; }
  }
  window.addEventListener('online', flush);

  // ---------- мелочи ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  function $(sel) { return app.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); }
  function now() { return new Date().toISOString(); }
  function normPhone(v) {
    var d = String(v).replace(/\D/g, '');
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    return /^7\d{10}$/.test(d) ? d : '';
  }
  function head(step) {
    return '<header class="top"><div class="logo">Е</div><div><b>Отбор менеджера</b>' +
      (S.name ? '<span>' + esc(S.name) + '</span>' : '') + '</div>' + (step ? '<i>' + step + '</i>' : '') + '</header>';
  }
  function foot() { return '<p id="sync" class="sync"></p>'; }

  // Поле, которое меряет вставки и время: красные флаги отбора.
  function tracked(meta, key) {
    $$('[data-k="' + key + '"]').forEach(function (el) {
      var m = meta[key] || (meta[key] = { paste: 0, ms: 0, keys: 0 });
      var t0 = 0;
      el.addEventListener('focus', function () { t0 = Date.now(); });
      el.addEventListener('blur', function () { if (t0) { m.ms += Date.now() - t0; t0 = 0; } });
      el.addEventListener('paste', function () { m.paste++; });
      el.addEventListener('keydown', function () { m.keys++; });
      var max = +el.getAttribute('data-max');
      var cnt = el.parentNode.querySelector('.cnt');
      function upd() { if (cnt) { cnt.textContent = el.value.length + (max ? ' / ' + max : ''); cnt.className = 'cnt' + (max && el.value.length > max ? ' over' : ''); } }
      el.addEventListener('input', upd); upd();
    });
  }
  function area(key, max, val, ph) {
    return '<div class="ta"><textarea data-k="' + key + '"' + (max ? ' data-max="' + max + '"' : '') + ' rows="4" placeholder="' +
      esc(ph || 'Ваш ответ') + '">' + esc(val || '') + '</textarea><span class="cnt"></span></div>';
  }

  // ---------- маршрут ----------
  function route() {
    var d = S.data;
    if (!S.phone) return home();
    if (S.status === 'rejected') return msg('Спасибо за время', 'Сейчас мы выбрали других кандидатов. Если откроется ещё одно место, Елжан напишет вам в WhatsApp.');
    if (S.status === 'reserve') return msg('Вы в резерве', 'Сейчас место занято. Как только понадобится ещё один менеджер, Елжан напишет вам первым.');
    if (!d.anketa || !d.anketa.done) return anketa();
    if (d.anketa.stop && d.anketa.stop.length) return msg('Спасибо', 'По анкете эта работа вам сейчас не подходит: ' + esc(d.anketa.stopText) + '. Если что-то изменится, заполните анкету заново.', 'redo');
    if (!d.test || !d.test.done) return testStep(d.test && d.test.step || 0);
    if (S.status === 'trial' || S.status === 'hired') return trial();
    if (S.status === 'interview') return msg('Вас приглашают на созвон', 'Елжан напишет вам в WhatsApp и договорится о времени. Созвон займёт 20 минут. Пока ждёте, можно перечитать уроки.', 'mods');
    if (!d.exam || !d.exam.done) return modules();
    return msg('Экзамен сдан', 'Ответы получены. В течение двух дней Елжан напишет вам в WhatsApp о следующем шаге.', 'mods');
  }

  function msg(title, text, extra) {
    h(head() + '<main><section class="card center"><h1>' + title + '</h1><p>' + text + '</p>' +
      (extra === 'mods' ? '<button class="btn ghost" id="mods">Уроки</button>' : '') +
      (extra === 'redo' ? '<button class="btn ghost" id="redo">Заполнить анкету заново</button>' : '') +
      '<button class="link" id="out">Выйти</button></section></main>');
    if ($('#mods')) $('#mods').onclick = function () { modules(true); };
    if ($('#redo')) $('#redo').onclick = function () { S.data.anketa.done = false; anketa(); };
    $('#out').onclick = logout;
  }
  function logout() { localStorage.removeItem(STORE); S = { phone: '', name: '', status: 'new', data: {} }; home(); }

  // ---------- вакансия и вход ----------
  function home() {
    var v = H.vacancy;
    h('<main class="hero"><div class="badge">Вакансия</div><h1>' + v.title + '</h1><p class="lead">' + v.lead + '</p>' +
      v.blocks.map(function (b) { return '<section class="card"><h2>' + b.h + '</h2><ul>' + b.li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></section>'; }).join('') +
      '<section class="card" id="enter"><h2>Начать</h2><label>Имя<input id="nm" autocomplete="given-name" value="' + esc(S.name) + '"></label>' +
      '<label>Номер WhatsApp<input id="ph" type="tel" inputmode="tel" placeholder="+7 700 000 00 00" autocomplete="tel"></label>' +
      '<p class="err" id="err"></p><button class="btn" id="go">Начать</button><p class="note">' + v.privacy + '</p></section></main>');
    $('#go').onclick = login;
  }

  function login() {
    var name = $('#nm').value.trim(), phone = normPhone($('#ph').value);
    if (!name) return ($('#err').textContent = 'Напишите имя');
    if (!phone) return ($('#err').textContent = 'Номер в формате +7 700 000 00 00');
    $('#go').disabled = true; $('#go').textContent = 'Загружаю…';
    rpc('hire_load', { p_phone: phone }).then(function (r) {
      S = { phone: phone, name: name, status: (r && r.status) || 'new', data: (r && r.data) || {} };
      if (!S.data.events) S.data.events = { first: now() };
      keep();
      if (!r) save('events');
      route();
    }, function () {
      $('#go').disabled = false; $('#go').textContent = 'Начать';
      $('#err').textContent = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
    });
  }

  // ---------- анкета ----------
  function anketa() {
    var a = (S.data.anketa && S.data.anketa.answers) || {};
    var meta = (S.data.anketa && S.data.anketa.meta) || {};
    h(head('Шаг 1 из 4') + '<main><section class="card"><h1>Анкета</h1><p>10 минут. Отвечайте как есть: неправильных ответов здесь нет.</p></section>' +
      H.anketa.map(function (f) {
        var val = a[f.id];
        var inner;
        if (f.type === 'radio' || f.type === 'checks') {
          inner = '<div class="opts">' + f.options.map(function (o, i) {
            var on = f.type === 'radio' ? val === o.v : (val || []).indexOf(o.v) >= 0;
            return '<label class="opt"><input type="' + (f.type === 'radio' ? 'radio' : 'checkbox') + '" name="' + f.id + '" value="' + esc(o.v) + '"' + (on ? ' checked' : '') + '><span>' + esc(o.v) + '</span></label>';
          }).join('') + '</div>';
        } else if (f.type === 'textarea') {
          inner = area(f.id, f.max, val);
        } else {
          inner = '<input data-k="' + f.id + '" value="' + esc(val || '') + '" placeholder="' + esc(f.ph || '') + '">';
        }
        return '<section class="card q" data-f="' + f.id + '"><h3>' + esc(f.label) + '</h3>' + inner + '</section>';
      }).join('') +
      '<p class="err" id="err"></p><button class="btn" id="next">Дальше — тест</button>' + foot() + '</main>');
    H.anketa.forEach(function (f) { if (f.type === 'textarea') tracked(meta, f.id); });
    $('#next').onclick = function () {
      var ans = {}, miss = [], stop = [], stopText = [];
      H.anketa.forEach(function (f) {
        var v;
        if (f.type === 'radio') { var c = app.querySelector('input[name="' + f.id + '"]:checked'); v = c ? c.value : ''; }
        else if (f.type === 'checks') { v = $$('input[name="' + f.id + '"]:checked').map(function (c) { return c.value; }); }
        else v = $('[data-k="' + f.id + '"]').value.trim();
        ans[f.id] = v;
        if (!f.optional && (!v || (Array.isArray(v) && !v.length))) miss.push(f.id);
        (f.options || []).forEach(function (o) { if (o.stop && v === o.v) { stop.push(f.id); stopText.push(f.label.replace(/\?$/, '').toLowerCase() + ' — ' + o.v); } });
      });
      $$('.q').forEach(function (s) { s.classList.toggle('miss', miss.indexOf(s.getAttribute('data-f')) >= 0); });
      if (miss.length) { $('#err').textContent = 'Ответьте на все вопросы, отмеченные красным'; return; }
      S.data.anketa = { done: true, answers: ans, meta: meta, stop: stop, stopText: stopText.join('; '), at: now() };
      save('anketa'); route();
    };
  }

  // ---------- тест ----------
  function testStep(i) {
    var T = S.data.test || (S.data.test = { answers: {}, meta: {}, start: now(), step: 0 });
    var t = H.test[i];
    var a = T.answers;
    var body = '<h1>' + t.title + '</h1><p>' + t.text + '</p>' + (t.quote ? '<blockquote>' + esc(t.quote) + '</blockquote>' : '') + (t.note ? '<p class="note">' + t.note + '</p>' : '');
    var inner = '';
    if (t.kind === 'open') inner = area(t.id, t.max, a[t.id]);
    if (t.kind === 'objections') inner = t.items.map(function (q, j) { return '<h3>' + esc(q) + '</h3>' + area(t.id + '_' + j, t.max, a[t.id + '_' + j]); }).join('');
    if (t.kind === 'mc') inner = t.items.map(function (q, j) { return mcBlock(t.id + '_' + j, q, a[t.id + '_' + j]); }).join('');
    h(head('Шаг 2 из 4 · задание ' + (i + 1) + ' из ' + H.test.length) + '<main><section class="card">' + body + '</section><section class="card">' + inner + '</section>' +
      '<p class="err" id="err"></p><button class="btn" id="next">' + (i < H.test.length - 1 ? 'Дальше' : 'Отправить тест') + '</button>' + foot() + '</main>');
    $$('textarea').forEach(function (el) { tracked(T.meta, el.getAttribute('data-k')); });
    $('#next').onclick = function () {
      var empty = false;
      $$('textarea').forEach(function (el) { a[el.getAttribute('data-k')] = el.value.trim(); if (!el.value.trim()) empty = true; });
      if (t.kind === 'mc') t.items.forEach(function (q, j) { var c = app.querySelector('input[name="' + t.id + '_' + j + '"]:checked'); if (!c) empty = true; else a[t.id + '_' + j] = +c.value; });
      if (empty) { $('#err').textContent = 'Ответьте на всё в этом задании'; return; }
      T.step = i + 1;
      if (i === H.test.length - 1) {
        var mc = H.test.filter(function (x) { return x.kind === 'mc'; })[0];
        T.mcScore = mc.items.filter(function (q, j) { return a[mc.id + '_' + j] === q.ok; }).length + ' / ' + mc.items.length;
        T.done = true; T.end = now();
        save('test'); route();
      } else { save('test'); testStep(i + 1); }
    };
  }

  function mcBlock(name, q, val) {
    return '<div class="mc"><h3>' + esc(q.q) + '</h3>' + q.o.map(function (o, k) {
      return '<label class="opt"><input type="radio" name="' + name + '" value="' + k + '"' + (val === k ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
    }).join('') + '</div>';
  }

  // ---------- уроки ----------
  function modules(readOnly) {
    var M = S.data.modules || (S.data.modules = {});
    var all = H.modules.every(function (m) { return M[m.id] && M[m.id].passed; });
    h(head('Шаг 3 из 4') + '<main><section class="card"><h1>Обучение</h1><p>8 коротких уроков. После каждого — вопросы: урок засчитан, когда верно 80 % и больше. ' +
      'Можно перечитать и пересдать сколько угодно раз.</p></section>' +
      H.modules.map(function (m, i) {
        var r = M[m.id];
        return '<button class="row' + (r && r.passed ? ' done' : '') + '" data-m="' + i + '"><span class="n">' + (i + 1) + '</span><span class="t">' + m.title + '</span><span class="s">' +
          (r && r.passed ? '✓ ' + Math.round(r.best * 100) + ' %' : r ? Math.round(r.best * 100) + ' %' : '') + '</span></button>';
      }).join('') +
      (readOnly ? '<button class="btn ghost" id="back">Назад</button>' :
        '<button class="btn" id="exam"' + (all ? '' : ' disabled') + '>' + (all ? 'Экзамен' : 'Экзамен откроется после всех уроков') + '</button>') + foot() + '</main>');
    $$('.row').forEach(function (b) { b.onclick = function () { lesson(+b.getAttribute('data-m'), readOnly); }; });
    if ($('#exam')) $('#exam').onclick = function () { exam(0); };
    if ($('#back')) $('#back').onclick = route;
  }

  function lesson(i, readOnly) {
    var m = H.modules[i];
    h(head('Урок ' + (i + 1) + ' из ' + H.modules.length) + '<main><section class="card"><h1>' + m.title + '</h1></section>' +
      m.cards.map(function (c) { return '<section class="card lesson">' + c + '</section>'; }).join('') +
      '<section class="card"><h2>Вопросы</h2>' + m.quiz.map(function (q, j) { return mcBlock('q' + j, q); }).join('') +
      '<p class="err" id="err"></p><button class="btn" id="check">Проверить</button></section>' +
      '<button class="btn ghost" id="list">К списку уроков</button>' + foot() + '</main>');
    $('#list').onclick = function () { modules(readOnly); };
    $('#check').onclick = function () {
      var picks = m.quiz.map(function (q, j) { var c = app.querySelector('input[name="q' + j + '"]:checked'); return c ? +c.value : -1; });
      if (picks.indexOf(-1) >= 0) { $('#err').textContent = 'Ответьте на все вопросы'; return; }
      var right = picks.filter(function (p, j) { return p === m.quiz[j].ok; }).length;
      var score = right / m.quiz.length;
      m.quiz.forEach(function (q, j) {
        $$('input[name="q' + j + '"]').forEach(function (inp) {
          var lab = inp.parentNode; lab.classList.remove('good', 'bad');
          if (+inp.value === q.ok && picks[j] === q.ok) lab.classList.add('good');
          if (inp.checked && +inp.value !== q.ok) lab.classList.add('bad');
        });
      });
      var M = S.data.modules || (S.data.modules = {});
      var r = M[m.id] || { best: 0, attempts: 0 };
      r.attempts++; r.best = Math.max(r.best, score); r.passed = r.passed || score >= PASS; r.at = now();
      M[m.id] = r; save('modules');
      $('#err').className = score >= PASS ? 'ok' : 'err';
      $('#err').textContent = score >= PASS ? 'Верно ' + right + ' из ' + m.quiz.length + '. Урок засчитан.' :
        'Верно ' + right + ' из ' + m.quiz.length + '. Перечитайте урок и попробуйте снова: неверные ответы отмечены красным.';
      if (score >= PASS) { $('#check').textContent = i < H.modules.length - 1 ? 'Следующий урок' : 'К списку уроков'; $('#check').onclick = function () { i < H.modules.length - 1 ? lesson(i + 1, readOnly) : modules(readOnly); }; }
    };
  }

  // ---------- экзамен ----------
  function exam(turn) {
    var E = S.data.exam || (S.data.exam = { replies: [], meta: {}, start: now() });
    var X = H.exam;
    var chat = '';
    for (var k = 0; k < turn; k++) chat += '<div class="b them">' + esc(X.turns[k]) + '</div><div class="b me">' + esc(E.replies[k]) + '</div>';
    var asking = turn < X.turns.length;
    if (asking) chat += '<div class="b them">' + esc(X.turns[turn]) + '</div>';
    h(head('Шаг 4 из 4 · экзамен') + '<main><section class="card"><h1>Экзамен</h1><p>' + X.intro + '</p></section>' +
      '<section class="chat">' + chat + '</section>' +
      (asking ? '<section class="card">' + area('r' + turn, 300, '', 'Ваш ответ Айгерим') + '<p class="err" id="err"></p><button class="btn" id="send">Отправить</button></section>'
        : '<section class="card"><h3>' + X.last + '</h3>' + area('last', 600, E.last) + '<h2>Вопросы</h2>' +
          X.quiz.map(function (q, j) { return mcBlock('x' + j, q); }).join('') +
          '<p class="err" id="err"></p><button class="btn" id="fin">Сдать экзамен</button></section>') + foot() + '</main>');
    $$('textarea').forEach(function (el) { tracked(E.meta, el.getAttribute('data-k')); el.focus(); });
    if (asking) { $('#send').onclick = function () {
      var v = $('textarea').value.trim();
      if (!v) { $('#err').textContent = 'Напишите ответ'; return; }
      E.replies[turn] = v; save('exam'); exam(turn + 1);
      var c = app.querySelector('.chat'); if (c) c.lastElementChild.scrollIntoView({ block: 'center' });
    }; } else { $('#fin').onclick = function () {
      var last = $('textarea').value.trim();
      var picks = X.quiz.map(function (q, j) { var c = app.querySelector('input[name="x' + j + '"]:checked'); return c ? +c.value : -1; });
      if (!last || picks.indexOf(-1) >= 0) { $('#err').textContent = 'Ответьте на всё'; return; }
      E.last = last; E.quiz = picks;
      E.quizScore = picks.filter(function (p, j) { return p === X.quiz[j].ok; }).length + ' / ' + X.quiz.length;
      E.done = true; E.end = now();
      save('exam'); route();
    }; }
  }

  // ---------- журнал пробы ----------
  function trial() {
    var T = S.data.trial || (S.data.trial = { entries: [] });
    var dt = new Date(), today = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    h(head('Проба') + '<main><section class="card"><h1>Журнал</h1><p>Каждое событие — строка в тот же день. Ответ клиента — слово в слово. Процент считается по журналу.</p>' +
      '<p><a class="btn ghost" href="../zavod/otpravka-bscv6sc3s9/" target="_blank" rel="noopener">Страница отправки</a></p></section>' +
      '<section class="card"><label>Дата<input id="d" type="date" value="' + today + '"></label>' +
      '<label>Кто (имя или аккаунт)<input id="who"></label>' +
      '<label>Канал<select id="ch"><option>WhatsApp</option><option>Instagram</option><option>Почта</option><option>Telegram</option></select></label>' +
      '<label>Что случилось<select id="ev">' + H.trialEvents.map(function (e) { return '<option>' + esc(e) + '</option>'; }).join('') + '</select></label>' +
      '<label>Слово в слово (ответ клиента или что вы отправили)<textarea id="vb" rows="3"></textarea></label>' +
      '<p class="err" id="err"></p><button class="btn" id="add">Записать</button></section>' +
      '<section class="card"><h2>Записи: ' + T.entries.length + '</h2>' + (T.entries.slice().reverse().map(function (e) {
        return '<div class="ent"><b>' + esc(e.d) + ' · ' + esc(e.who) + '</b><span>' + esc(e.ch) + ' · ' + esc(e.ev) + '</span>' + (e.vb ? '<q>' + esc(e.vb) + '</q>' : '') + '</div>';
      }).join('') || '<p class="note">Пока пусто.</p>') + '</section>' +
      '<button class="btn ghost" id="mods">Уроки</button>' + foot() + '</main>');
    $('#mods').onclick = function () { modules(true); };
    $('#add').onclick = function () {
      var e = { d: $('#d').value, who: $('#who').value.trim(), ch: $('#ch').value, ev: $('#ev').value, vb: $('#vb').value.trim(), at: now() };
      if (!e.who) { $('#err').textContent = 'Кому — обязательно'; return; }
      T.entries.push(e); save('trial'); trial();
    };
  }

  // Статус меняет отбор (psql) — при каждом открытии подтягиваем его с сервера.
  if (S.phone) {
    rpc('hire_load', { p_phone: S.phone }).then(function (r) {
      if (r) { S.status = r.status; S.data = Object.assign({}, r.data, S.data); keep(); }
      route();
    }, route);
  } else route();
})();
