// Walks the quiz in headless Chrome: age gate, phone mask, validation, send + Pixel Lead, console errors.
// node check.mjs            — asserts only
// SHOTS=/some/dir node check.mjs — also saves screenshots
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
const require = createRequire(process.env.HOME + '/.claude/engine/');
const puppeteer = require('puppeteer');
const dir = new URL('.', import.meta.url);
const shots = process.env.SHOTS || '';
const src = fs.readFileSync(new URL('index.html', dir), 'utf8')
  .replace("var SHEET_URL = '';", "var SHEET_URL = 'https://script.google.com/macros/s/TEST/exec';");
const tmp = os.tmpdir() + '/1english-quiz-check.html';
fs.writeFileSync(tmp, src);
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
async function open(width = 375) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 812, deviceScaleFactor: 2 });
  page.errors = []; page.posts = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => m.type() === 'error' && page.errors.push(m.text()));
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith('https://script.google.com')) {
      page.posts.push(r.postData());
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: page.fail ? 'oops' : '{"ok":true}' });
    }
    if (u.includes('facebook')) return r.respond({ status: 200, contentType: 'text/javascript', body: '' });
    r.continue();
  });
  // record every fbq call
  await page.evaluateOnNewDocument(() => {
    window.__fb = [];
    Object.defineProperty(window, 'fbq', { configurable: true, get() { return this.__fbq; },
      set(f) { const w = function () { window.__fb.push([...arguments]); return f.apply(this, arguments); }; Object.assign(w, f); this.__fbq = w; } });
  });
  await page.goto('file://' + tmp, { waitUntil: 'networkidle0' });
  return page;
}
const step = p => p.$eval('.oe-step.is-on', e => e.dataset.step);
const tap = async (p, i) => { const b = await p.$$('.oe-step.is-on .oe-opt'); await b[i].click(); await wait(900); };
const shot = (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const leads = p => p.evaluate(() => __fb.filter(a => a[1] === 'Lead').length);

// 1. age gate
let p = await open();
await shot(p, '01_q1');
await tap(p, 0);
assert(await step(p) === 'stop', 'under 18 ends on «Рақмет!»');
await shot(p, '02_stop');
assert(p.posts.length === 0 && await leads(p) === 0, 'under 18: nothing sent, no Lead');
p = await open(); await tap(p, 4);
assert(await step(p) === 'stop', 'over 50 ends on «Рақмет!»');

// 2. full path
p = await open();
assert(await p.evaluate(() => __fb.filter(a => a[1] === 'PageView').length) === 1, 'one PageView');
assert(await p.evaluate(() => document.documentElement.scrollWidth <= 375), 'no horizontal scroll at 375');
await tap(p, 2); await shot(p, '03_q2');
await tap(p, 1); await shot(p, '04_q3');
await tap(p, 0); await p.click('.oe-step.is-on [data-back]'); await wait(600);   // back, change level
assert(await step(p) === '2', 'back returns to the level question');
await tap(p, 3); await shot(p, '05_q4');
await tap(p, 0);
assert(await step(p) === 'form', 'reaches the form');
const small = await p.$$eval('.oe-step.is-on button, .oe-step.is-on input:not(.oe-hp)', els => els.filter(e => e.getBoundingClientRect().height < 44).map(e => e.className + ':' + e.getBoundingClientRect().height));
assert(small.length === 0, 'every tap target ≥ 44px ' + small);
await p.click('.oe-send'); await wait(200);
await shot(p, '06_form_errors');
assert(p.posts.length === 0, 'empty form not sent');
await p.type('input[name=name]', 'Айгерім');
await p.type('input[name=phone]', '87011234567');
assert(await p.$eval('input[name=phone]', e => e.value) === '+7 (701) 123-45-67', 'mask from 8701…');
for (let i = 0; i < 3; i++) await p.keyboard.press('Backspace');
assert(await p.$eval('input[name=phone]', e => e.value) === '+7 (701) 123-4', 'backspace through «-»');
await p.type('input[name=phone]', '567');
await shot(p, '07_form_filled');
await p.click('.oe-send'); await wait(1200);
const body = new URLSearchParams(p.posts[0] || '');
assert(body.get('phone') === '77011234567' && body.get('name') === 'Айгерім' && body.get('age') === '26–35 жас'
  && body.get('goal') === 'Шетелде жұмыс' && (body.get('level') || '').startsWith('Intermediate (B1)')
  && body.get('ready') === 'Иә, дәл қазір бастаймын', 'all answers in the POST');
assert(await leads(p) === 1, 'Lead fired once after success');
assert(await step(p) === 'done', 'success screen');
await shot(p, '08_done');
assert(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));

// 3. sheet answers garbage → visible error, retry, no Lead
p = await open(); p.fail = true;
for (const i of [1, 0, 0, 0]) await tap(p, i);
await p.type('input[name=name]', 'Ерлан'); await p.type('input[name=phone]', '7011234567');
await p.click('.oe-send'); await wait(1200);
assert(await p.$eval('.oe-formerr', e => !e.hidden), 'send failure is visible');
assert(await p.$eval('.oe-send', e => e.textContent) === 'Қайта жіберу', 'retry button');
assert(await leads(p) === 0, 'no Lead on failure');
await shot(p, '09_send_error');

if (shots) { p = await open(1440); await tap(p, 1); await p.screenshot({ path: `${shots}/10_desktop.png` }); }
await browser.close();
