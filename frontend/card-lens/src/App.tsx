import { useEffect, useMemo, useRef, useState } from "react";
import { addCard, collectionValue, loadCollection, saveCollection, totalCards } from "./collectionStore";
import { loadCardIndex, scanImage } from "./scanClient";
import type { CardQuad, ScanOverlay, ScanPhase } from "./scanClient";
import type { CardRecord, CollectionEntry, MatchCandidate } from "./types";

type IconName =
  | "cards"
  | "scan"
  | "layers"
  | "camera"
  | "image"
  | "search"
  | "check"
  | "spark"
  | "chevron"
  | "plus"
  | "close"
  | "bolt";

const iconPaths: Record<IconName, React.ReactNode> = {
  cards: <><rect x="5" y="4" width="12" height="16" rx="2"/><path d="m9 4 1-1h7a2 2 0 0 1 2 2v12l-2 1"/></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="8" y="7" width="8" height="10" rx="1.5"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z"/><circle cx="12" cy="12" r="4"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  spark: <><path d="m12 3-1.4 4.1L6.5 8.5l4.1 1.4L12 14l1.4-4.1 4.1-1.4-4.1-1.4L12 3Z"/><path d="m5.5 14-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8-.8-2.2Z"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function ManaCost({ value }: { value: string }) {
  const symbols = value.match(/\{([^}]+)\}/g)?.map((symbol) => symbol.slice(1, -1)) ?? [];
  return <span className="mana-cost">{symbols.map((symbol, index) => <span key={`${symbol}-${index}`} className={`mana mana-${symbol.toLowerCase()}`}>{symbol}</span>)}</span>;
}

