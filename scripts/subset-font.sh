#!/bin/sh
# Gera o subset da fonte do quadro (Caveat, OFL) com só o necessário para pt-BR/en:
# ASCII, Latin-1 (acentos), aspas, travessões, reticências e euro. Sem ligaduras/kerning extras.
# Requer: pip install fonttools brotli
SRC=node_modules/@fontsource/caveat/files/caveat-latin-500-normal.woff2
OUT=src/assets/caveat-500-subset.woff2
pyftsubset "$SRC" --output-file="$OUT" --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+20AC" \
  --layout-features='kern' --no-hinting --desubroutinize
ls -l "$OUT"
