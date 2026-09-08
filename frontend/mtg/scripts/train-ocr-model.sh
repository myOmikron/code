#!/usr/bin/env bash
# Fine-tunes Tesseract on the typefaces Magic cards are set in, and installs the result.
#
# Stock English reads 111 of 185 ordinary card titles exactly; this reads 155. The gain is real
# but it is not free to reproduce: it needs the tesseract training tools (lstmtraining,
# combine_tessdata), the reference images in .cache/scryfall, and about an hour.
#
# The two things that decide whether it works at all, both learned the hard way:
#
#   * The line images must be produced in the same page segmentation mode the app reads in.
#     Trained at --psm 6 and read at --psm 13, character error fell from 52% to 14% and not one
#     additional card name came out. Both sides use 13 here.
#   * tessdata_fast cannot be fine-tuned; its weights are quantised. The base model comes from
#     tessdata_best, which is also why the shipped model is larger than the stock one.
#
# Usage: pnpm run ocr:model [cards]      (default 45000)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
work="$root/.cache/ocr-train"
cards="${1:-45000}"
iterations="${ITERATIONS:-40000}"

mkdir -p "$work/tessdata" "$work/out"

if [ ! -f "$work/tessdata/eng.traineddata" ]; then
  echo "Basismodell wird geladen (tessdata_best)"
  curl -sL -o "$work/tessdata/eng.traineddata" \
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata"
fi
# tesseract looks for its config files next to the language data, and lstm.train is one of them.
[ -d "$work/tessdata/configs" ] || cp -r /usr/share/tessdata/configs "$work/tessdata/"

echo "Titelstreifen werden geschnitten ($cards Karten)"
node "$here/build-ocr-corpus.mjs" --count "$cards" --lang en --out "$work/data/en"

echo "Box-Dateien"
python3 - "$work/data/en" <<'PY'
import glob, sys, os
directory = sys.argv[1]
for truth in glob.glob(os.path.join(directory, "*.gt.txt")):
    stem = truth[:-7]
    text = open(truth, encoding="utf-8").read().rstrip("\n")
    with open(stem + ".box", "w", encoding="utf-8") as box:
        box.write(f"WordStr 0 0 322 54 0 #{text}\n\t 0 0 322 54 0\n")
PY

echo "Umwandlung ins Trainingsformat"
export TESSDATA_PREFIX="$work/tessdata"
# find rather than a glob: at 45000 files the shell's argument list overflows and the loop
# silently does nothing.
find "$work/data/en" -name '*.png' | sed 's/\.png$//' \
  | xargs -P "$(nproc --ignore=2)" -I{} sh -c 'tesseract "{}.png" "{}" --psm 13 -c user_defined_dpi=300 lstm.train >/dev/null 2>&1'

find "$work/data/en" -name '*.lstmf' | shuf > "$work/all.txt"
total=$(wc -l < "$work/all.txt")
held=$((total / 20))
head -n "$held" "$work/all.txt" > "$work/eval.txt"
tail -n +$((held + 1)) "$work/all.txt" > "$work/train.txt"
echo "$((total - held)) zum Lernen, $held zurückgehalten"

# Wiped, not pattern-matched: lstmtraining resumes from out/mtg_checkpoint, whose name has no dot
# and so survives `rm out/*.checkpoint`. A run that quietly continues an older model reports the
# same error rate as before and looks like a result.
rm -rf "$work/out" && mkdir -p "$work/out"
combine_tessdata -e "$work/tessdata/eng.traineddata" "$work/eng.lstm"

echo "Training ($iterations Durchläufe)"
lstmtraining --model_output "$work/out/mtg" --continue_from "$work/eng.lstm" \
  --traineddata "$work/tessdata/eng.traineddata" \
  --train_listfile "$work/train.txt" --eval_listfile "$work/eval.txt" \
  --max_iterations "$iterations"

best=$(ls -t "$work"/out/mtg_*.checkpoint | head -1)
echo "bester Stand: $best"
lstmtraining --stop_training --continue_from "$best" \
  --traineddata "$work/tessdata/eng.traineddata" \
  --model_output "$work/tessdata/mtg.traineddata"

gzip -c "$work/tessdata/mtg.traineddata" > "$root/public/tesseract/mtg.traineddata.gz"
echo "installiert: public/tesseract/mtg.traineddata.gz"
echo "messen mit: node test/ocr-reference.mjs --count 200 --psm 13 --model mtg --lang .cache/ocr-train/tessdata --ordinary"
