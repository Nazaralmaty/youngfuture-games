/* Проверка раскладок sort_arena.
   Главное: нерешаемая раскладка для ребёнка — это не «сложно», а сломанная
   игра. Поэтому каждую из 100 тапсырм действительно решаем солвером и
   проигрываем решение до конца.
   Запуск: node studyline/games/sort_arena.test.js */
const fs=require('fs'), assert=require('assert'), path=require('path');
const P=path.join(__dirname,'sort_arena.html');
const html=fs.readFileSync(P,'utf8');

function slice(from,to){
  const a=html.indexOf(from), b=html.indexOf(to);
  if(a<0||b<0) throw new Error('маркер не найден: '+(a<0?from:to));
  return html.slice(a,b);
}
const src=`
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function makeRng(seed){var s=(seed>>>0)||1;return function(){
  s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
`+slice('var EGG=[','/* ═════════════ 5. РИСОВАНИЕ')
 +'\nmodule.exports={buildTask,levelCfg,solveState,legalMoves,applyMove,'
 +'isSolved,cloneState,topRun,nestDone,exprBank,TOPICS,MAX_NODES};';

const mod={exports:{}};
new Function('module','exports',src)(mod,mod.exports);
const M=mod.exports;

/* Независимый разбор выражений с яиц. Считаем сами, а не доверяем генератору:
   если на яйце написано 12÷4, а группа означает 4 — игра учит неправде. */
function evalExpr(t){
  let m;
  if(/^\d+$/.test(t)) return +t;
  if((m=t.match(/^(\d+)\+(\d+)$/))) return +m[1]+ +m[2];
  if((m=t.match(/^(\d+)−(\d+)$/))) return +m[1] - +m[2];
  if((m=t.match(/^(\d+)×(\d+)$/))) return +m[1] * +m[2];
  if((m=t.match(/^(\d+)÷(\d+)$/))) return +m[1] / +m[2];
  if((m=t.match(/^([½⅓¼])·(\d+)$/))) return +m[2] * {'½':1/2,'⅓':1/3,'¼':1/4}[m[1]];
  if((m=t.match(/^(\d+)%·(\d+)$/))) return +m[2] * (+m[1]) / 100;
  if((m=t.match(/^(\d+)([²³])$/))) return Math.pow(+m[1], m[2]==='²'?2:3);
  throw new Error('нераспознанное выражение: '+t);
}

const t0=Date.now();
let totalPar=0, hardest={n:0,par:0}, mathNodes=0, exprCount=0;
let blindEggs=0, totalEggs=0;

