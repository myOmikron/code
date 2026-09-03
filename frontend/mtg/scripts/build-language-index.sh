#!/usr/bin/env bash
# Baut den Suchindex über alle Sprachen, von vorn oder als Fortsetzung.
#
# Jeder Schritt überspringt, was schon getan ist, der Lauf ist also nach einem Abbruch einfach
# erneut zu starten. Die Reihenfolge steht dagegen fest, und zwar nicht aus Bequemlichkeit: die
# Vektordatei wird in Katalogreihenfolge geschrieben, weshalb angehängt sein muss, bevor
# eingebettet wird, und der Katalog zwischen Einbetten und Packen nicht mehr wachsen darf.
#
# Was die Zahlen betrifft: ein voller Lauf lädt rund 450000 Bilder (etwa 40 GB) und bettet ebenso
# viele Vektoren ein. Auf 24 Kernen sind das grob drei Stunden Abruf und zwei Stunden Einbettung.
#
# Usage: bash scripts/build-language-index.sh [sprache...]
#   ohne Argumente alle zehn, sonst nur die genannten
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
cd "$root"

sprachen=("$@")
[ ${#sprachen[@]} -eq 0 ] && sprachen=(ko zht ru pt zhs it es de fr ja)

# Nicht die Vorgabe des Packers, sondern das, womit die App zur Laufzeit ihre Bilder aufbereitet.
# Beide Varianten liegen fertig im Cache, und ein Index aus der falschen fällt durch keinen Test:
# er lädt, er sucht, er trifft nur nicht.
aufbereitung=$(grep -oP 'PREPROCESSING: Preprocessing = "\K[^"]+' src/scanner/embedding.ts)
echo "Aufbereitung laut src/scanner/embedding.ts: $aufbereitung"

for sprache in "${sprachen[@]}"; do
  frei=$(df -BG --output=avail . | tail -1 | tr -dc '0-9')
  if [ "$frei" -lt 12 ]; then
    echo "ABBRUCH vor $sprache: nur noch ${frei}G frei" >&2
    exit 1
  fi
  echo "=== $sprache: Bilder (${frei}G frei)"
  # Absichtlich mehr, als es je geben wird: der Lister nimmt, was da ist, und eine gepflegte
  # Stückzahl je Sprache veraltet mit dem nächsten Set.
  bash scripts/fetch-language-images.sh "$sprache" 999999 8 2>&1 | grep -vE '^fehlgeschlagen' | tail -2
done

for sprache in "${sprachen[@]}"; do
  printf "=== %s: Katalog  " "$sprache"
  pnpm run scan:append -- --lang "$sprache" 2>&1 | grep -E "angehängt|nichts" | tail -1
done

echo "=== Gedruckte Namen nachtragen"
python3 scripts/backfill-printed-names.py || exit 1

echo "=== Einbettung"
pnpm run scan:embed 2>&1 | tail -2

echo "=== Packen"
python3 scripts/pack-embedding-index.py --preprocessing "$aufbereitung" 2>&1 | tail -6

echo "=== Selbsttest"
pnpm run scan:selftest 2>&1 | tail -1
