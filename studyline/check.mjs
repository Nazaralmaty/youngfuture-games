#!/usr/bin/env node
/*!
 * StudyLine — один прогон всех проверок.
 *
 *   node check.mjs            все прототипы
 *   node check.mjs klan nish  только названные
 *
 * Что делает: открывает каждый прототип в настоящем Chrome на экране 390×844,
 * гоняет его собственный `?test=1`, ловит ошибки консоли и упавшие ресурсы,
 * а также отдельно проверяет то, что не умеет ни один из внутренних тестов:
 * страница не должна ездить вбок и в ней не должно быть вложенных <a> в <a>.
 *
 * Ничего не мокается. Если здесь зелено — прототипы открываются на телефоне.
 */
'use strict';

import { existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Прототипы с собственным ?test=1. Порядок — как на стенде. */
const APPS = [
  { id: '100_dengey', name: '100 деңгей' },
  { id: 'ana',        name: 'Ана кабинеті' },
  { id: 'agash',      name: '1000 ағаш' },
  { id: 'klan',       name: 'Клан' },
  { id: 'nish',       name: 'НИШ-диагностика' },
];
/* Прототипы со своим отдельным тестовым файлом на node. */
const NODE_TESTS = [
  { id: 'oqu_adeti', name: 'Оқу әдеті', file: 'oqu_adeti/smoke.test.js' },
  { id: 'games',     name: 'Логика аренасы',   file: 'games/sort_arena.test.js' },
  { id: 'games',     name: 'Ағылшын аренасы',  file: 'games/flappy_english.test.js' },
  { id: 'games',     name: 'Табиғат аренасы',  file: 'games/nature_flow.test.js' },
];
/* Страницы без своих тестов — проверяем только что открываются без ошибок. */
const PAGES = [
  { id: '.',      name: 'Стенд',   file: 'index.html' },
  { id: '_pokaz', name: 'Показ',   file: '_pokaz/index.html' },
];

const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);

let totalChecks = 0, totalFails = 0;
const rows = [];

/* puppeteer-core лежит в кэше npx и не имеет ESM-экспорта каталогом,
   поэтому импортируем файл напрямую. Если кэша нет — один раз:
   npx -y puppeteer-core@23 --version                                    */
const puppeteer = await (async () => {
  const root = execSync('ls -d ~/.npm/_npx/*/node_modules/puppeteer-core 2>/dev/null | head -1')
    .toString().trim();
  if (!root) { console.error('puppeteer-core не найден. Один раз: npx -y puppeteer-core@23 --version'); process.exit(1); }
  for (const rel of ['/lib/esm/puppeteer/puppeteer-core.js', '/lib/puppeteer/puppeteer-core.js', '/lib/cjs/puppeteer/puppeteer-core.js']) {
    if (existsSync(root + rel)) return (await import('file://' + root + rel)).default;
  }
  console.error('не нашёл точку входа puppeteer-core в ' + root); process.exit(1);
})();

const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });

async function openAndAudit(file, query) {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  p.on('requestfailed', (r) => errs.push('не загрузилось: ' + r.url().split('/').pop()));
  let ok = 0;
  p.on('console', (m) => { if (m.text().startsWith('ok:')) ok++; });
  const url = 'file://' + encodeURI(path.join(HERE, file)) + (query || '');
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1800));
  const dom = await p.evaluate(() => ({
    hOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    nested: document.querySelectorAll('a a').length,
    brokenImg: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth === 0).length,
  }));
  await p.close();
  return { ok, errs, dom };
}

for (const a of APPS) {
  if (!want(a.id)) continue;
  const file = a.id + '/index.html';
  if (!existsSync(path.join(HERE, file))) { rows.push([a.name, '—', 'файл не найден']); continue; }
  const r = await openAndAudit(file, '?test=1');
  const problems = [...r.errs];
  if (r.dom.hOver > 0) problems.push('страница ездит вбок на ' + r.dom.hOver + 'px');
  if (r.dom.nested) problems.push('вложенных <a>: ' + r.dom.nested);
  if (r.dom.brokenImg) problems.push('битых картинок: ' + r.dom.brokenImg);
  totalChecks += r.ok; totalFails += problems.length;
  rows.push([a.name, r.ok + ' проверок', problems.length ? problems.join(' · ') : 'чисто']);
}

for (const t of NODE_TESTS) {
  if (!want(t.id)) continue;
  const f = path.join(HERE, t.file);
  if (!existsSync(f)) { rows.push([t.name, '—', 'файл не найден']); continue; }
  try {
    const out = execSync('node ' + JSON.stringify(f), { cwd: path.dirname(f), encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    const m = out.match(/(\d+) passed, (\d+) failed/);
    if (m) { totalChecks += +m[1]; totalFails += +m[2];
      rows.push([t.name, m[1] + ' проверок', +m[2] ? m[2] + ' упало' : 'чисто']); }
    else { const okline = /\bOK\b/.test(out); totalFails += okline ? 0 : 1;
      rows.push([t.name, okline ? 'OK' : '—', okline ? 'чисто' : 'нет строки OK']); }
  } catch (e) {
    totalFails++;
    rows.push([t.name, '—', 'упал: ' + String(e.stdout || e.message).split('\n').slice(-3).join(' ').slice(0, 120)]);
  }
}

for (const g of PAGES) {
  if (!want(g.id)) continue;
  const r = await openAndAudit(g.file, '');
  const problems = [...r.errs];
  if (r.dom.hOver > 0) problems.push('ездит вбок на ' + r.dom.hOver + 'px');
  if (r.dom.nested) problems.push('вложенных <a>: ' + r.dom.nested);
  if (r.dom.brokenImg) problems.push('битых картинок: ' + r.dom.brokenImg);
  totalFails += problems.length;
  rows.push([g.name, 'страница', problems.length ? problems.join(' · ') : 'чисто']);
}

/* Ссылки стенда — все ли ведут в существующие файлы */
if (want('.')) {
  const p = await browser.newPage();
  await p.goto('file://' + encodeURI(path.join(HERE, 'index.html')), { waitUntil: 'networkidle0' });
  const links = await p.evaluate(() => [...document.querySelectorAll('a[href]')]
    .map((a) => a.getAttribute('href')).filter((h) => !/^https?:/.test(h)));
  await p.close();
  const dead = links.filter((h) => {
    const f = path.join(HERE, decodeURIComponent(h.split('?')[0]));
    return !existsSync(f.endsWith('/') ? f + 'index.html' : f);
  });
  totalFails += dead.length;
  rows.push(['Ссылки стенда', links.length + ' шт', dead.length ? 'битые: ' + dead.join(', ') : 'все живые']);
}

await browser.close();

const w0 = Math.max(...rows.map((r) => r[0].length));
const w1 = Math.max(...rows.map((r) => r[1].length));
console.log('');
for (const [a, b, c] of rows) {
  const bad = c !== 'чисто' && c !== 'все живые';
  console.log((bad ? '✗ ' : '✓ ') + a.padEnd(w0) + '  ' + b.padEnd(w1) + '  ' + c);
}
console.log('\n' + (totalFails ? '✗ ' : '✓ ') + totalChecks + ' проверок, ' + totalFails + ' проблем\n');
process.exit(totalFails ? 1 : 0);
