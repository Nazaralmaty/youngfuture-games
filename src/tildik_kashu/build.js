#!/usr/bin/env node
/* Сборка: модули из src → один самодостаточный HTML в templates/
   Запуск:  node src/tildik_kashu/build.js                       */

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const OUT = path.join(SRC, '..', '..', 'templates', 'tildik_kashu.html');

const ORDER = [
  '00_util.js',
  '01_input.js',
  '02_audio.js',
  '03_textures.js',
  '04_fx.js',
  '05_skeleton.js',
  '06_hero.js',
  '07_enemies.js',
  '08_world.js',
  '09_game.js',
];

const parts = ORDER.map((f) => {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  return `\n/* ===== ${f} ===== */\n${code}`;
});

const bundle = `'use strict';\n(function(){\n${parts.join('\n')}\n})();`;

const tpl = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');
if (!tpl.includes('/*<<<BUNDLE>>>*/')) {
  console.error('В шаблоне нет метки /*<<<BUNDLE>>>*/');
  process.exit(1);
}
const html = tpl.replace('/*<<<BUNDLE>>>*/', () => bundle);

fs.writeFileSync(OUT, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`✓ ${path.relative(process.cwd(), OUT)} — ${kb} КБ, модулей: ${ORDER.length}`);

/* Вариант для публикации как Artifact: без обёртки документа —
   там <head> подставляется хостом, нужен только контент. */
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const title = html.match(/<title>([\s\S]*?)<\/title>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const art = `<title>${title}</title>\n${style}\n${body}`;
const OUT2 = path.join(SRC, 'dist_artifact.html');
fs.writeFileSync(OUT2, art, 'utf8');
console.log(`✓ ${path.relative(process.cwd(), OUT2)} — вариант для ссылки`);
