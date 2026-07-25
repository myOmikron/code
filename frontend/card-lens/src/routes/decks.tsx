import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Icon } from "../components/Icon";
import { useCollection } from "../context/collection-context";

export const Route = createFileRoute("/decks")({ component: DecksRoute });

function DecksRoute() {
  const { entries } = useCollection();
  const colorGroups = useMemo(() => {
    const labels: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };
    return Object.entries(labels).map(([color, label]) => ({ color, label, count: entries.filter((entry) => entry.card.colors.includes(color)).reduce((sum, entry) => sum + entry.quantity + entry.foilQuantity, 0) }));
  }, [entries]);
  return <main className="screen decks-screen"><header className="topbar"><div><p className="eyebrow">SMART STACKS</p><h1>Deck-Werkstatt</h1></div><button className="round-button"><Icon name="plus" size={20} /></button></header><section className="deck-hero"><span><Icon name="layers" size={28} /></span><p>DECKBEREIT</p><h2>Deine Karten.<br />Neue Möglichkeiten.</h2><small>Stelle Decks direkt aus deiner Sammlung zusammen.</small><button>Neues Deck anlegen <Icon name="chevron" size={16} /></button></section><div className="section-title"><div><p className="eyebrow">FARBVERTEILUNG</p><h2>Dein Kartenpool</h2></div></div><section className="color-grid">{colorGroups.map((group) => <article key={group.color} className={`color-${group.color.toLowerCase()}`}><i>{group.color}</i><span><strong>{group.count}</strong>{group.label}</span></article>)}</section><section className="tip-card"><Icon name="spark" size={22} /><span><strong>Lens Tipp</strong><p>Scanne weitere Karten, um passende Deckvorschläge freizuschalten.</p></span></section></main>;
}
