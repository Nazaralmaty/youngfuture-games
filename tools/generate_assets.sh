#!/usr/bin/env bash
# Генерация ассетов для Ағылшын Аркада через kie.ai (GPT Image 2).
#
# Нужен ключ: ~/.claude/tools/kie/.env → KIE_API_KEY=…
# Запуск:  bash tools/generate_assets.sh
#
# Осознанно генерим только ФОНЫ и ДЕКОР. Фрукты, пузыри и карточки остаются
# нарисованными на canvas — потому что на них ложится подпись, и её размер
# подбирается кодом. Картинка под текстом сломала бы читаемость длинных слов.

set -euo pipefail

KIE="python3 $HOME/.claude/tools/kie/kie.py"
OUT="assets/generated"
AR_PORTRAIT="9:16"
AR_SQUARE="1:1"

mkdir -p "$OUT"

STYLE="flat vector illustration, modern minimalism, deep navy blue background #070b1e, \
violet #6d4bff and cyan #21d4fd accents, lime green #9be870 highlights, soft glows, \
clean shapes, no text, no letters, no words, mobile game UI art"

echo "== Фоны игровых режимов =="

$KIE gen "Vertical mobile game background for a word-slicing ninja game. \
Dark night sky with subtle stars and soft violet-to-navy gradient, faint diagonal light streaks \
suggesting a blade swipe, empty clean center area so gameplay objects stay readable. $STYLE" \
  --ar "$AR_PORTRAIT" --res 2K --out "$OUT" --name bg_ninja

$KIE gen "Vertical mobile game background, underwater bubbles theme. \
Deep navy gradient with soft cyan light rays from the top, faint translucent bubbles near the edges, \
center kept clean and uncluttered. $STYLE" \
  --ar "$AR_PORTRAIT" --res 2K --out "$OUT" --name bg_bubble

$KIE gen "Vertical mobile game background, playful garden at night seen from above, \
soft rounded burrow holes in dark soil, warm lime and violet rim lighting, \
center area calm and low contrast. $STYLE" \
  --ar "$AR_PORTRAIT" --res 2K --out "$OUT" --name bg_whack

$KIE gen "Vertical mobile game background for a catching game. \
Night sky gradient navy to violet, soft falling light particles, a subtle glow at the bottom \
where a basket would be, clean empty middle. $STYLE" \
  --ar "$AR_PORTRAIT" --res 2K --out "$OUT" --name bg_catch

echo "== Иконки игр для меню (вместо эмодзи) =="

for pair in \
  "ninja:a cute stylized ninja character head with a violet headband, friendly not scary" \
  "bubble:a cluster of three glossy translucent cyan bubbles" \
  "whack:a soft rounded wooden mallet with a lime green handle" \
  "catch:a woven basket glowing with lime green light" \
  "memory:two rounded flip cards, one violet one cyan, mid-flip" \
  "flappy:a small round yellow bird with tiny wings, side view"
do
  name="${pair%%:*}"; desc="${pair#*:}"
  $KIE gen "App icon for a kids educational game: $desc. Centered, generous padding, \
rounded square composition, bold silhouette readable at 64px. $STYLE" \
    --ar "$AR_SQUARE" --res 1K --out "$OUT" --name "icon_$name"
done

echo "== Экран победы =="
$KIE gen "Celebration illustration for a kids learning app: a glowing trophy with \
confetti and soft light burst, joyful and clean. $STYLE" \
  --ar "$AR_SQUARE" --res 2K --out "$OUT" --name win_trophy

echo
echo "Готово. Файлы в $OUT — посмотри их перед встраиванием."