function CardImage({ card, className = "" }: { card: CardRecord; className?: string }) {
  return <img className={`card-image ${className}`} src={card.imageUrl} alt={`${card.name}, ${card.setName}`} loading="lazy" />;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

// SVG polygon `points` string for a quad, clockwise from the top-left.
function quadPoints(quad: CardQuad): string {
  return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map((p) => `${p.x},${p.y}`).join(" ");
}

function ScanScreen({
  indexCount,
  setCount,
  indexStatus,
  indexProgress,
  onAdd,
}: {
  indexCount: number;
  setCount: number;
  indexStatus: "loading" | "ready" | "error";
  indexProgress: string;
  onAdd: (card: CardRecord, foil: boolean) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<ScanOverlay | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [phase, setPhase] = useState<ScanPhase | "idle">("idle"); // live pipeline stage
  const [analyzeProgress, setAnalyzeProgress] = useState(0); // 0..1 image-analysis progress
  const [ocrProgress, setOcrProgress] = useState(0); // 0..1 OCR progress
  const [message, setMessage] = useState<string | null>(null);
  const [foil, setFoil] = useState(false);
  const [added, setAdded] = useState(false);
  const [justFound, setJustFound] = useState(false); // one-shot flash when a scan resolves
  const [shownConfidence, setShownConfidence] = useState(0); // animated count-up of the confidence

  const isScanning = phase === "detecting" || phase === "analyzing"; // no card yet, frame/analysis
  const live = phase === "reading"; // preliminary card shown, OCR still refining

  async function scanFile(file: File) {
    if (!indexCount) {
      setMessage("Der Referenzindex ist noch nicht bereit.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setMatches([]);
    setOverlay(null);
    setMessage(null);
    setAdded(false);
    setJustFound(false);
    setAnalyzeProgress(0);
    setOcrProgress(0);
    setPhase("detecting");
    try {
      // The scan runs off the main thread and reports each stage live: the frame the instant it
      // is detected, image-analysis progress, the preliminary card the moment perceptual matching
      // resolves, then OCR progress before the refined final result replaces it.
      const result = await scanImage(file, (progress) => {
        setPhase(progress.phase);
        setOverlay(progress.overlay);
        if (progress.matches.length) setMatches(progress.matches);
        setAnalyzeProgress(progress.analyze);
        setOcrProgress(progress.ocr);
      });
      setMatches(result.matches);
      setOverlay(result.overlay);
      setPhase("done");
      if (result.matches.length) setJustFound(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Karte konnte nicht analysiert werden.");
      setPhase("idle");
    }
  }

  function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Bitte wähle ein Foto aus.");
      return;
    }
    void scanFile(file);
  }

  const bestMatch = matches[0];
  const confidence = bestMatch ? Math.round(bestMatch.similarity * 100) : 0;

  // Count the confidence up to its target for a "live" feel, easing from whatever is shown now
  // (so a preliminary→refined update animates smoothly instead of snapping back to zero).
  const confidenceRef = useRef(0);
  useEffect(() => {
    const from = confidenceRef.current;
    const to = confidence;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 600);
      const eased = 1 - (1 - progress) ** 3;
      const value = Math.round(from + (to - from) * eased);
      confidenceRef.current = value;
      setShownConfidence(value);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confidence, bestMatch?.card.id]);

  // Clear the one-shot "found" flash after it has played.
  useEffect(() => {
    if (!justFound) return;
    const timer = setTimeout(() => setJustFound(false), 1000);
    return () => clearTimeout(timer);
  }, [justFound]);

  // Live pipeline HUD: the three stages the scan passes through and the current action.
  const STAGES: { key: ScanPhase; label: string }[] = [
    { key: "detecting", label: "Rahmen" },
    { key: "analyzing", label: "Bildanalyse" },
    { key: "reading", label: "OCR" },
  ];
  const phaseOrder: Record<string, number> = { idle: -1, detecting: 0, analyzing: 1, reading: 2, done: 3 };
  const stageState = (key: ScanPhase) => {
    const order = phaseOrder[phase] - phaseOrder[key];
    return order > 0 ? "done" : order === 0 ? "active" : "todo";
  };
  const stageLabel =
    phase === "detecting" ? "Kartenrand erkennen"
    : phase === "analyzing" ? `Bild analysieren${analyzeProgress ? ` · ${Math.round(analyzeProgress * 100)}%` : " …"}`
    : phase === "reading" ? `Titel lesen (OCR) · ${Math.round(ocrProgress * 100)}%`
    : "";
  const stageFraction = phase === "reading" ? ocrProgress : phase === "analyzing" ? Math.max(0.12, analyzeProgress) : 0.08;

  return (
    <main className="screen scan-screen" data-scan-phase={phase}>
      <header className="topbar scan-topbar">
        <div>
          <p className="eyebrow">VISUELLE ERKENNUNG</p>
          <h1>Karte scannen</h1>
        </div>
        <span className={`index-pill ${indexStatus}`}><span />{indexStatus === "ready" ? `ALLE SETS · ${indexCount.toLocaleString("de-DE")}` : indexStatus === "loading" ? indexProgress : "Offline"}</span>
      </header>

      <section className={`viewfinder ${preview ? "has-preview" : ""} ${justFound ? "found" : ""} ${live ? "live" : ""}`}>
        {preview ? <img src={preview} alt="Aufgenommene Karte" /> : <div className="viewfinder-empty"><div className="card-ghost"><span /></div><p>Richte die Karte innerhalb<br />des Rahmens aus</p><small>Gleichmäßiges Licht liefert das beste Ergebnis</small></div>}
        {preview && overlay && (
          <svg className="scan-regions" viewBox={`0 0 ${overlay.width} ${overlay.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <polygon className="region-ocr" points={quadPoints(overlay.ocr)} />
            {overlay.perspective && <polygon className="region-perspective" points={quadPoints(overlay.perspective)} />}
            <polygon className="region-crop" pathLength={1} points={quadPoints(overlay.crop)} />
          </svg>
        )}
        <i className="corner corner-tl" /><i className="corner corner-tr" /><i className="corner corner-bl" /><i className="corner corner-br" />
        {isScanning && <div className="scan-overlay"><span className="scan-line" /></div>}
        {(isScanning || live) && (
          <div className="stage-hud">
            <div className="stage-steps">{STAGES.map((stage) => <span key={stage.key} className={`stage-step ${stageState(stage.key)}`}><i />{stage.label}</span>)}</div>
            <div className="stage-now"><span className="stage-spinner" />{stageLabel}</div>
            <div className="stage-bar"><i style={{ width: `${Math.round(stageFraction * 100)}%` }} /></div>
          </div>
        )}
        {!preview && <div className="hash-badge"><Icon name="bolt" size={14} /> pHash · lokal</div>}
        {preview && overlay && !isScanning && <div className="region-legend"><span className="lg-crop">Crop</span>{overlay.perspective && <span className="lg-perspective">Perspektive</span>}<span className="lg-ocr">OCR-Titel</span></div>}
      </section>

      <input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => handleFile(event.target.files?.[0])} />
      <input ref={galleryInput} className="visually-hidden" type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0])} />

      <div className="scan-side">
        {!bestMatch && !isScanning && (
          <section className="scan-actions">
            <button className="capture-button" disabled={indexStatus !== "ready"} onClick={() => cameraInput.current?.click()} aria-label="Karte fotografieren"><span><Icon name="camera" size={27} /></span></button>
            <button className="gallery-button" disabled={indexStatus !== "ready"} onClick={() => galleryInput.current?.click()}><Icon name="image" size={19} /> Foto wählen</button>
            {indexCount > 0 && <small className="demo-link">{setCount.toLocaleString("de-DE")} Sets lokal geroutet</small>}
          </section>
        )}

        {message && <div className="notice">{message}</div>}

        {bestMatch && !isScanning && (
          <section className={`match-panel flyout ${live ? "is-live" : ""}`}>
            <div className="match-heading">
              <div className={`success-icon ${live ? "pulsing" : ""}`}><Icon name={live ? "spark" : "check"} size={19} /></div>
              <div><p>{live ? "LIVE · VORLÄUFIG" : "ÜBEREINSTIMMUNG"}</p><h2>{live ? "Karte erkannt …" : "Karte erkannt"}</h2></div>
              {live && <span className="live-tag"><i />verfeinere</span>}
              <button className="icon-button" onClick={() => { setPreview(null); setMatches([]); setOverlay(null); setPhase("idle"); }}><Icon name="close" size={18} /></button>
            </div>
            <div className="match-card">
              <CardImage card={bestMatch.card} />
              <div className="match-copy">
                <div><h3>{bestMatch.card.name}</h3><ManaCost value={bestMatch.card.manaCost} /></div>
                <p>{bestMatch.card.setName}</p>
                <span>{bestMatch.card.setCode} · #{bestMatch.card.collectorNumber}</span>
                <div className="confidence"><span><i style={{ width: `${shownConfidence}%` }} /></span><strong>{shownConfidence}%</strong></div>
              </div>
            </div>
            <label className="foil-toggle"><span><strong>Foil-Version</strong><small>Als glänzende Karte speichern</small></span><input type="checkbox" checked={foil} onChange={(event) => setFoil(event.target.checked)} /><i /></label>
            <button className={`primary-button ${added ? "added" : ""}`} onClick={() => { onAdd(bestMatch.card, foil); setAdded(true); }}>{added ? <><Icon name="check" size={20} /> Hinzugefügt</> : <><Icon name="plus" size={20} /> Zur Sammlung</>}</button>
            {matches.length > 1 && <details className="alternatives"><summary>Andere mögliche Treffer</summary>{matches.slice(1).map((match) => <div key={match.card.id}><CardImage card={match.card} /><span>{match.card.name}<small>{Math.round(match.similarity * 100)}% ähnlich</small></span></div>)}</details>}
          </section>
        )}
      </div>
    </main>
  );
}

function CollectionScreen({ entries }: { entries: CollectionEntry[] }) {
  const [query, setQuery] = useState("");
  const filtered = entries.filter((entry) => `${entry.card.name} ${entry.card.setName}`.toLowerCase().includes(query.toLowerCase()));
  const colorCount = new Set(entries.flatMap((entry) => entry.card.colors)).size;

  return (
    <main className="screen collection-screen">
      <header className="topbar brand-topbar"><div className="brand-mark"><Icon name="search" size={19} /></div><div><p className="eyebrow">CARDLENS</p><h1>Meine Sammlung</h1></div><button className="avatar">OM</button></header>
      <section className="summary-card">
        <div className="summary-glow" />
        <p>SAMMLUNGSWERT</p>
        <h2>{formatCurrency(collectionValue(entries))}</h2>
        <div><span><strong>{totalCards(entries)}</strong>Karten</span><span><strong>{entries.length}</strong>Unikate</span><span><strong>{colorCount}</strong>Farben</span></div>
      </section>
      <label className="search-field"><Icon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sammlung durchsuchen" /></label>
      <div className="section-title"><div><p className="eyebrow">DEINE KARTEN</p><h2>{query ? `${filtered.length} Treffer` : "Zuletzt hinzugefügt"}</h2></div><button>Alle <Icon name="chevron" size={15} /></button></div>
      {filtered.length ? <section className="collection-list">{filtered.map((entry) => <article key={entry.card.id}><CardImage card={entry.card} /><div><div><h3>{entry.card.name}</h3><ManaCost value={entry.card.manaCost} /></div><p>{entry.card.setName}</p><small>{entry.card.setCode} · #{entry.card.collectorNumber}</small></div><aside><strong>×{entry.quantity + entry.foilQuantity}</strong><span>{formatCurrency((entry.card.priceEur ?? 0) * (entry.quantity + entry.foilQuantity))}</span>{entry.foilQuantity > 0 && <em>FOIL</em>}</aside></article>)}</section> : <section className="empty-state"><div><Icon name="cards" size={30} /></div><h3>{entries.length ? "Keine Karte gefunden" : "Noch ist dein Binder leer"}</h3><p>{entries.length ? "Probiere einen anderen Suchbegriff." : "Scanne deine erste Karte – das dauert nur einen Augenblick."}</p></section>}
    </main>
  );
}

function DecksScreen({ entries }: { entries: CollectionEntry[] }) {
  const colorGroups = useMemo(() => {
    const labels: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };
    return Object.entries(labels).map(([color, label]) => ({ color, label, count: entries.filter((entry) => entry.card.colors.includes(color)).reduce((sum, entry) => sum + entry.quantity + entry.foilQuantity, 0) }));
  }, [entries]);
  return <main className="screen decks-screen"><header className="topbar"><div><p className="eyebrow">SMART STACKS</p><h1>Deck-Werkstatt</h1></div><button className="round-button"><Icon name="plus" size={20} /></button></header><section className="deck-hero"><span><Icon name="layers" size={28} /></span><p>DECKBEREIT</p><h2>Deine Karten.<br />Neue Möglichkeiten.</h2><small>Stelle Decks direkt aus deiner Sammlung zusammen.</small><button>Neues Deck anlegen <Icon name="chevron" size={16} /></button></section><div className="section-title"><div><p className="eyebrow">FARBVERTEILUNG</p><h2>Dein Kartenpool</h2></div></div><section className="color-grid">{colorGroups.map((group) => <article key={group.color} className={`color-${group.color.toLowerCase()}`}><i>{group.color}</i><span><strong>{group.count}</strong>{group.label}</span></article>)}</section><section className="tip-card"><Icon name="spark" size={22} /><span><strong>Lens Tipp</strong><p>Scanne weitere Karten, um passende Deckvorschläge freizuschalten.</p></span></section></main>;
}

export function App() {
  const [activeTab, setActiveTab] = useState<"collection" | "scan" | "decks">("scan");
  const [indexCount, setIndexCount] = useState(0);
  const [setCount, setSetCount] = useState(0);
  const [indexStatus, setIndexStatus] = useState<"loading" | "ready" | "error">("loading");
  const [indexProgress, setIndexProgress] = useState("Index laden");
  const [collection, setCollection] = useState<CollectionEntry[]>(loadCollection);

  useEffect(() => {
    let active = true;
    void loadCardIndex((done, total) => active && setIndexProgress(`${done.toLocaleString("de-DE")}/${total.toLocaleString("de-DE")} Routing`))
      .then((summary) => { if (active) { setIndexCount(summary.cardCount); setSetCount(summary.setCount); setIndexStatus("ready"); } })
      .catch(() => { if (active) setIndexStatus("error"); });
    return () => { active = false; };
  }, []);

  useEffect(() => saveCollection(collection), [collection]);

  function handleAdd(card: CardRecord, foil: boolean) {
    setCollection((current) => addCard(current, card, foil));
  }

  return <div className="app-shell">
    {activeTab === "collection" && <CollectionScreen entries={collection} />}
    {activeTab === "scan" && <ScanScreen indexCount={indexCount} setCount={setCount} indexStatus={indexStatus} indexProgress={indexProgress} onAdd={handleAdd} />}
    {activeTab === "decks" && <DecksScreen entries={collection} />}
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <button className={activeTab === "collection" ? "active" : ""} onClick={() => setActiveTab("collection")}><Icon name="cards" /><span>Sammlung</span></button>
      <button className={`scan-nav ${activeTab === "scan" ? "active" : ""}`} onClick={() => setActiveTab("scan")}><i><Icon name="scan" size={25} /></i><span>Scannen</span></button>
      <button className={activeTab === "decks" ? "active" : ""} onClick={() => setActiveTab("decks")}><Icon name="layers" /><span>Decks</span></button>
    </nav>
  </div>;
}
