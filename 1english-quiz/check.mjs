// Walks the Tilda-copy quiz in headless Chrome: age stop closes the page, full path sends every answer,
// Pixel Lead after the sheet says ok, redirect to thanks.html, failed send shows an error and no Lead.
// node check.mjs            — asserts only
// SHOTS=/some/dir node check.mjs — also saves screenshots
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
const require = createRequire(process.env.HOME + '/.claude/engine/');
const puppeteer = require('puppeteer');
const dir = new URL('.', import.meta.url);
const shots = process.env.SHOTS || '';
const tmpDir = fs.mkdtempSync(os.tmpdir() + '/1english-quiz-');
fs.writeFileSync(tmpDir + '/index.html', fs.readFileSync(new URL('index.html', dir), 'utf8')
  .replace("var SHEET_URL = '';", "var SHEET_URL = 'https://script.google.com/macros/s/TEST/exec';"));
fs.copyFileSync(new URL('thanks.html', dir), tmpDir + '/thanks.html');
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
    if (/tildaapi|forms\.tilda/.test(u)) { page.posts.push('TILDA ' + u); return r.abort(); }   // must never happen
    if (u.includes('facebook')) return r.respond({ status: 200, contentType: 'text/javascript', body: '' });
    r.continue();
  });
  await page.evaluateOnNewDocument(() => {
    window.__fb = [];
    Object.defineProperty(window, 'fbq', { configurable: true, get() { return this.__fbq; },
      set(f) { const w = function () { window.__fb.push([...arguments]); return f.apply(this, arguments); }; Object.assign(w, f); this.__fbq = w; } });
  });
  await page.goto('file://' + tmpDir + '/index.html', { waitUntil: 'networkidle0' });
  await wait(800);
  return page;
}
const active = p => p.$eval('.t-step-form__step_active', e => e.dataset.stepIndex).catch(() => null);
const tap = async (p, i) => {
  const ls = await p.$$('.t-step-form__step_active label');
  await ls[i].click(); await wait(1200);
};
const shot = (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png` });
const leads = p => p.evaluate(() => __fb.filter(a => a[1] === 'Lead').length);

// 1. age stop: under 18 and over 50 close the page
let p = await open();
await shot(p, '01_age');
assert(await active(p) === '0', 'first screen is the age question');
assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '375 px: no horizontal scroll');
const h = await p.$$eval('.t-step-form__step_active label', ls => Math.min(...ls.map(l => l.getBoundingClientRect().height)));
assert(h >= 44, `age answers ≥ 44 px tall (${h.toFixed(0)})`);
await tap(p, 0);
assert(p.url() === 'about:blank', 'under 18 closes the page');
assert(p.posts.length === 0, 'under 18: nothing sent');
p = await open(); await tap(p, 4);
assert(p.url() === 'about:blank', 'over 50 closes the page');

// 2. full path
p = await open();
await tap(p, 2);                               // 26–35
assert(await active(p) === '1', 'adult age moves to «не үшін»');
await shot(p, '02_goal');
await tap(p, 1); await tap(p, 0); await tap(p, 2); await tap(p, 0);
assert(await active(p) === '5', 'four answers lead to the contact form');
await shot(p, '03_form');
await p.click('.t-quiz__btn_submit');
await wait(600);
assert(p.posts.length === 0, 'empty form is not sent (Tilda validation)');
await p.type('[name="Name"]', 'Тест Тестов');

await p.type('.t-input-phonemask', '7011234567');
await shot(p, '04_filled');
await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('.t-quiz__btn_submit')]);
const sent = new URLSearchParams(p.posts[0] || '');
assert(p.posts.length === 1 && !p.posts.some(x => x.startsWith('TILDA')), 'one POST to the sheet, nothing to Tilda');
assert(sent.get('age') === '26–35 жас' && sent.get('goal') === 'Шетелде жұмыс' && sent.get('level')?.startsWith('Beginner (A0)')
  && sent.get('since') === 'Әлі бастамадым.' && sent.get('ready') === 'Иә, дәл қазір бастаймын' && sent.get('name') === 'Тест Тестов' && sent.get('phone') === '77011234567',
  'all answers, name and phone in the lead: ' + [...sent].map(x => x.join('=')).join(' | '));
assert(p.url().endsWith('/thanks.html'), 'redirect to thanks.html');
await shot(p, '05_thanks');
assert(await p.$eval('a.btn', a => a.href) === 'https://www.instagram.com/1eng.kz/', 'thank-you links to Instagram @1eng.kz');
assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'thanks: no horizontal scroll');

// 3. failed send: error, no Lead, stays on the form
p = await open(); p.fail = true;
for (const i of [1, 0, 0, 0, 0]) await tap(p, i);
await p.type('[name="Name"]', 'Тест'); await p.type('.t-input-phonemask', '7011234567');
await p.click('.t-quiz__btn_submit'); await wait(1500);
assert(!p.url().includes('thanks') && await leads(p) === 0, 'failed send: stays, no Lead');
assert(await p.$eval('.t-form__errorbox-bottom .js-errorbox-all', e => getComputedStyle(e).display !== 'none'), 'failed send: error visible');
await shot(p, '06_fail');

const errs = p.errors.filter(e => !/favicon|ERR_FAILED|net::/.test(e));
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
await browser.close();
