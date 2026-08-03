/* Проверка раскладок nature_flow.
   Главное: нерешаемая раскладка для ребёнка — это не «сложно», а сломанная
   игра. Генератор растит решение и стирает его тело, поэтому здесь мы
   проверяем НЕЗАВИСИМО, что оставшаяся задача действительно решается:
   линии не пересекаются, идут по соседним клеткам, покрывают всё поле
   и упираются ровно в свои пары точек.
   Запуск: node studyline/games/nature_flow.test.js */
const fs=require('fs'), assert=require('assert'), path=require('path');

const AK=require(path.join(__dirname,'arena_kit.js')).ArenaKit;
const html=fs.readFileSync(path.join(__dirname,'nature_flow.html'),'utf8');

function slice(from,to){
  const a=html.indexOf(from), b=html.indexOf(to);
  if(a<0||b<0) throw new Error('маркер не найден: '+(a<0?from:to));
  return html.slice(a,b);
}
const src=`
var AK=arguments[2];
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
`+slice('var TOPIC_KK=','/* ═════════════ 5. МАСКОТ')
 +slice('function drillQuestions(','/* ═════════════ 10. UI')
 +'\nmodule.exports={buildTask,levelCfg,hamiltonian,cutPath,pickPairs,drillQuestions,'
 +'PAIRS,TOPIC_KK,HUE,NODES};';

const mod={exports:{}};
new Function('module','exports','AK',src)(mod,mod.exports,AK);
const M=mod.exports;

const t0=Date.now();
let cells=0, blindPairs=0, allPairs=0, termNodes=0;

for(let n=1;n<=M.NODES;n++){
  const cfg=M.levelCfg(n);
  const t=M.buildTask(n);
  const w=` (тапсырма ${n}: ${cfg.size}×${cfg.size}, ${cfg.pairs} жұп)`;
  const N=cfg.size*cfg.size;

  assert.strictEqual(t.size,cfg.size,'не тот размер поля'+w);
  assert.strictEqual(t.pairs.length,cfg.pairs,'не то число пар'+w);
  assert.strictEqual(t.sol.length,cfg.pairs,'решение не на все пары'+w);

  // ── решение: покрывает каждую клетку ровно один раз ──────────────────────
  const seen=new Uint8Array(N);
  t.sol.forEach((seg,i)=>{
    assert.ok(seg.length>=3,`линия ${i} короче трёх клеток — пара решается не думая`+w);
    seg.forEach((c,k)=>{
      assert.ok(c>=0&&c<N,'клетка вне поля'+w);
      assert.ok(!seen[c],`клетка ${c} занята дважды — линии пересекаются`+w);
      seen[c]=1;
      if(k){                       // соседство: линия не телепортируется
        const p=seg[k-1];
        const dr=Math.abs(((c/cfg.size)|0)-((p/cfg.size)|0));
        const dc=Math.abs((c%cfg.size)-(p%cfg.size));
        assert.strictEqual(dr+dc,1,`линия ${i} рвётся между ${p} и ${c}`+w);
      }
    });
    // концы линии — это ровно те точки, которые видит ребёнок
    assert.strictEqual(seg[0],t.pairs[i].a,`начало линии ${i} не совпадает с точкой`+w);
    assert.strictEqual(seg[seg.length-1],t.pairs[i].b,`конец линии ${i} не совпадает с точкой`+w);
  });
  for(let c=0;c<N;c++) assert.ok(seen[c],`клетка ${c} не покрыта — поле не заполняется`+w);
  cells+=N;

  // точки не садятся друг на друга
  const dots={};
  t.pairs.forEach((p,i)=>{
    [p.a,p.b].forEach(c=>{
      assert.ok(!dots[c],`две точки в одной клетке ${c}`+w);
      dots[c]=1;
    });
    assert.notStrictEqual(p.a,p.b,`пара ${i} начинается и кончается в одной клетке`+w);
  });

  // повтор даёт ту же задачу — «переиграть» должно значить то же самое
  assert.strictEqual(JSON.stringify(M.buildTask(n)),JSON.stringify(t),
    'повтор дал другую раскладку'+w);

  // ── учебный слой ────────────────────────────────────────────────────────
  if(cfg.mode==='term'){
    termNodes++;
    const usedTerm={}, usedMatch={};
    t.pairs.forEach((p,i)=>{
      assert.ok(p.term&&p.match,`у пары ${i} нет подписей`+w);
      // сверяемся со списком контента, а не с тем, что придумал генератор
      const real=M.PAIRS.filter(x=>x.a===p.term);
      assert.ok(real.length,`«${p.term}» нет в банке пар`+w);
      assert.ok(real.some(x=>x.b===p.match&&x.t===p.topic),
        `«${p.term} → ${p.match}» не соответствует банку`+w);
      // на одном поле не должно быть двух одинаковых ответов
      assert.ok(!usedMatch[p.match],`ответ «${p.match}» встречается дважды`+w);
      assert.ok(!usedTerm[p.term],`ұғым «${p.term}» встречается дважды`+w);
      usedMatch[p.match]=1; usedTerm[p.term]=1;
      // и подпись обязана влезать в клетку 320-пиксельного экрана
      assert.ok(p.term.length<=13&&p.match.length<=13,
        `подпись «${p.term}/${p.match}» не влезет в клетку`+w);
      allPairs++;
      if(p.blind) blindPairs++;
    });
    // доля «слепых» пар — ровно из кривой, а не «в среднем»
    const want=Math.round(cfg.pairs*(cfg.blind||0));
    assert.strictEqual(t.pairs.filter(p=>p.blind).length,want,
      `без цвета ${t.pairs.filter(p=>p.blind).length} пар, а не ${want}`+w);
  } else {
    t.pairs.forEach((p,i)=>assert.ok(!p.term,`в цветном режиме подписей быть не должно`+w));
  }
}

