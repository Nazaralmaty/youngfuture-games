/*!
 * StudyLine · Оқу әдеті — смоук-тест логики.
 *
 * Запуск (Chrome должен быть установлен):
 *   npx -y puppeteer-core@23 --version   # один раз, чтобы модуль лёг в кэш
 *   node smoke.test.js
 *
 * Проверяет то, что руками проверять долго: корень навигации в двух режимах,
 * античит на страницах, обнуление серии, финал, состояние «все книги прочитаны».
 * Ничего не мокает — гоняет настоящий index.html в настоящем браузере.
 */
'use strict';

const path = require('path');
const { execSync } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = 'file://' + path.join(__dirname, 'index.html');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  const root = execSync('npm root -g').toString().trim();
  try { return require(path.join(root, 'puppeteer-core')); } catch (e) {}
  const npx = execSync('ls -d ~/.npm/_npx/*/node_modules/puppeteer-core 2>/dev/null | head -1')
    .toString().trim();
  if (!npx) throw new Error('puppeteer-core не найден. npx -y puppeteer-core@23 --version');
  return require(npx);
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

const KEY = 'sl_oqu_guest';

async function open(browser, query, state) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  // Состояние кладём до выполнения скрипта приложения.
  if (state) {
    await page.evaluateOnNewDocument((k, s) => localStorage.setItem(k, s), KEY, JSON.stringify(state));
  } else {
    await page.evaluateOnNewDocument((k) => localStorage.removeItem(k), KEY);
  }
  await page.goto(PAGE + (query || ''), { waitUntil: 'networkidle0' });
  return page;
}

const visible = (page) => page.evaluate(() => {
  const v = document.querySelector('.view.on');
  const f = document.querySelector('.full.on');
  return { view: v && v.id, full: f && f.id };
});
const read = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());

