# tools — инструменты проекта

## word-builder.html — конструктор базы слов

Открывать **через сервер**, а не двойным кликом (иначе не прочитает шаблоны):

```bash
python3 -m http.server 8901
# → http://localhost:8901/tools/word-builder.html
```

Что умеет: загрузить базу проекта или вытащить банк из любой готовой игры, править слова
таблицей или пачкой (`environment = қоршаған орта = 🌍 = b1`), фильтровать по уровням
A1–C1 и собрать готовый HTML-файл игры на скачивание. Показывает самое длинное слово —
именно оно проверяет вёрстку.

Заменяет n8n-бота YoungFuture Builder: та же подстановка `var WORDS=[…]` в шаблон.

## build_game.py — то же самое из терминала

```bash
python3 tools/build_game.py templates/arcade.html db/words/en_kk.json --levels b1,b2 -o games/arcade_b1.html
python3 tools/build_game.py --extract games/старая.html -o db/words/из_игры.json
python3 tools/build_game.py --rebuild games/старая.html --template templates/arcade.html
```

`--rebuild` пересобирает опубликованную игру из свежего шаблона, сохраняя её слова —
так в старые игры попадают исправления вёрстки.

## generate_assets.sh — ассеты через kie.ai

Нужен ключ в `~/.claude/tools/kie/.env` (`KIE_API_KEY=…`). Генерит фоны режимов,
иконки игр и экран победы. Фрукты и пузыри осознанно не трогает: на них ложится
подпись, её размер подбирает код.

## db/words/en_kk.json — база слов

Поля: `en`, `kk`, `e` (эмодзи), `lvl` (`a1`…`c1`). Казахские переводы нужно
показать носителю языка перед публикацией.
