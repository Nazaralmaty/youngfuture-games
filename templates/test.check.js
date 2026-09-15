// node templates/test.check.js — банк, форматтар, адаптив және деңгей логикасы
const fs = require('fs'), assert = require('assert'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'test.html'), 'utf8');
const js = html.split('<script>')[1].split('</' + 'script>')[0];

// минималды DOM-стаб: скрипт жүктелуі үшін ғана
const el = new Proxy({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }, {
  get: (t, k) => k in t ? t[k] : (/^(addEventListener|appendChild|forEach)$/.test(k) ? () => {} : /^querySelectorAll$/.test(k) ? () => [] : ''),
  set: () => true,
});
el.querySelectorAll = () => [];
global.document = { getElementById: () => el, querySelectorAll: () => [], createElement: () => el };
global.window = { scrollTo() {} };
global.location = { search: '', href: 'test' };
global.URLSearchParams = class { get() { return ''; } };
global.fetch = () => Promise.resolve();
global.setTimeout = () => 0;
new Function(js)();

const T = window.__EVTEST__;
const B = T.BANK;
const by = d => B.filter(x => x.d === d);
const types = new Set(B.map(q => q.type || 'mcq'));

// 1. банк көлемі мен деңгей бойынша үлестірімі
assert.ok(B.length >= 150, 'банкте 150+ сұрақ болуы керек, бар: ' + B.length);
[1, 2, 3, 4].forEach(d => assert.ok(by(d).length >= 30, `d${d}: тек ${by(d).length} сұрақ`));

// 2. форматтардың бәрі бар
['mcq', 'gap', 'order', 'match', 'cloze', 'listen'].forEach(t =>
  assert.ok(types.has(t), 'формат жоқ: ' + t));

// 3. әр сұрақ дұрыс құрылған
const seen = new Set();
B.forEach((q, n) => {
  const t = q.type || 'mcq';
  assert.ok(q.q && q.d >= 1 && q.d <= 4 && q.sk, `#${n}: өрістер жетіспейді`);
  const key = q.q + '|' + (q.passage || '') + '|' + (q.a || '') + '|' + JSON.stringify(q.pairs || '');
  assert.ok(!seen.has(key), `#${n}: қайталанған сұрақ — ${q.q}`);
  seen.add(key);
  if (t === 'gap') assert.ok(q.a && q.a.length, `#${n}: gap жауабы жоқ`);
  else if (t === 'order') assert.ok(String(q.a).split(' ').length >= 3, `#${n}: order тым қысқа`);
  else if (t === 'match') {
    assert.ok(q.pairs.length >= 3 && q.pairs.every(p => p.length === 2), `#${n}: match жұптары дұрыс емес`);
  } else if (t === 'cloze') {
    assert.strictEqual(q.passage.split('___').length - 1, q.blanks.length, `#${n}: ___ саны blanks-пен сәйкес емес`);
    q.blanks.forEach(b => assert.ok(b.o[b.c], `#${n}: cloze дұрыс жауабы жоқ`));
  } else {
    if (t === 'listen') assert.ok(q.audio, `#${n}: listen мәтіні жоқ`);
    assert.ok(Array.isArray(q.o) && q.o.length >= 3 && q.o.length <= 4, `#${n}: нұсқалар саны дұрыс емес`);
    assert.ok(q.c >= 0 && q.c < q.o.length, `#${n}: c индексі дұрыс емес`);
    assert.strictEqual(new Set(q.o).size, q.o.length, `#${n}: нұсқалар қайталанады`);
  }
});

// 4. раунд: 5 сұрақ, қиындығы жолақ бойынша, форматтар әртүрлі
Object.keys(T.TRACKS).forEach(name => {
  T.resetUsed();
  const r = T.buildRound(name);
  assert.strictEqual(r.length, 5, name + ': раундта 5 сұрақ болуы керек');
  assert.deepStrictEqual(r.map(q => q.d), T.TRACKS[name], name + ': қиындық жолағы сәйкес емес');
  assert.ok(new Set(r.map(q => q.type)).size >= 2, name + ': бір раундта бір ғана формат');
  r.filter(q => q.type === 'mcq' || q.type === 'listen').forEach(q =>
    assert.ok(q.o[q.c], 'араластырудан кейін дұрыс жауап жоғалды'));
});

// сұрақтар қайталанбайды және әр өтуде басқа жиын
T.resetUsed();
const run = ['start', 'core', 'hard'].flatMap(t => T.buildRound(t));
assert.strictEqual(run.length, 15, 'тестте 15 сұрақ');
assert.strictEqual(new Set(run.map(q => q._id)).size, 15, 'бір өтуде сұрақ қайталанды');
T.resetUsed();
const run2 = ['start', 'core', 'hard'].flatMap(t => T.buildRound(t));
const same = run2.filter(q => run.some(x => x._id === q._id)).length;
assert.ok(same < 12, `екі өту тым ұқсас: ${same}/15`);

// 5. адаптив: жауап бойынша келесі раунд қиындығы
T.answers = [1, 2, 2, 3, 3].map(d => ({ d, ok: true }));
assert.strictEqual(T.nextTrack(), 'hard', 'бәрі дұрыс болса — hard');
T.answers = [1, 2, 2, 3, 3].map(d => ({ d, ok: d <= 2 }));
assert.strictEqual(T.nextTrack(), 'core', 'жартысы дұрыс болса — core');
T.answers = [1, 2, 2, 3, 3].map(d => ({ d, ok: false }));
assert.strictEqual(T.nextTrack(), 'easy', 'бәрі қате болса — easy');

// 6. деңгей (p1,p2,p3,p4, t4,t3,t2)
assert.strictEqual(T.levelOf(100, 100, 100, 80, 5, 5, 5), 'above');
assert.strictEqual(T.levelOf(100, 100, 80, 20, 5, 5, 5), 'pre');
assert.strictEqual(T.levelOf(100, 80, 20, 0, 0, 5, 5), 'elementary');
assert.strictEqual(T.levelOf(60, 20, 0, 0, 0, 0, 5), 'beginner');
assert.strictEqual(T.levelOf(0, 0, 0, 100, 1, 0, 0), 'beginner', 'бір ғана қиын сұрақ деңгей бермейді');
assert.strictEqual(T.levelOf(100, 33, 62, 0, 0, 8, 6), 'beginner', 'төменгі жолақ әлсіз болса деңгей көтерілмейді');

console.log(`OK · банк ${B.length} (d1 ${by(1).length}/d2 ${by(2).length}/d3 ${by(3).length}/d4 ${by(4).length}), ` +
  `форматтар: ${[...types].join(', ')}, 3 раунд × 5, екі өтуде ортақ ${same}/15`);

// 7. телефон нөмірі
['+7 777 123 45 67', '87771234567', '7771234567', '8 (777) 123-45-67'].forEach(v =>
  assert.strictEqual(T.normPhone(v), '+77771234567', 'дұрыс нөмір: ' + v));
['', '777123456', '+1 202 555 0143', 'абв'].forEach(v =>
  assert.strictEqual(T.normPhone(v), '', 'қате нөмір өтпеуі керек: ' + v));
