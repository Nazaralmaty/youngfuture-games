// node templates/test.check.js — банк сұрақтарын және деңгей логикасын тексереді
const fs = require('fs'), assert = require('assert'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'test.html'), 'utf8');
const js = html.split('<script>')[1].split('</' + 'script>')[0];

// минималды DOM-стаб: тек скрипт жүктелуі үшін
const el = new Proxy({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }, {
  get: (t, k) => k in t ? t[k] : (typeof k === 'string' && /^(addEventListener|appendChild|querySelectorAll|forEach)$/.test(k) ? () => [] : ''),
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

// 1. базаның көлемі мен деңгей бойынша үлестірімі
const by = d => B.filter(x => x.d === d);
assert.ok(B.length >= 150, 'банкте 150+ сұрақ болуы керек, бар: ' + B.length);
[1, 2, 3, 4].forEach(d => assert.ok(by(d).length >= T.CONFIG.PICK[d] * 8,
  `d${d}: ${by(d).length} сұрақ — таңдау үшін аз`));

// 2. әр сұрақ дұрыс құрылған
const seen = new Set();
B.forEach((q, n) => {
  assert.ok(q.q && q.d >= 1 && q.d <= 4 && q.sk, `#${n}: өрістер жетіспейді`);
  const key = q.q + '|' + (q.passage || '') + '|' + (q.a || '');
  assert.ok(!seen.has(key), `#${n}: қайталанған сұрақ — ${q.q}`);
  seen.add(key);
  if (q.type === 'gap') assert.ok(q.a && q.a.length, `#${n}: gap жауабы жоқ`);
  else if (q.type === 'order') assert.ok(String(q.a).split(' ').length >= 3, `#${n}: order тым қысқа`);
  else {
    assert.ok(Array.isArray(q.o) && q.o.length >= 3 && q.o.length <= 4, `#${n}: нұсқалар саны дұрыс емес`);
    assert.ok(q.c >= 0 && q.c < q.o.length, `#${n}: c индексі дұрыс емес`);
    assert.strictEqual(new Set(q.o).size, q.o.length, `#${n}: нұсқалар қайталанады`);
  }
});

// 3. таңдау: 15 сұрақ, деңгей бойынша квота, әр рет басқа жиын
const a = T.pickQuestions(), b = T.pickQuestions();
assert.strictEqual(a.length, 15, 'тестте 15 сұрақ болуы керек');
[1, 2, 3, 4].forEach(d => assert.strictEqual(a.filter(x => x.d === d).length, T.CONFIG.PICK[d]));
a.forEach(q => { if (q.type === 'mcq') assert.ok(q.o[q.c], 'араластырудан кейін c жоғалды'); });
const same = a.filter(x => b.some(y => y.q === x.q)).length;
assert.ok(same < 15, 'екі жиын бірдей болып шықты — кездейсоқтық жоқ');

// 4. деңгей логикасы
assert.strictEqual(T.levelOf(100, 100, 100, 100), 'above');
assert.strictEqual(T.levelOf(100, 75, 75, 33), 'pre');
assert.strictEqual(T.levelOf(75, 75, 25, 0), 'elementary');
assert.strictEqual(T.levelOf(50, 25, 0, 0), 'beginner');
assert.strictEqual(T.levelOf(100, 100, 100, 33), 'pre', 'B1+ әлсіз болса above берілмейді');
assert.strictEqual(T.levelOf(50, 25, 75, 100), 'elementary', 'кездейсоқ сәтті болжам above бермейді');

console.log(`OK · банк ${B.length} сұрақ (d1 ${by(1).length} / d2 ${by(2).length} / d3 ${by(3).length} / d4 ${by(4).length}), таңдау 15, қайталану ${same}/15`);
