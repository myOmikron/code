# Scanner: Analyse & Verbesserungen

Stand: 2026-07-21. Bezieht sich auf die Scan-Komponente (Aufnahme, Matching-Pipeline, Index-Delivery). Sammlung/Decks sind bewusst ausgeklammert.

## Priorisierte Übersicht

| # | Thema | Wirkung | Aufwand |
|---|-------|---------|---------|
| 1 | Index-Delivery: 75-MB-Download bei jedem Start | sehr hoch | mittel |
| 2 | Pipeline in Web Worker (`OffscreenCanvas`) | hoch | mittel |
| 3 | Live-Kamera mit Frame-Aggregation | sehr hoch | hoch (braucht #2) |
| 4 | Ungenutzte Printing-Varianten anschließen | mittel | klein |
| 5 | Rejection-Schwelle („nicht sicher") | mittel | klein |
| 6 | Rotation/Homographie in der Kantenerkennung | mittel | hoch |
| 7 | Papercuts (Progress, File-Input, Object-URLs) | klein | klein |

Empfohlene Reihenfolge: **1 → 2+3 → 4+5 → 6**. OCR (siehe unten) dockt an #5 an.

## 1. Index-Delivery

`routing.json` ist **75 MB** und wird bei jedem App-Start übers Netz geladen — `fetchJson` nutzt `cache: "no-cache"` (`src/allCardIndex.ts`), und `public/sw.js` behandelt `manifest.json`/`routing.json` network-first. Ein Mobilgerät lädt also bei jedem Öffnen 75 MB, bevor der Scanner bereit ist.

- **Versions-gesteuert cachen:** Nur `manifest.json` (87 KB) network-first holen. `routing.json` nur neu laden, wenn sich `indexVersion` geändert hat, sonst aus dem Cache bedienen.
- **Binärformat statt Base64-in-JSON:** Die Routing-Vektoren sind bereits Bytes; Base64 kostet +33 %, und 75 MB JSON-Parse ist teuer. Ein flacher `ArrayBuffer` mit Records fester Größe wäre ~50 MB, parst quasi umsonst und erlaubt kolumnare Typed Arrays statt 110k JS-Arrays mit je fünf `Uint8Array`s — deutlich weniger Heap und GC auf dem Handy, schnellere Scoring-Schleife durch bessere Cache-Lokalität.
- **Brotli-Precompression** beim Ausliefern.

Achtung: Formatänderung heißt Bump der Index-Versionen in `scripts/build-scryfall-index.mjs`, `src/referenceIndex.ts` und `public/sw.js` (siehe CLAUDE.md, Version-Bump-Invariante).

## 2. Web Worker

Signaturberechnung plus Scoring von 110 533 Routen läuft komplett auf dem Main-Thread — die Scan-Animation ruckelt währenddessen. Für kontinuierliches Scannen (#3) zwingend. `src/imageHash.ts` nutzt durchgehend `document.createElement("canvas")`; die Canvas-Zugriffe (`canvasPixels`, `canvasRegionPixels`, `normalizeCardImage`, `perspectiveCardImage`) müssen auf `OffscreenCanvas` umgestellt werden.

## 3. Live-Kamera

Der Viewfinder in `App.tsx` ist reine Dekoration; jeder Scan geht über `<input capture>` durch die native Kamera-App. Mit `getUserMedia` + `requestVideoFrameCallback` kann der Scanner kontinuierlich Frames analysieren und Treffer **über mehrere Frames aggregieren** — das entschärft die zwei Hauptprobleme von Einzelfotos: Glare auf Foils und Bewegungsunschärfe. Dazu Torch-Steuerung für schlechtes Licht und ein schneller „nächste Karte"-Loop für Stapel-Erfassung. Benötigt HTTPS auf echten Geräten (wie bisher).

## 4. Ungenutzte Printing-Varianten

`createScanSignatures` (`src/imageHash.ts`) liefert getrennte `identification`- und `printing`-Variantengruppen — inklusive des nachgeschärften Perspektiv-Crops für die Printing-Stufe. Die App ruft aber nur `createImageSignatureVariants` auf, und `findAllCardMatches` verwendet dieselben Signaturen für beide Ranking-Stufen (`src/allCardIndex.ts:414` und `:422`). Die zweite Variantengruppe wird berechnet, aber nie genutzt. Fix: `findAllCardMatches` beide Gruppen entgegennehmen lassen und die Printing-Stufe mit den Printing-Signaturen ranken.

## 5. Rejection-Schwelle

`findAllCardMatches` liefert immer den besten Kandidaten, die UI zeigt immer „Karte erkannt" — auch bei 50 % Ähnlichkeit. Es fehlt:

- eine Mindest-Similarity plus Mindestabstand zwischen Platz 1 und 2, unterhalb derer die UI „Nicht sicher — nochmal versuchen?" anzeigt;
- Robustheit in der Printing-Stufe: sie rastet auf den Namen des Top-1-Treffers ein (`identifiedName`) — ist der falsch, ist auch die Printing-Auswahl verloren. Ein Voting über die Top-k-Namen wäre stabiler.

Die Schwelle definiert außerdem den „unsicher"-Zustand, an dem OCR (unten) andocken kann.

## 6. Rotation & Perspektive

Die Kantenerkennung arbeitet mit achsenparallelen Projektionen; `perspectiveCardImage` korrigiert nur die seitliche Verzerrung zeilenweise (linke/rechte Kante pro Zeile interpoliert) — kein Keystone oben/unten, keine Rotation. Eine um mehr als ein paar Grad gedrehte Karte fällt auf den Center-Crop-Fallback zurück. Nächster Qualitätssprung: echte 4-Punkt-Homographie aus den erkannten Ecken. Größeres Vorhaben; vorher mit gedrehten Varianten der Test-Fixtures die tatsächliche Ausfallrate messen.

## 7. Papercuts

- `findAllCardMatches` hat einen `onProgress`-Callback fürs Shard-Laden, den `App.tsx` nicht durchreicht — bei langsamer Verbindung wirkt der Scan-Overlay eingefroren.
- Der File-Input setzt `value` nie zurück: dasselbe Foto zweimal wählen feuert kein `onChange`.
- `URL.createObjectURL` wird pro Scan erzeugt, aber nie `revokeObjectURL` aufgerufen — Speicherleck bei längeren Sessions.

## OCR: Einschätzung

**Als Ersatz für die visuelle Pipeline: nein. Als Tiebreaker bei unsicheren Treffern: ja.**

Gegen OCR-first:

- **Sprachen:** Der Index basiert auf `default_cards` (im Wesentlichen englische Printings). Deutsche Karten matchen heute über die sprachunabhängigen Artwork-/Kanten-/Farbsignaturen. OCR eines deutschen Titels gegen englische Indexnamen liefert nichts, solange keine Fremdsprachen-Namen (Scryfall `printed_name`/`foreign_names`) eingepflegt sind.
- **Layout-Vielfalt:** Alte Frames, Showcase/Borderless, textlose Länder — Titelposition variiert oder fehlt. Die perceptuelle Pipeline behandelt das uniform.
- **Kosten:** Tesseract.js bedeutet mehrere MB WASM plus ~10 MB Traineddata im PWA-Cache und spürbare Latenz; die Beleren-Schrift und Foil-Glare drücken die Erkennungsrate.

Dafür — als **eingeschränktes Vokabular-Matching**: Nach Routing und Feinranking gibt es eine Handvoll Kandidaten mit bekannten Namen. Die Frage ist nicht „was steht da?", sondern „welcher dieser ~10 Namen steht da?" — Fuzzy-Matching (Edit-Distanz) von auch schlechtem OCR-Output gegen wenige Kandidatennamen ist selbst bei 60 % Zeichengenauigkeit ein starkes Signal.

Integrationsplan:

1. **Lazy und nur bei Unsicherheit:** OCR erst, wenn der visuelle Score unter der Schwelle aus #5 liegt oder Platz 1 und 2 zu nah beieinander sind. Traineddata erst beim ersten Bedarf laden.
2. **Titel-Crop wiederverwenden:** Die Titelregion wird für den `titleVector` bereits ausgeschnitten — derselbe Crop in höherer Auflösung ist der OCR-Input. Für deutsche Karten optional lokalisierte Namen in die Shards aufnehmen und gegen beide matchen.
3. **Fußzeilen-Experiment (interessantester Kandidat):** In der Fußzeile stehen Collector-Number und Set-Code („0821 LTR") — das identifiziert das Printing **exakt** und könnte die komplette zweite Ranking-Stufe (Set-Symbol-, Footer-, Stamp-Vektoren) durch einen Lookup ersetzen. Text ist winzig und kontrastarm, aber bei 12-MP-Fotos groß genug für einen Versuch. Sprachneutral, also ohne die Einschränkung aus Punkt 2. Vorab mit den vorhandenen Test-Fixtures (Sauron LTR #0821, Tyvar DSK #408, Grisly Salvage PLST GK1-64) evaluieren.