// последние три тапсырмы обязаны быть полностью без цвета —
// иначе игра ни разу не проверит, что смысл пары понят
[15,16,17].forEach(n=>{
  const t=M.buildTask(n);
  assert.ok(t.pairs.every(p=>p.blind),`тапсырма ${n} даёт цветовую подсказку`);
});

// ── банк контента ─────────────────────────────────────────────────────────
const byTopic={};
M.PAIRS.forEach(p=>{
  assert.ok(M.TOPIC_KK[p.t],`у темы «${p.t}» нет казахского названия`);
  assert.ok(p.a.length<=13&&p.b.length<=13,`пара «${p.a} → ${p.b}» слишком длинная`);
  (byTopic[p.t]=byTopic[p.t]||[]).push(p);
});
Object.keys(byTopic).forEach(t=>{
  const answers=new Set(byTopic[t].map(p=>p.b));
  assert.ok(answers.size>=3,
    `тема «${t}» даёт ${answers.size} разных ответов — на 3 варианта в разборе ошибок не хватит`);
});

// разбор ошибок: варианты не повторяются и правильный ответ всегда среди них
Object.keys(byTopic).forEach(t=>{
  const qs=M.drillQuestions({[t]:2},12345);
  assert.ok(qs.length,`по теме «${t}» не собрался ни один вопрос`);
  qs.forEach(q=>{
    assert.strictEqual(q.opts.length,3,'в вопросе не 3 варианта');
    assert.strictEqual(new Set(q.opts).size,3,'варианты повторяются');
    assert.ok(q.opts.indexOf(q.answer)>=0,'правильного ответа нет среди вариантов');
  });
});

const ms=Date.now()-t0;
console.log(`OK: ${M.NODES} раскладок решаемы, детерминированы, ${ms} мс`);
console.log(`   проверено клеток ${cells} — все покрыты линиями без пересечений`);
console.log(`   учебных тапсырм ${termNodes}, пар с подписями ${allPairs}, из них без цвета ${blindPairs} (${Math.round(blindPairs/allPairs*100)}%)`);
console.log(`   банк: ${M.PAIRS.length} пар, ${Object.keys(byTopic).length} тем — каждой хватает на разбор ошибок`);
