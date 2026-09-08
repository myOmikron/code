#!/usr/bin/env bash
# Reads held-out title strips with the model trained for them, per language.
#
# Held out, not sampled: every model's training split leaves a twentieth aside, and those are the
# only strips that say anything about reading rather than remembering.
#
# What is counted is names resolved, not titles read exactly. The app hands every reading to
# `resolveName`, which matches it against the catalogue by edit distance, so a title one letter
# out still finds its card; counting exact matches measures a stricter thing than the scanner ever
# decides. The exact figure is still reported alongside, because it is the one a training run
# moves directly. See test/ocr-resolve.ts for what the three columns mean.
#
# One tesseract per card, run in parallel: the startup cost dominates the recognition, and a
# sequential pass over eleven languages does not finish in a sitting.
#
# Usage: bash scripts/measure-models.sh [samples]
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
work="$root/.cache/ocr-train"
samples="${1:-60}"
export TESSDATA_PREFIX="$work/tessdata"

# Every name each language has, which is what a reading is resolved against. Built from the bulk
# file rather than from the fetched images: resolving against a short list is easier than against
# a long one, and the images only ever cover part of a language.
if [ ! -f "$root/.cache/scryfall/names-en.jsonl" ]; then
  echo "Namenslisten werden gebaut" >&2
  python3 - "$root/.cache/scryfall" <<'PYNAMES'
import gzip, json, os, sys
path = sys.argv[1]
languages = {"en", "de", "fr", "es", "it", "pt", "ja", "zhs", "zht", "ko", "ru"}
handles = {l: open(os.path.join(path, f"names-{l}.jsonl"), "w", encoding="utf-8") for l in languages}
for line in gzip.open(os.path.join(path, "all-cards.jsonl.gz"), "rt", encoding="utf-8"):
    card = json.loads(line)
    if card.get("lang") not in languages:
        continue
    handles[card["lang"]].write(
        json.dumps({"id": card["id"], "name": card.get("name", ""),
                    "printedName": card.get("printed_name", "")}, ensure_ascii=False) + "\n")
for handle in handles.values():
    handle.close()
PYNAMES
fi

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/pairs"

for spec in "en mtg" "de mtg" "fr mtg" "es mtg" "it mtg" "pt mtg" "ja mtgjpn" "zhs mtgzhs" "zht mtgzht" "ko mtgkor" "ru mtgrus"; do
  set -- $spec
  lang="$1"; model="$2"
  evallist="$work/$model-eval.txt"
  if [ ! -f "$work/tessdata/$model.traineddata" ] || [ ! -f "$evallist" ]; then
    echo "$lang $model: nicht vorhanden" >&2
    continue
  fi

  grep "/data/$lang/" "$evallist" | head -n "$samples" | sed 's/\.lstmf$//' > "$scratch/list"
  count=$(wc -l < "$scratch/list")
  [ "$count" -eq 0 ] && { echo "$lang $model: keine Karten" >&2; continue; }

  rm -rf "$scratch/out" && mkdir -p "$scratch/out"
  nl -ba "$scratch/list" | xargs -P "$(nproc --ignore=2)" -n 2 sh -c \
    'tesseract "$1.png" - -l '"$model"' --psm 13 -c user_defined_dpi=300 2>/dev/null | head -1 > "'"$scratch"'/out/$0"'

  # Truth and reading side by side, for the resolver to judge. Tabs and newlines are stripped
  # from both: they are the separator here, and tesseract emits them freely.
  index=0
  : > "$scratch/pairs/$lang.$model.tsv"
  while read -r stem; do
    index=$((index + 1))
    truth=$(tr -d '\t\n' < "$stem.gt.txt")
    got=$(tr -d '\t\n' < "$scratch/out/$index" 2>/dev/null)
    printf '%s\t%s\n' "$truth" "$got" >> "$scratch/pairs/$lang.$model.tsv"
  done < "$scratch/list"
done

node "$root/test/ocr-resolve.mjs" "$scratch/pairs"
