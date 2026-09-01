"""Fuellt printedName in Katalogzeilen nach, die ihn nie bekommen haben.

Der Katalog hat zwei Quellen. `fetch-card-images.mjs` hat ihn englisch aufgebaut und dabei auch
einige fremdsprachige Drucke aufgenommen, ohne je einen gedruckten Namen zu schreiben;
`append-language-faces` haengt spaeter Sprachen an, ueberspringt aber bekannte IDs und kommt an
diese Zeilen nie heran. Das Ergebnis waren 1207 spanische Drucke, die im Index lagen und ueber
ihren gedruckten Titel trotzdem unauffindbar waren.

Reihenfolge und Zeilenzahl bleiben unangetastet, weil die Vektordatei in Katalogreihenfolge
geschrieben ist: jede Verschiebung wuerde jeden Vektor dahinter mit der falschen Karte paaren.
Deshalb prueft das Skript sein eigenes Ergebnis Zeile fuer Zeile, bevor es die Datei ersetzt.

Idempotent: ein zweiter Lauf findet nichts mehr und schreibt nicht.

Usage: python3 scripts/backfill-printed-names.py
"""

import gzip
import json
import os
import sys

CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache", "scryfall")
QUELLE = os.path.join(CACHE, "faces.jsonl")
BULK = os.path.join(CACHE, "all-cards.jsonl.gz")


def main():
    fehlend = set()
    with open(QUELLE, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            card = json.loads(line)
            if card.get("lang") not in (None, "en") and not card.get("printedName"):
                fehlend.add(card["id"])
    print(f"Zeilen ohne printedName: {len(fehlend)}")
    if not fehlend:
        print("nichts nachzutragen")
        return 0

    namen = {}
    with gzip.open(BULK, "rt", encoding="utf-8") as f:
        for line in f:
            card = json.loads(line)
            if card["id"] not in fehlend:
                continue
            gedruckt = card.get("printed_name") or (card.get("card_faces") or [{}])[0].get("printed_name")
            if gedruckt:
                namen[card["id"]] = gedruckt
    print(f"in den Rohdaten auffindbar: {len(namen)}")
    if not namen:
        print("nichts nachzutragen")
        return 0

    ziel = QUELLE + ".neu"
    ergaenzt = 0
    with open(QUELLE, encoding="utf-8") as f, open(ziel, "w", encoding="utf-8") as out:
        for line in f:
            if not line.strip():
                out.write(line)
                continue
            card = json.loads(line)
            gedruckt = namen.get(card["id"])
            if gedruckt and not card.get("printedName"):
                card["printedName"] = gedruckt
                ergaenzt += 1
                out.write(json.dumps(card, ensure_ascii=False) + "\n")
            else:
                out.write(line)

    with open(QUELLE, encoding="utf-8") as alt, open(ziel, encoding="utf-8") as neu:
        for nummer, (zeile_alt, zeile_neu) in enumerate(zip(alt, neu)):
            if zeile_alt == zeile_neu:
                continue
            a, n = json.loads(zeile_alt), json.loads(zeile_neu)
            if a["id"] != n["id"] or a.get("image") != n.get("image"):
                print(f"ABBRUCH: Zeile {nummer} verschoben, {ziel} bleibt liegen", file=sys.stderr)
                return 1
            geaendert = {k for k in set(a) | set(n) if a.get(k) != n.get(k)}
            if geaendert != {"printedName"} or a.get("printedName"):
                print(f"ABBRUCH: Zeile {nummer} aendert {geaendert}, {ziel} bleibt liegen", file=sys.stderr)
                return 1
    if sum(1 for _ in open(QUELLE, encoding="utf-8")) != sum(1 for _ in open(ziel, encoding="utf-8")):
        print(f"ABBRUCH: Zeilenzahl weicht ab, {ziel} bleibt liegen", file=sys.stderr)
        return 1

    os.replace(ziel, QUELLE)
    print(f"ergaenzt: {ergaenzt} Zeilen, Reihenfolge geprueft")
    return 0


if __name__ == "__main__":
    sys.exit(main())
