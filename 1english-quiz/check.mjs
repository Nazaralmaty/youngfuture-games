// Walks the Tilda-copy quiz in headless Chrome: age stop shows a polite «Қызығушылығыңызға рақмет!» and the quiz can't go on (also after reload),
// full path sends every answer, Pixel Lead after the sheet says ok, redirect to thanks.html, the same device then sees
// «Өтінішіңіз қабылданды» (also in a tab left open), a phone the sheet already has gets no second row and no Lead, failed send shows an error.
// Then runs apps-script.gs on a fake sheet: the second lead with the same phone is refused.
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
async function open(width = 375, ctx) {            // own context per visitor = own localStorage
  const page = await (ctx || await browser.createBrowserContext()).newPage();
  await page.setViewport({ width, height: 812, deviceScaleFactor: 2 });
  page.errors = []; page.posts = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => m.type() === 'error' && page.errors.push(m.text()));
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith('https://script.google.com')) {
      page.posts.push(r.postData());
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: page.fail ? 'oops' : page.dup ? '{"ok":false,"error":"duplicate"}' : '{"ok":true}' });
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
const lockKind = p => p.$eval('#quiz-lock', e => e.dataset.kind + ' | ' + e.innerText.replace(/\s+/g, ' ')).catch(() => null);
await tap(p, 0);
assert((await lockKind(p))?.startsWith('stop | Қызығушылығыңызға рақмет! Өкінішке қарай'), 'under 18: «Қызығушылығыңызға рақмет! Өкінішке қарай…»');
assert(await active(p) === '0' && p.posts.length === 0, 'under 18: quiz did not move on, nothing sent');
assert(await p.evaluate(() => { const r = document.querySelector('.t-step-form__step_active label').getBoundingClientRect();
  return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('#quiz-lock') !== null; }), 'under 18: quiz is covered, nothing to tap');
await shot(p, '01b_stop');
await p.reload({ waitUntil: 'networkidle0' }); await wait(500);
assert((await lockKind(p))?.startsWith('stop'), 'under 18: reload keeps the stop screen');
p = await open(); await tap(p, 4);
assert((await lockKind(p))?.startsWith('stop') && p.posts.length === 0, 'over 50: stop screen, nothing sent');

// 2. full path (a second tab of the same browser is open at the form, to check it can't send again)
p = await open();
const tab2 = await open(375, p.browserContext());
await p.bringToFront();
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
const ctx1 = p.browserContext();
assert(await tab2.evaluate(() => document.getElementById('quiz-lock')?.dataset.kind) === 'sent', 'tab opened before the lead closes itself after the lead');
await tab2.bringToFront();                    // a background tab is throttled, puppeteer calls hang
await tab2.evaluate(() => document.getElementById('quiz-lock').remove());   // even with the screen torn off, no second send
for (const i of [1, 0, 0, 0, 0]) await tap(tab2, i);
await tab2.type('[name="Name"]', 'Тест'); await tab2.type('.t-input-phonemask', '7019998877');
await tab2.click('.t-quiz__btn_submit'); await wait(1500);
assert(tab2.posts.length === 0 && (await lockKind(tab2))?.startsWith('sent'), 'same browser, second submit: nothing sent, «қабылданды» back');
await shot(p, '05_thanks');
assert(await p.$eval('a.btn', a => a.href) === 'https://www.instagram.com/1eng.kz/', 'thank-you links to Instagram @1eng.kz');
assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'thanks: no horizontal scroll');

// same device comes back: no second lead
let back = await open(375, ctx1);
assert((await lockKind(back))?.startsWith('sent | Рақмет! Өтінішіңіз қабылданды'), 'same browser after a lead: «Өтінішіңіз қабылданды», quiz closed');
await shot(back, '05b_sent');

// another device, phone already in the sheet: no thanks, no Lead, «бізде бар»
p = await open(); p.dup = true;
for (const i of [1, 0, 0, 0, 0]) await tap(p, i);
await p.type('[name="Name"]', 'Тест'); await p.type('.t-input-phonemask', '7011234567');
await p.click('.t-quiz__btn_submit'); await wait(1500);
assert(!p.url().includes('thanks') && await leads(p) === 0 && (await lockKind(p))?.startsWith('sent'), 'duplicate phone: «қабылданды» screen, no thanks, no Lead');

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

// 4. apps-script.gs on a fake sheet
{
  const rows = [];
  const sh = { getLastRow: () => rows.length, appendRow: r => rows.push(r), setFrozenRows() {},
    getRange: (r, c, n) => ({ getValues: () => rows.slice(r - 1, r - 1 + n).map(x => [String(x[c - 1]).replace(/^'/, '')]) }) };
  let locked = 0;
  const gas = new Function('SpreadsheetApp', 'LockService', 'ContentService', fs.readFileSync(new URL('apps-script.gs', dir), 'utf8') + '; return doPost;')(
    { getActiveSpreadsheet: () => ({ getSheetByName: () => sh }) },
    { getScriptLock: () => ({ waitLock() { locked++; }, releaseLock() { locked--; } }) },
    { MimeType: {}, createTextOutput: t => ({ setMimeType() { return JSON.parse(t); } }) });
  const lead = (phone, age = '26–35 жас') => gas({ parameter: { name: 'Тест', phone, age } });
  assert(lead('77011234567').ok === true && rows.length === 2, 'sheet: first lead written');
  assert(lead('77011234567').error === 'duplicate' && rows.length === 2, 'sheet: same phone again refused, no second row');
  assert(lead('77019998877').ok === true && rows.length === 3, 'sheet: another phone written');
  assert(lead('77010000000', '18 жасқа дейін').error === 'not_lead' && rows.length === 3, 'sheet: under 18 refused even when posted directly');
  assert(locked === 0, 'sheet: lock always released');
}
