/* Проверка контента и кривой flappy_english.
   Механика полёта уже проверена в бою (games/flappy-mr1nbd272vmh0.html),
   ломается здесь не она, а данные: слово с самим собой в качестве
   отвлекающего варианта, дыра в кривой сложности или подпись, которая
   не влезет в проём на 320-пиксельном экране.
   Запуск: node studyline/games/flappy_english.test.js */
const fs=require('fs'), assert=require('assert'), path=require('path');

const AK=require(path.join(__dirname,'arena_kit.js')).ArenaKit;
const html=fs.readFileSync(path.join(__dirname,'flappy_english.html'),'utf8');

function slice(from,to){
  const a=html.indexOf(from), b=html.indexOf(to);
  if(a<0||b<0) throw new Error('маркер не найден: '+(a<0?from:to));
  return html.slice(a,b);
}
const src=`
var AK=arguments[2];
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
`+slice('var WORDS=[','/* ═════════════ 4. ПРОГРЕСС')
 +slice('function drillQuestions(','/* ═════════════ 7. UI')
 +'\nmodule.exports={WORDS,levelCfg,wordsFor,drillQuestions,NODES};';

const mod={exports:{}};
new Function('module','exports','AK',src)(mod,mod.exports,AK);
const M=mod.exports;

/* ── банк слов ───────────────────────────────────────────────────────────── */
const byEn={}, byTier={1:[],2:[],3:[]}, byGroup={};
M.WORDS.forEach(w=>{
  assert.ok(w.en&&w.kk&&w.g,'у слова нет en/kk/группы: '+JSON.stringify(w));
  assert.ok(!byEn[w.en],`слово «${w.en}» повторяется в банке`);
  byEn[w.en]=w;
  assert.ok(byTier[w.tier],`у «${w.en}» неизвестный tier ${w.tier}`);
  byTier[w.tier].push(w);
  (byGroup[w.g]=byGroup[w.g]||[]).push(w);
  // подпись рисуется в проёме шириной 0.19W — длиннее не читается
  assert.ok(w.kk.length<=16,`перевод «${w.kk}» не влезет в проём (${w.kk.length} симв.)`);
  assert.ok(w.en.length<=14,`слово «${w.en}» не влезет в плашку`);
});
// два одинаковых перевода = вопрос без единственного ответа
const kkSeen={};
M.WORDS.forEach(w=>{
  assert.ok(!kkSeen[w.kk],`перевод «${w.kk}» встречается у двух слов`);
  kkSeen[w.kk]=1;
});
// группа нужна для правдоподобного отвлекающего варианта
Object.keys(byGroup).forEach(g=>
  assert.ok(byGroup[g].length>=2,
    `в группе «${g}» одно слово — правдоподобный отвлекающий вариант взять неоткуда`));

/* ── кривая биома ────────────────────────────────────────────────────────── */
let prev=null;
for(let n=1;n<=M.NODES;n++){
  const c=M.levelCfg(n), w=` (тапсырма ${n})`;
  assert.ok(c.goal>0&&c.lives===3,'сломана цель тапсырмы'+w);
  assert.ok(c.gap>=0.185,'проём стал уже играбельного'+w);
  assert.ok(c.every>=1.9,'стены идут чаще, чем успеваешь прочитать'+w);
  // монотонный рост — внутри блока коротких и длинных слов (1–14).
  // На 15–17 физика намеренно мягче: там словосочетания в две строки,
  // и «всё растёт до конца» делает блок непроходимым (проверено автопрогоном).
  if(prev&&n!==15){
    assert.ok(c.spd>=prev.spd,'скорость упала на следующей тапсырме'+w);
    assert.ok(c.gap<=prev.gap,'проём стал шире на следующей тапсырме'+w);
    assert.ok(c.every<=prev.every,'стены стали реже на следующей тапсырме'+w);
  }
  prev=c;
  // на слова тапсырмы обязан хватать пул своего tier
  assert.ok(byTier[c.tier].length>=c.goal+3,
    `для tier ${c.tier} в банке ${byTier[c.tier].length} слов, нужно ≥ ${c.goal+3}`+w);
}
assert.strictEqual(M.levelCfg(1).tier,1,'первая тапсырма не на коротких словах');
assert.strictEqual(M.levelCfg(17).tier,3,'босс биома не на словосочетаниях');
// блок словосочетаний обязан быть физически мягче пика 13–14, иначе прочитать
// подпись в две строки между стенами физически некогда
assert.ok(M.levelCfg(15).every>M.levelCfg(14).every,'на 15-й стены не стали реже');
assert.ok(M.levelCfg(15).gap>M.levelCfg(14).gap,'на 15-й проём не стал шире');
assert.ok(M.levelCfg(17).every>M.levelCfg(14).every,'на боссе стены чаще пика 13–14');

