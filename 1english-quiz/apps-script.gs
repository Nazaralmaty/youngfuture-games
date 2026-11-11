/**
 * 1English quiz → Google Sheets.
 * Paste into the sheet: Extensions → Apps Script, replace Code.gs, Deploy → New deployment → Web app,
 * Execute as: Me, Who has access: Anyone. The /exec URL goes into SHEET_URL in the quiz.
 */
var SHEET_NAME = 'Лиды';
var COLUMNS = [
  ['ts', 'Дата'], ['name', 'Имя'], ['phone', 'Телефон'],
  ['age', 'Возраст'], ['goal', 'Цель'], ['level', 'Уровень'], ['ready', 'Готовность'],
  ['utm_source', 'utm_source'], ['utm_medium', 'utm_medium'], ['utm_campaign', 'utm_campaign'],
  ['utm_content', 'utm_content'], ['utm_term', 'utm_term'], ['fbclid', 'fbclid'], ['page', 'Страница']
];
// Only these ages are leads; under 18 / over 50 never reach the sheet even if someone posts directly.
var LEAD_AGES = ['18–25 жас', '26–35 жас', '36–50 жас'];

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (p.website) return json({ ok: true });                       // bot filled the hidden field
  var phone = String(p.phone || '').replace(/\D/g, '');
  var name = String(p.name || '').trim();
  if (name.length < 2 || !/^7\d{10}$/.test(phone)) return json({ ok: false, error: 'bad_input' });
  if (LEAD_AGES.indexOf(p.age) === -1) return json({ ok: false, error: 'not_lead' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUMNS.map(function (c) { return c[1]; }));
    sh.setFrozenRows(1);
  }
  sh.appendRow(COLUMNS.map(function (c) {
    var k = c[0];
    if (k === 'ts') return new Date();
    if (k === 'phone') return "'+" + phone;                         // keep as text, not a number
    return safe(p[k]);
  }));
  return json({ ok: true });
}

function doGet() { return json({ ok: true, hint: 'POST only' }); }

// Plain text only: cut length and stop a value from running as a formula.
function safe(v) {
  var s = String(v == null ? '' : v).slice(0, 300);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to check the sheet write without the site. */
function testPost() {
  Logger.log(doPost({ parameter: { name: 'Тест', phone: '77011234567', age: '26–35 жас',
    goal: 'Шетелде жұмыс', level: 'Beginner (A0) – Тілді мүлде білмеймін, енді бастадым.', ready: 'Иә, дәл қазір бастаймын' } }).getContent());
}
