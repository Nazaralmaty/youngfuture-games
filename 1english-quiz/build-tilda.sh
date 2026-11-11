#!/bin/sh
# Cuts the Tilda T123 block out of index.html: everything between the TILDA START / TILDA END markers.
cd "$(dirname "$0")" || exit 1
grep -q "var SHEET_URL = '';" index.html && echo "ВНИМАНИЕ: SHEET_URL пустой — в таком виде заявки в таблицу не попадут"
sed -n '/TILDA START/,/TILDA END/p' index.html > tilda-block.html && echo "tilda-block.html: $(wc -c < tilda-block.html) bytes"