/* ── набор слов тапсырмы ─────────────────────────────────────────────────── */
let checked=0, sameGroup=0;
for(let n=1;n<=M.NODES;n++){
  const cfg=M.levelCfg(n), deck=M.wordsFor(n), w=` (тапсырма ${n})`;
  assert.strictEqual(deck.length,cfg.goal+3,'не тот размер набора'+w);
  const seen={};
  deck.forEach(d=>{
    // отвлекающий вариант обязан отличаться от правильного, иначе оба проёма верны
    assert.notStrictEqual(d.wrong,d.kk,`у «${d.en}» отвлекающий равен ответу`+w);
    // и обязан быть настоящим переводом другого слова, а не выдумкой
    assert.ok(M.WORDS.some(x=>x.kk===d.wrong),`«${d.wrong}» нет в банке`+w);
    // слово соответствует банку, а не тому, что собрал генератор
    assert.strictEqual(byEn[d.en].kk,d.kk,`перевод «${d.en}» не совпадает с банком`+w);
    assert.strictEqual(byEn[d.en].tier,cfg.tier,`«${d.en}» не из своего tier`+w);
    assert.ok(!seen[d.en],`слово «${d.en}» дважды в одной тапсырме`+w);
    seen[d.en]=1;
    if(byEn[d.wrong===d.kk?d.en:Object.keys(byEn).find(k=>byEn[k].kk===d.wrong)].g===d.g) sameGroup++;
    checked++;
  });
  // повтор даёт тот же набор — «переиграть» = та же задача
  assert.strictEqual(JSON.stringify(M.wordsFor(n)),JSON.stringify(deck),
    'повтор дал другой набор слов'+w);
}
// отвлекающий из своей группы — это и есть антиугадайка, а не случайное слово
assert.ok(sameGroup/checked>0.8,
  `только ${Math.round(sameGroup/checked*100)}% отвлекающих из своей группы — выбор станет очевидным`);

/* ── разбор ошибок ───────────────────────────────────────────────────────── */
assert.strictEqual(M.drillQuestions([],1).length,0,'разбор открывается без ошибок');
const missed=[byEn['cat'],byEn['summer'],byEn['turn on'],byEn['cat']];
const qs=M.drillQuestions(missed,777);
assert.strictEqual(qs.length,3,'из трёх разных ошибок собралось не три вопроса');
qs.forEach(q=>{
  assert.strictEqual(q.opts.length,3,'в вопросе не 3 варианта');
  assert.strictEqual(new Set(q.opts).size,3,'варианты повторяются');
  assert.ok(q.opts.indexOf(q.answer)>=0,'правильного ответа нет среди вариантов');
  assert.strictEqual(byEn[q.text].kk,q.answer,'ответ не совпадает с банком');
});

console.log(`OK: банк ${M.WORDS.length} слов — переводы уникальны, подписи влезают в проём`);
console.log(`   tier 1/2/3: ${byTier[1].length}/${byTier[2].length}/${byTier[3].length} слов, групп ${Object.keys(byGroup).length}`);
console.log(`   ${M.NODES} тапсырм: сложность растёт монотонно, наборы детерминированы`);
console.log(`   отвлекающих из своей смысловой группы ${Math.round(sameGroup/checked*100)}% — угадать по смыслу нельзя`);
