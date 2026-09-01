#!/usr/bin/env bash
# Fine-tunes one Tesseract model on card titles, for any script.
#
# Two shapes of model come out of this. The Latin one is trained on English plus every language
# that shares its alphabet, because they share the typeface too and only differ in which accents
# appear; the others each get their own, because a model for one script has nothing to say about
# another.
#
# Everything that decides whether this works at all lives in train-ocr-model.sh's header. The one
# worth repeating: the line images must be produced in the same page segmentation mode the app
# reads in, or the character error rate falls beautifully and not one more card name comes out.
#
# Usage: bash scripts/train-language-model.sh <name> <base> <lang...>
#   bash scripts/train-language-model.sh mtg     eng     en de fr es it pt
#   bash scripts/train-language-model.sh mtgjpn  jpn     ja
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
work="$root/.cache/ocr-train"
name="$1"; base="$2"; shift 2
languages=("$@")
iterations="${ITERATIONS:-40000}"
export TESSDATA_PREFIX="$work/tessdata"

[ -d "$work/tessdata/configs" ] || cp -r /usr/share/tessdata/configs "$work/tessdata/"

list="$work/$name-lstmf.txt"
: > "$list"

for lang in "${languages[@]}"; do
  data="$work/data/$lang"
  count=$(find "$data" -name '*.png' 2>/dev/null | wc -l)
  if [ "$count" -eq 0 ]; then
    echo "=== $lang: Streifen werden geschnitten"
    node "$here/build-ocr-corpus.mjs" --count 100000 --lang "$lang" --out "$data" 2>&1 | tail -1
  else
    echo "=== $lang: $count Streifen vorhanden"
  fi

  # Boxes every run: cheap, and the shape has changed once already.
  python3 - "$data" <<'PY'
import glob, os, sys
for truth in glob.glob(os.path.join(sys.argv[1], "*.gt.txt")):
    stem = truth[:-7]
    text = open(truth, encoding="utf-8").read().rstrip("\n")
    with open(stem + ".box", "w", encoding="utf-8") as box:
        # The newline as a zero-width mark at the right edge. Measured against the alternatives it
        # is a tie, not a win — it is here because it is never worse.
        box.write(f"WordStr 0 0 322 54 0 #{text}\n\t 322 0 322 54 0\n")
PY

  echo "    Umwandlung ins Trainingsformat"
  find "$data" -name '*.png' | sed 's/\.png$//' \
    | xargs -P "$(nproc --ignore=2)" -I{} sh -c "rm -f '{}.lstmf'; tesseract '{}.png' '{}' -l $base --psm 13 -c user_defined_dpi=300 lstm.train >/dev/null 2>&1"
  find "$data" -name '*.lstmf' >> "$list"
done

total=$(wc -l < "$list")
if [ "$total" -eq 0 ]; then echo "keine Trainingsdaten"; exit 1; fi
shuf "$list" -o "$list"
held=$((total / 20))
head -n "$held" "$list" > "$work/$name-eval.txt"
tail -n +$((held + 1)) "$list" > "$work/$name-train.txt"
echo "$((total - held)) zum Lernen, $held zurückgehalten"

# Wiped rather than globbed: lstmtraining resumes from <name>_checkpoint, whose name has no dot,
# and a run that quietly continues an older model reports the old error rate and looks like a
# result.
rm -rf "$work/out-$name" && mkdir -p "$work/out-$name"
[ -f "$work/$base.lstm" ] || combine_tessdata -e "$work/tessdata/$base.traineddata" "$work/$base.lstm"

echo "Training ($iterations Durchläufe, Basis $base)"
lstmtraining --model_output "$work/out-$name/$name" --continue_from "$work/$base.lstm" \
  --traineddata "$work/tessdata/$base.traineddata" \
  --train_listfile "$work/$name-train.txt" --eval_listfile "$work/$name-eval.txt" \
  --max_iterations "$iterations" 2>&1 | grep -E "New best|Finished" | tail -5

best=$(ls -t "$work/out-$name/${name}"_*.checkpoint 2>/dev/null | head -1)
[ -n "$best" ] || { echo "kein Checkpoint entstanden"; exit 1; }
echo "bester Stand: $best"
lstmtraining --stop_training --continue_from "$best" \
  --traineddata "$work/tessdata/$base.traineddata" \
  --model_output "$work/tessdata/$name.traineddata"

gzip -c "$work/tessdata/$name.traineddata" > "$root/public/tesseract/$name.traineddata.gz"
echo "installiert: public/tesseract/$name.traineddata.gz"