for(let n=1;n<=M.MAX_NODES;n++){
  const cfg=M.levelCfg(n);
  const t=M.buildTask(n), w=` (тапсырма ${n}: ${cfg.colors} түс, ${cfg.free} бос, cap ${cfg.cap})`;

  assert.strictEqual(t.start.length,cfg.colors+cfg.free,'не то число ұя'+w);
  assert.strictEqual(t.cap,cfg.cap,'не та глубина ұя'+w);

  // каждого цвета ровно cap штук — иначе собрать нельзя в принципе
  const cnt={};
  t.start.forEach(nest=>{
    assert.ok(nest.length<=cfg.cap,'переполненная ұя'+w);
    nest.forEach(c=>cnt[c]=(cnt[c]||0)+1);
  });
  assert.strictEqual(Object.keys(cnt).length,cfg.colors,'не то число цветов'+w);
  Object.keys(cnt).forEach(c=>
    assert.strictEqual(cnt[c],cfg.cap,`цвета ${c} не ${cfg.cap} штук`+w));

  // раскладка не должна быть уже собранной
  assert.ok(!M.isSolved(t.start,cfg.cap),'раскладка уже решена'+w);

  // и обязана решаться — проверяем независимо от генератора
  const sol=M.solveState(M.cloneState(t.start),cfg.cap,400000);
  assert.ok(sol,'НЕ РЕШАЕТСЯ'+w);

  // проигрываем решение: ходы должны быть легальны и привести к финалу
  const st=M.cloneState(t.start);
  sol.moves.forEach((mv,i)=>{
    const ok=M.legalMoves(st,cfg.cap).some(x=>x.from===mv.from&&x.to===mv.to&&x.k===mv.k);
    assert.ok(ok,`ход ${i} нелегален`+w);
    M.applyMove(st,mv);
  });
  assert.ok(M.isSolved(st,cfg.cap),'решение не доводит до конца'+w);

  // повтор даёт ту же раскладку — «переиграть» должно значить то же самое
  assert.strictEqual(JSON.stringify(M.buildTask(n).start),JSON.stringify(t.start),
    'повтор дал другую раскладку'+w);

  assert.ok(t.par>0,'par не посчитан'+w);
  totalPar+=t.par;
  if(t.par>hardest.par) hardest={n,par:t.par};

  // ── подписи на яйцах (учебный слой) ──────────────────────────────────────
  assert.strictEqual(t.startLab.length,t.start.length,'startLab не той формы'+w);
  t.start.forEach((nest,i)=>
    assert.strictEqual(t.startLab[i].length,nest.length,'startLab[i] не той длины'+w));

  if(cfg.mode==='math'){
    mathNodes++;
    assert.ok(t.values&&t.labels,'нет значений/подписей'+w);
    assert.strictEqual(t.values.length,cfg.colors,'не то число значений'+w);
    assert.strictEqual(new Set(t.values).size,cfg.colors,'значения повторяются'+w);

    t.labels.forEach((set,c)=>{
      assert.strictEqual(set.length,cfg.cap,`у значения ${t.values[c]} не ${cfg.cap} записей`+w);
      assert.strictEqual(new Set(set.map(e=>e.t)).size,cfg.cap,
        `записи значения ${t.values[c]} повторяются`+w);
      set.forEach(e=>{
        assert.strictEqual(evalExpr(e.t),t.values[c],
          `«${e.t}» не равно ${t.values[c]}`+w);
        assert.ok(e.t.length<=7,`«${e.t}» не влезет на яйцо (${e.t.length} симв.)`+w);
        assert.ok(e.k==='plain'||M.TOPICS.indexOf(e.k)>=0,
          `у «${e.t}» неизвестная тема «${e.k}»`+w);
        exprCount++;
      });
    });

    // маска «без цвета»: доля должна быть одинаковой у КАЖДОГО значения,
    // иначе у одного числа все яйца бесцветны, а у другого ни одного
    const want=Math.round(cfg.cap*(cfg.blind||0));
    assert.strictEqual(t.blindMask.length,cfg.colors,'маска не той длины'+w);
    t.blindMask.forEach((m,c)=>{
      assert.strictEqual(m.length,cfg.cap,'маска значения не той длины'+w);
      assert.strictEqual(m.filter(Boolean).length,want,
        `у значения ${t.values[c]} без цвета ${m.filter(Boolean).length}, а не ${want}`+w);
    });
    blindEggs+=want*cfg.colors;
    totalEggs+=cfg.cap*cfg.colors;

    // каждая пара (значение, запись) встречается на поле ровно один раз
    const pairs={};
    t.start.forEach((nest,i)=>nest.forEach((c,k)=>{
      const key=c+':'+t.startLab[i][k];
      assert.ok(!pairs[key],'одна и та же запись на двух яйцах'+w);
      pairs[key]=1;
    }));
    assert.strictEqual(Object.keys(pairs).length,cfg.colors*cfg.cap,'потеряны яйца'+w);
  } else {
    assert.ok(!t.values,'в цветном режиме значений быть не должно'+w);
  }
}

const ms=Date.now()-t0;
console.log(`OK: ${M.MAX_NODES} раскладок решаемы, детерминированы, ${ms} мс`);
console.log(`   средний par ${(totalPar/M.MAX_NODES).toFixed(1)} ходов, длиннее всего — тапсырма ${hardest.n} (${hardest.par})`);
console.log(`   учебных тапсырм ${mathNodes}, проверено выражений ${exprCount} — все равны своему числу`);
console.log(`   яиц без цветовой подсказки ${blindEggs} из ${totalEggs} (${Math.round(blindEggs/totalEggs*100)}%) — их нельзя положить, не посчитав`);

// каждая тема обязана уметь породить вопрос для разбора ошибок
M.TOPICS.forEach(topic=>{
  let found=0;
  for(let v=2;v<=12;v++){ const b=M.exprBank(v)[topic]; if(b&&b.length) found+=b.length; }
  assert.ok(found>0,`тема «${topic}» не даёт ни одного выражения — разбор ошибок по ней невозможен`);
});
console.log(`   все ${M.TOPICS.length} тем дают материал для разбора ошибок`);
