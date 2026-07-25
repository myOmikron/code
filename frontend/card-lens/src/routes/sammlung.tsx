import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CardImage } from "../components/CardImage";
import { Icon } from "../components/Icon";
import { ManaCost } from "../components/ManaCost";
import { useCollection } from "../context/collection-context";
import { collectionValue, totalCards } from "../collectionStore";
import { formatCurrency } from "../utils/format";

export const Route = createFileRoute("/sammlung")({ component: CollectionRoute });

function CollectionRoute() {
  const { entries } = useCollection();
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