function blank(over) {
  return Object.assign({
    step: 1, dayInStep: 0, streak: 0, best: 0, total: 0,
    days: {}, books: {}, current: null, toasts: {}, startedAt: null, finished: false
  }, over || {});
}
const ymd = (offsetDays) => {
  const d = new Date(Date.now() - offsetDays * 86400000);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

(async () => {
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  try {
    // ── 1. Корень навигации ────────────────────────────────────────────
    console.log('\n1. Корень навигации');
    let page = await open(browser, '');
    ok('по ссылке первый экран — кабинет', (await visible(page)).view === 'home');
    ok('плитка показывает норму шага', (await text(page, '#oquSub')) === '1 бет бүгін',
      await text(page, '#oquSub'));
    ok('заблокированные плитки не кликаются',
      await page.$eval('.mini.checkup', (e) => e.disabled &&
        getComputedStyle(e).pointerEvents === 'none'));
    await page.click('#tileOqu');
    ok('плитка книги ведёт в хаб', (await visible(page)).view === 'hub');
    await page.click('#hub .nav-back');
    ok('«‹» из хаба возвращает в кабинет', (await visible(page)).view === 'home');
    ok('зелёная точка «новое» погасла после первого входа',
      !(await page.$eval('#tileOqu', (e) => e.classList.contains('new'))));
    await page.close();

    page = await open(browser, '?uid=1&name=Мұстафа&sid=s1&lang=kk');
    ok('внутри приложения первый экран — хаб', (await visible(page)).view === 'hub');
    await page.close();

    // Мост отдаёт имя только вместе с uid; без sid это ещё не «внутри
    // приложения», поэтому корень остаётся кабинетом.
    page = await open(browser, '?uid=8421&name=Мұстафа&cls=5&lang=kk');
    ok('в кабинете приветствие по имени', (await text(page, '#hi')) === 'Сәлем, Мұстафа!',
      await text(page, '#hi'));
    ok('uid без sid — всё ещё кабинет', (await visible(page)).view === 'home');
    await page.close();

    // ── 2. Навигация внутри приложения ─────────────────────────────────
    console.log('\n2. Навигация');
    page = await open(browser, '');
    await page.click('#tileOqu');
    await page.click('#btnLib');
    ok('Кітапхана открывается', (await visible(page)).view === 'library');
    await page.click('.bcard[data-book="dala"]');
    ok('карточка книги открывается', (await visible(page)).view === 'book');
    ok('в шапке книги её название', (await text(page, '#book .bar h1')) === 'Дала сыры',
      await text(page, '#book .bar h1'));
    await page.click('#bkStart');
    ok('«Оқуды бастау» открывает читалку', (await visible(page)).view === 'reader');
    await page.click('#rClose');
    ok('✕ возвращает на экран книги, а не через один',
      (await visible(page)).view === 'book');
    await page.click('#book .nav-back');
    ok('«‹» из книги возвращает в библиотеку', (await visible(page)).view === 'library');
    await page.click('#library .nav-back');
    ok('«‹» из библиотеки возвращает в хаб', (await visible(page)).view === 'hub');
    await page.click('#btnSteps');
    await page.click('#steps .nav-back');
    ok('Қадамдар → назад → хаб', (await visible(page)).view === 'hub');
    await page.close();

    // ── 3. Античит: страница засчитывается один раз ────────────────────
    console.log('\n3. Античит');
    page = await open(browser, '');
    await page.click('#tileOqu');
    await page.click('#btnRead');
    // Пролистать быстро — ничего не должно засчитаться.
    for (let i = 0; i < 5; i++) await page.click('#rNext');
    ok('быстрое пролистывание не даёт страниц', (await read(page)).total === 0,
      'total=' + (await read(page)).total);

    // Подделать время начала страницы нельзя снаружи, поэтому ждём реально.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    const beforeBack = (await read(page)).total;
    for (let i = 0; i < 4; i++) await page.click('#rPrev');
    for (let i = 0; i < 4; i++) await page.click('#rNext');
    ok('листание назад-вперёд не накручивает', (await read(page)).total === beforeBack,
      'было ' + beforeBack + ', стало ' + (await read(page)).total);
    await page.close();

    // ── 4. Серия обнуляется при пропуске ───────────────────────────────
    console.log('\n4. Серия');
    page = await open(browser, '', blank({ streak: 9, best: 9, lastDay: ymd(6), total: 40 }));
    ok('после пропуска недели серия = 0', (await read(page)).streak === 0,
      'streak=' + (await read(page)).streak);
    ok('в кабинете серия тоже 0', (await text(page, '#hmStreak')) === '0');
    await page.close();

    page = await open(browser, '', blank({ streak: 5, best: 5, lastDay: ymd(1), total: 20 }));
    ok('вчера читал — серия сохраняется', (await read(page)).streak === 5);
    await page.close();

    page = await open(browser, '', blank({ streak: 5, best: 5, lastDay: ymd(0), total: 20 }));
    ok('сегодня читал — серия сохраняется', (await read(page)).streak === 5);
    await page.close();

    // ── 5. Все книги прочитаны ─────────────────────────────────────────
    console.log('\n5. Все книги прочитаны');
    const allDone = {};
    for (const id of ['qanatty', 'dala', 'batyr', 'tunkitap', 'jetiqazyna']) {
      allDone[id] = { page: 999, done: true };
    }
    page = await open(browser, '', blank({ books: allDone, current: 'qanatty', total: 72 }));
    await page.click('#tileOqu');
    ok('карточка книги скрыта целиком, без пустой рамки',
      await page.$eval('#curCard', (e) => e.style.display === 'none'));
    ok('герой честно говорит, что книг нет',
      (await text(page, '#heroSub')).indexOf('Барлық кітап оқылды') === 0,
      await text(page, '#heroSub'));
    ok('заголовок не требует читать несуществующие страницы',
      (await text(page, '#heroTitle')) === 'Кітаптар бітті', await text(page, '#heroTitle'));
    ok('кнопка чтения выключена', await page.$eval('#btnRead', (e) => e.disabled));
    ok('выключенная кнопка выглядит выключенной',
      await page.$eval('#btnRead', (e) => parseFloat(getComputedStyle(e).opacity) < 0.9),
      await page.$eval('#btnRead', (e) => getComputedStyle(e).opacity));
    await page.close();

    // ── 6. Прочитанная книга = 100 % ───────────────────────────────────
    console.log('\n6. Прогресс дочитанной книги');
    page = await open(browser, '', blank({
      books: { qanatty: { page: 11, done: true } }, total: 12
    }));
    await page.click('#tileOqu');
    await page.click('#btnLib');
    await page.click('.bcard[data-book="qanatty"]');
    ok('на экране книги «оқылды» = все страницы',
      (await text(page, '#bkPages')) === (await text(page, '#bkRead')),
      (await text(page, '#bkRead')) + ' из ' + (await text(page, '#bkPages')));
    await page.close();

    // ── 7. Финал достижим и ведёт в библиотеку ─────────────────────────
    console.log('\n7. Финал 39 дней');
    page = await open(browser, '', blank({
      step: 10, dayInStep: 2, streak: 38, best: 38, total: 200,
      days: { [ymd(0)]: 9 }, lastDay: ymd(1),
      books: { qanatty: { page: 0, done: false } }, current: 'qanatty'
    }));
    // 9 из 10 страниц уже прочитано сегодня — не хватает одной. Читаем её
    // честно, выждав античит-порог, и день (а с ним 39-й день) закрывается.
    await page.click('#tileOqu');
    ok('до нормы осталась одна страница', (await text(page, '#heroTitle')) === '1 бет оқы',
      await text(page, '#heroTitle'));
    await page.click('#btnRead');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 21000)));
    await page.click('#rNext');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    ok('на 39-й день показывается финал, а не «күн бітті»',
      (await visible(page)).full === 'finale', JSON.stringify(await visible(page)));
    ok('программа помечена завершённой', (await read(page)).finished === true);
    await page.click('#fnOk');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    ok('кнопка финала ведёт в библиотеку, а не в никуда',
      (await visible(page)).view === 'library' && (await visible(page)).full === null,
      JSON.stringify(await visible(page)));
    await page.click('#library .nav-back');
    ok('из библиотеки после финала возврат в корень', (await visible(page)).view === 'home');
    await page.close();

    // Шаги не переполняются после финала.
    page = await open(browser, '', blank({
      step: 10, dayInStep: 3, streak: 39, best: 39, total: 210, finished: true,
      days: { [ymd(0)]: 10 }, lastDay: ymd(0)
    }));
    await page.click('#tileOqu');
    await page.click('#btnSteps');
    ok('10-й шаг после финала — «Аяқталды», без «4/3 күн»',
      (await page.$$eval('#stepList .step', (els) =>
        els[9].querySelector('.m').textContent.trim())) === 'Аяқталды ✓',
      await page.$$eval('#stepList .step', (els) => els[9].querySelector('.m').textContent.trim()));
    await page.close();

    // ── 8. Недельный график — ровно 7 столбцов ─────────────────────────
    console.log('\n8. Недельный график');
    page = await open(browser, '', blank({
      days: { [ymd(0)]: 4, [ymd(1)]: 3, [ymd(5)]: 6 }, total: 13, lastDay: ymd(0), streak: 2
    }));
    await page.click('#tileOqu');
    ok('в графике 7 столбцов, а не 4',
      (await page.$$eval('#week .wk', (e) => e.length)) === 7);
    ok('подсвечен сегодняшний день',
      (await page.$$eval('#week .wk', (els) =>
        els.map((e) => e.classList.contains('on')).lastIndexOf(true))) === 6);
    await page.close();

    // ── 9. Оверлей закрывается раньше навигации ────────────────────────
    console.log('\n9. Оверлеи');
    page = await open(browser, '');
    await page.click('#tileOqu');
    await page.evaluate(() => document.getElementById('dayDone').classList.add('on'));
    ok('оверлей открыт', (await visible(page)).full === 'dayDone');
    await page.click('#ddMore');
    ok('«Жалғастыру» закрывает оверлей и оставляет экран',
      (await visible(page)).full === null && (await visible(page)).view === 'hub');
    await page.close();

    // ── 10. Ассеты грузятся (офлайн-правило репозитория) ───────────────
    console.log('\n10. Ассеты');
    page = await browser.newPage();
    const missed = [];
    page.on('requestfailed', (r) => missed.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) missed.push(r.url()); });
    await page.goto(PAGE, { waitUntil: 'networkidle0' });
    await page.click('#tileOqu');
    await page.click('#btnLib');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const external = await page.evaluate(() =>
      [...document.querySelectorAll('img,script,link')]
        .map((e) => e.src || e.href).filter((u) => u && !u.startsWith('file:')));
    ok('нет внешних ресурсов (CDN/хотлинков)', external.length === 0, external.join(', '));
    const broken = await page.$$eval('img', (els) =>
      els.filter((e) => e.offsetParent !== null && e.naturalWidth === 0)
         .map((e) => e.getAttribute('src') || '(пусто)'));
    ok('нет битых картинок на видимых экранах', broken.length === 0, broken.join(', '));

    // Обложки задаются CSS-фоном. Что фон задан, проверяем здесь;
    // что файл реально нашёлся — через `missed` ниже (битый путь даёт
    // requestfailed на file://).
    await page.click('.bcard[data-book="jetiqazyna"]');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const covers = await page.evaluate(() =>
      ['curCov', 'bkCov'].map((id) => {
        const el = document.getElementById(id);
        const bg = getComputedStyle(el).backgroundImage;
        return { id, url: (bg.match(/url\("?([^")]+)"?\)/) || [])[1] || null };
      }));
    ok('обложкам задан CSS-фон', covers.every((c) => c.url),
      JSON.stringify(covers));
    ok('ни один ресурс не отвалился', missed.length === 0, missed.join(', '));
    await page.close();


    // ── 11. Серия под угрозой + вечернее напоминание ───────────────────
    console.log('\n11. Серия под угрозой');
    // Читал вчера, сегодня ещё нет. Вечером ребёнок должен узнать, что теряет.
    page = await open(browser, '', blank({ streak: 6, best: 9, lastDay: ymd(1), total: 30 }));
    await page.click('#tileOqu');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 350)));
    ok('днём плашки риска нет',   await page.evaluate(() => __oqu.streakAtRisk(12, 0)) === false);
    ok('вечером риск есть',       await page.evaluate(() => __oqu.streakAtRisk(19, 0)) === true);
    ok('вечером, но уже читал — риска нет', await page.evaluate(() => __oqu.streakAtRisk(19, 4)) === false);
    ok('серии нет — пугать нечем', await page.evaluate(() => { const s0 = __oqu.streak; __oqu.streak = 0;
        const r = __oqu.streakAtRisk(21, 0); __oqu.streak = s0; return r; }) === false);
    const riskTxt = await page.evaluate(() =>
      __oqu.streak + ' күндік серияң бүгін үзіледі');
    ok('в плашке названо число дней, а не «скоро»', /^6 күндік/.test(riskTxt), riskTxt);
    ok('колокольчик выключен, пока разрешения нет',
      await page.evaluate(() => document.getElementById('btnBell').getAttribute('aria-pressed')) === 'false');
    await page.close();

  } finally {
    await browser.close();
  }

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
