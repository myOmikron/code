#!/usr/bin/env bash
# Compares box-file shapes on a small corpus, because the shape is suspected of teaching the
# model to pad.
#
# Readings duplicate characters near the end — "Condemm", "Flumpph", 失われれし — in both
# languages that have been trained and at both corpus sizes, so it is not undertraining. The box
# tells Tesseract where on the strip the transcription lives; if it claims the whole strip, the
# empty run after the text is part of the word, and inventing something to fill it is the model
# doing as it was told.
#
# Three shapes, one small corpus, everything else held still.
#
# Usage: bash scripts/box-experiment.sh [samples] [iterations]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
work="$root/.cache/ocr-train"
samples="${1:-5000}"
iterations="${2:-3000}"
export TESSDATA_PREFIX="$work/tessdata"

# In two steps on purpose: `find | sort | head` leaves sort killed by SIGPIPE, and under
# `set -o pipefail` that aborts the script before it prints anything at all.
find "$work/data/en" -name '*.png' | sort > "$work/box-alle.txt"
head -n "$samples" "$work/box-alle.txt" > "$work/box-subset.txt"
echo "$(wc -l < "$work/box-subset.txt") Streifen im Versuch"

for shape in voll ohne-umbruch schmal; do
  echo
  echo "=== Form: $shape"
  python3 - "$work/box-subset.txt" "$shape" <<'PY'
import sys
subset, shape = sys.argv[1], sys.argv[2]
for png in open(subset):
    stem = png.strip()[:-4]
    text = open(stem + ".gt.txt", encoding="utf-8").read().rstrip("\n")
    with open(stem + ".box", "w", encoding="utf-8") as box:
        if shape == "voll":
            # What has been used so far: the word claims the strip, and so does the newline.
            box.write(f"WordStr 0 0 322 54 0 #{text}\n\t 0 0 322 54 0\n")
        elif shape == "ohne-umbruch":
            box.write(f"WordStr 0 0 322 54 0 #{text}\n")
        else:
            # The newline as a zero-width mark at the right edge rather than a second claim on
            # the whole strip.
            box.write(f"WordStr 0 0 322 54 0 #{text}\n\t 322 0 322 54 0\n")
PY

  # Rebuild only this subset's training files.
  sed 's/\.png$//' "$work/box-subset.txt" \
    | xargs -P "$(nproc --ignore=2)" -I{} sh -c 'rm -f "{}.lstmf"; tesseract "{}.png" "{}" --psm 13 -c user_defined_dpi=300 lstm.train >/dev/null 2>&1'

  sed 's/\.png$/.lstmf/' "$work/box-subset.txt" | while read -r f; do [ -f "$f" ] && echo "$f"; done | shuf > "$work/box-all.txt"
  total=$(wc -l < "$work/box-all.txt"); held=$((total / 20))
  head -n "$held" "$work/box-all.txt" > "$work/box-eval.txt"
  tail -n +$((held + 1)) "$work/box-all.txt" > "$work/box-train.txt"

  rm -rf "$work/out-box" && mkdir -p "$work/out-box"
  lstmtraining --model_output "$work/out-box/probe" --continue_from "$work/eng.lstm" \
    --traineddata "$work/tessdata/eng.traineddata" \
    --train_listfile "$work/box-train.txt" --eval_listfile "$work/box-eval.txt" \
    --max_iterations "$iterations" 2>&1 | grep -E "^Finished" || true

  best=$(ls -t "$work"/out-box/probe_*.checkpoint 2>/dev/null | head -1)
  lstmtraining --stop_training --continue_from "$best" \
    --traineddata "$work/tessdata/eng.traineddata" \
    --model_output "$work/tessdata/probe.traineddata" >/dev/null 2>&1

  echo -n "  Ergebnis: "
  ( cd "$root" && node test/ocr-reference.mjs --count 200 --psm 13 --model probe \
      --lang .cache/ocr-train/tessdata --no-gzip --ordinary 2>/dev/null | tail -2 | head -1 )
done
