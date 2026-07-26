#!/usr/bin/env node
/* Вставляет render.js в templates/ageofwar2.html между маркерами.
   Файл остаётся одним самодостаточным HTML — как требует GitHub Pages.
   Запуск: node src/soz_sogysy/inject.js                              */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'render.js');
const HTML = path.join(__dirname, '..', '..', 'templates', 'ageofwar2.html');
const A = '/*<<<WAR_RENDER_START>>>*/';
const B = '/*<<<WAR_RENDER_END>>>*/';

const code = fs.readFileSync(SRC, 'utf8');
let html = fs.readFileSync(HTML, 'utf8');

const block = `${A}\n${code}\n${B}`;

if (html.includes(A) && html.includes(B)) {
  const i = html.indexOf(A), j = html.indexOf(B) + B.length;
  html = html.slice(0, i) + block + html.slice(j);
} else {
  // первая вставка: отдельным скриптом перед игровым кодом
  const anchor = html.indexOf('<script>');
  if (anchor < 0) { console.error('нет <script> в шаблоне'); process.exit(1); }
  html = html.slice(0, anchor) + `<script>\n${block}\n</script>\n` + html.slice(anchor);
}

fs.writeFileSync(HTML, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`✓ render.js вставлен в ${path.relative(process.cwd(), HTML)} — ${kb} КБ`);
