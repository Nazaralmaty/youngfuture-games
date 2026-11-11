#!/bin/sh
# Cuts the Tilda T123 block out of index.html: everything between the TILDA START / TILDA END markers.
cd "$(dirname "$0")" && sed -n '/TILDA START/,/TILDA END/p' index.html > tilda-block.html && echo "tilda-block.html: $(wc -c < tilda-block.html) bytes"
