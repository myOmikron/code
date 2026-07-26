import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Icon } from "../components/Icon";
import { useCollection } from "../context/collection-context";

export const Route = createFileRoute("/decks")({ component: DecksRoute });

// Tailwind resolves class names statically, so the pip colour per mana colour is a lookup of
// complete class strings rather than an interpolated `color-${group.color}`.
const PIP_COLOURS: Record<string, string> = {
  W: "bg-[#d8d7c4]",
  U: "bg-[#8ec8e6]",
  B: "bg-[#99958e]",
  R: "bg-[#e98c6a]",
  G: "bg-[#80b78a]",
};

function DecksRoute() {
  const { entries } = useCollection();
  const colorGroups = useMemo(() => {
    const labels: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };
    return Object.entries(labels).map(([color, label]) => ({
      color,
      label,
      count: entries
        .filter((entry) => entry.card.colors.includes(color))
        .reduce((sum, entry) => sum + entry.quantity + entry.foilQuantity, 0),
    }));
  }, [entries]);

  return (
    <main className="min-h-svh px-5 pt-[max(22px,env(safe-area-inset-top))] pb-[calc(110px+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-[880px] lg:px-12 lg:py-10">
      <header className="mb-6 flex min-h-[52px] items-center justify-between">
        <div>
          <p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">SMART STACKS</p>
          <h1 className="mt-0.5 mb-0 text-[25px] leading-[1.1] tracking-[-0.65px] lg:text-[30px] font-bold">Deck-Werkstatt</h1>
        </div>
        <button className="grid size-[38px] place-items-center rounded-full border border-acid/20 bg-acid/7 text-acid"><Icon name="plus" size={20} /></button>
      </header>

      <section className="relative overflow-hidden rounded-[23px] border border-acid/13 bg-[radial-gradient(circle_at_90%_20%,rgba(213,254,82,.12),transparent_30%),linear-gradient(140deg,#24291d,#171915)] px-6 pt-7 pb-[23px]">
        <span className="mb-[21px] grid size-[50px] -rotate-3 place-items-center rounded-[15px] bg-acid text-[#161810]"><Icon name="layers" size={28} /></span>
        <p className="mt-0 mb-1.5 text-[9px] font-extrabold tracking-[1.5px] text-acid">DECKBEREIT</p>
        <h2 className="mt-0 mb-[9px] text-[25px] leading-[1.15] tracking-[-0.7px] font-bold">Deine Karten.<br />Neue Möglichkeiten.</h2>
        <small className="block max-w-[270px] text-[10px] leading-[1.5] text-[#858a7e]">Stelle Decks direkt aus deiner Sammlung zusammen.</small>
        <button className="mt-[22px] flex items-center gap-[5px] rounded-[9px] bg-acid px-[13px] py-2.5 text-[10px] font-extrabold text-[#171910]">
          Neues Deck anlegen <Icon name="chevron" size={16} />
        </button>
      </section>

      <div className="mx-0.5 mt-[25px] mb-3 flex items-end justify-between">
        <div>
          <p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">FARBVERTEILUNG</p>
          <h2 className="mt-[3px] mb-0 text-[17px] tracking-[-0.25px] font-bold">Dein Kartenpool</h2>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2">
        {colorGroups.map((group) => (
          <article key={group.color} className="flex items-center gap-[11px] rounded-[13px] border border-line bg-[#191b17] p-[13px] last:col-span-full">
            <i className={`grid size-[31px] place-items-center rounded-full font-serif text-[13px] font-black text-[#191a17] not-italic ${PIP_COLOURS[group.color]}`}>{group.color}</i>
            <span className="flex flex-col text-[9px] text-[#757a6f]">
              <strong className="text-sm text-[#e8eae3]">{group.count}</strong>
              {group.label}
            </span>
          </article>
        ))}
      </section>

      <section className="mt-5 flex gap-3 rounded-[14px] border border-acid/10 bg-acid/5 p-[15px] text-acid">
        <Icon name="spark" size={22} />
        <span className="text-[#d9ddd1]">
          <strong className="text-[10px]">Lens Tipp</strong>
          <p className="mt-[3px] mb-0 text-[9px] leading-[1.45] text-[#7d8375]">Scanne weitere Karten, um passende Deckvorschläge freizuschalten.</p>
        </span>
      </section>
    </main>
  );
}
