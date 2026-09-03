#!/usr/bin/env bash
# Fetches reference images for one language's printings, for training the title reader on its
# script. The list of what to fetch comes from the node half; the fetching is curl's because
# node's DNS resolver does not reach cards.scryfall.io from the development sandbox.
#
# Scryfall's ten-per-second limit covers api.scryfall.com; their documentation exempts the file
# origins at *.scryfall.io, which is where images live. The parallelism here is therefore about
# being a considerate guest rather than about a published limit.
#
# Usage: pnpm run scan:lang-images ja 25000 [parallel]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lang="${1:-ja}"
count="${2:-25000}"
parallel="${3:-8}"
list="$(mktemp)"
trap 'rm -f "$list"' EXIT

node "$here/fetch-language-images.mjs" --lang "$lang" --count "$count" > "$list"

# Non-blank lines, not lines. With nothing left to fetch the node half still writes its trailing
# newline, which is one line and one byte, so a plain wc -l walked straight past this guard into an
# xargs that ran curl with no arguments and reported it as a failed download.
total=$(grep -c . "$list" || true)
if [ "$total" -eq 0 ]; then
  echo "nichts zu laden"
  exit 0
fi
echo "$total Bilder werden geladen ($parallel parallel)"

# --fail so a 404 leaves no truncated file behind, --compressed because jpegs come through a CDN
# that will not compress them anyway and the header costs nothing. --retry covers the transient
# TLS drops the CDN produces under sustained load; without it roughly one transfer in a hundred
# was lost on a long run, and a lost transfer becomes a printing missing from the index.
tr '\t' '\n' < "$list" | xargs -P "$parallel" -n 2 sh -c '
  curl -sS --fail --compressed --max-time 120 --retry 2 --retry-delay 1 \
    -A "planarium-scanner/0.1 (card recognition research)" \
    -o "$1" "$0" || echo "fehlgeschlagen: $0" >&2
'

# A jpeg ends in ffd9. Anything else is an interrupted transfer, and the only check above is that
# the file exists, so a half-written one would never be fetched again and would go into the index
# as a vector of whatever the truncation happens to decode to. Cheaper to delete it here and let
# the next run pick it up.
angebrochen=0
while IFS= read -r ziel; do
  [ -f "$ziel" ] || continue
  if [ ! -s "$ziel" ] || [ "$(tail -c 2 "$ziel" | xxd -p)" != "ffd9" ]; then
    rm -f "$ziel"
    angebrochen=$((angebrochen + 1))
  fi
done < <(cut -f2 "$list")
[ "$angebrochen" -gt 0 ] && echo "$angebrochen angebrochene Dateien entfernt, erneut ausführen"

echo "fertig: $(find "$here/../.cache/scryfall/images" -name '*.jpg' | wc -l) Bilder im Zwischenspeicher"
