# CardLens

Mobile-first PWA zum visuellen Erkennen und Verwalten von Magic-Karten – ohne OCR.

## Entwicklung

```bash
pnpm --filter card-lens dev
pnpm --filter card-lens test
pnpm --filter card-lens test:image
pnpm --filter card-lens build
```

Die Kamera-Option benötigt auf einem echten Mobilgerät HTTPS (oder `localhost`).
`test:image` startet lokale Headless-Chromium-Regressionen mit den echten Fotos von **Sauron, the Dark Lord**, LTR #0821, **Tyvar, the Pummeler**, DSK #408, und **Grisly Salvage**, PLST #GK1-64.

Der Vite-Entwicklungsserver bindet ausschließlich an `127.0.0.1:4173`.

## Scryfall-Index

Der vollständige Index wird aus Scryfalls `default_cards`-Bulk-Daten gebaut:

```bash
pnpm --filter card-lens index:build
```

Der Lauf umfasst alle physischen Default-Printings aus allen Sets und legt bei mehrseitigen Karten jede bebilderte Kartenfläche separat an. Die kleinen Scryfall-Bilder werden resumierbar unter `.cache/scryfall-images/<set>/` gespeichert; die Bulk-Datei liegt in `.cache/scryfall-bulk/`. Leere oder beschädigte Cache-Bilder werden beim nächsten Lauf automatisch neu geladen.

Der auslieferbare Index liegt unter `public/data/all-card-index/`:

- `manifest.json` beschreibt Umfang, Fortschritt und alle Set-Shards.
- `routing.json.gz` enthält die gzip-komprimierten Grob-Hashes für die globale Kandidatensuche.
- `shards/<set>.json.gz` enthält komprimierte Metadaten und vollständige Signaturen eines Sets.

Routing und Manifest werden alle 25 Sets atomar aktualisiert. Während eines Imports kann daher der zuletzt publizierte Zwischenstand verwendet werden (`complete: false`, `cardCount` fertig, `totalCardCount` geplant). Ein erfolgreicher Abschluss setzt `complete: true`. Bereits fertige Shards werden bei einem Neustart validiert und wiederverwendet.

Für einen kleinen LTR/DSK-Index oder einen anderen expliziten Satz von Editionen kann das Skript direkt aufgerufen werden:

```bash
pnpm --filter card-lens index:build:sets
node frontend/card-lens/scripts/build-scryfall-index.mjs --sets ltr,dsk,woe
```

`default_cards` vermeidet die vielfachen sprachabhängigen Duplikate aus `all_cards`. Enthalten sind damit alle physischen Default-Kartenobjekte und deren Bilder, nicht jede Übersetzung desselben Printings.

## Matching-Pipeline

1. Kantenprojektionen suchen den Kartenrand unabhängig von der Bildmitte; Seitenverhältnis und Randstärke bewerten die Kandidaten.
2. Der erkannte Ausschnitt wird leicht nach innen versetzt und auf das MTG-Seitenverhältnis normalisiert. Ein Center-Crop greift nur als Fallback.
3. Der Browser berechnet dHash, aHash, Farb- und Kantenraster für die ganze Karte, Artwork und Titel sowie lokale Fingerabdrücke für Set-Symbol, Fußzeile und den The-List-Stempel.
4. Das globale Routing bildet aus allen 110.533 Karten eine Kandidaten-Shortlist. Nur die dafür benötigten Set-Shards werden nachgeladen und anschließend lokal gecacht.
5. Das Feinranking identifiziert zuerst die Karte über Artwork und Titel. Bei mehreren Printings derselben Karte entscheidet eine zweite Stufe anhand der druckspezifischen Regionen.
6. Der beste Treffer und zwei Alternativen werden zur Bestätigung gezeigt.

Die Scan-Oberfläche verwendet den vollständigen geshardeten Index. Das globale Routing bleibt als kompakte Suchstruktur im Browser; vollständige Signaturen werden komprimiert, setweise und bedarfsgesteuert geladen. So muss ein Mobilgerät nicht den gesamten Index in den Arbeitsspeicher laden. Manifest und Routing werden netzwerkaktuell gelesen, während bereits geladene Set-Shards offline im PWA-Cache bleiben. Die Sammlung bleibt ebenfalls lokal auf dem Gerät.
