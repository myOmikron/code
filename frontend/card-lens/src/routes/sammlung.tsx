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
    <main className="min-h-svh bg-[linear-gradient(160deg,#161813_0,#10110f_45%)] px-5 pt-[max(22px,env(safe-area-inset-top))] pb-[calc(110px+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-[880px] lg:px-12 lg:py-10">
      <header className="mb-6 flex min-h-[52px] items-center justify-start gap-[11px]">
        <div className="grid size-[38px] place-items-center rounded-[11px] border border-acid/30 bg-acid/5 text-acid"><Icon name="search" size={19} /></div>
        <div>
          <p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">CARDLENS</p>
          <h1 className="mt-0.5 mb-0 text-[25px] leading-[1.1] tracking-[-0.65px] lg:text-[30px] font-bold">Meine Sammlung</h1>
        </div>
        <button className="ml-auto size-9 rounded-full border border-line bg-[#292c25] text-[11px] font-extrabold text-[#dfe2d8]">OM</button>
      </header>

      <section className="relative mb-[18px] overflow-hidden rounded-[20px] border border-acid/15 bg-[linear-gradient(120deg,#292e20,#191c16_68%)] px-5 pt-[21px] pb-[17px] after:absolute after:-top-[30px] after:-right-[25px] after:size-[120px] after:rounded-full after:border-[26px] after:border-acid/4 after:content-['']">
        <div className="absolute -bottom-[60px] left-[5%] h-[90px] w-[200px] rounded-full bg-acid/10 blur-[35px]" />
        <p className="mt-0 mb-[7px] text-[9px] font-extrabold tracking-[1.4px] text-[#8f977e]">SAMMLUNGSWERT</p>
        <h2 className="mt-0 mb-[19px] text-[32px] tracking-[-1.2px] font-bold">{formatCurrency(collectionValue(entries))}</h2>
        <div className="flex gap-7">
          {[
            { value: totalCards(entries), label: "Karten" },
            { value: entries.length, label: "Unikate" },
            { value: colorCount, label: "Farben" },
          ].map((stat) => (
            <span key={stat.label} className="flex flex-col text-[9px] text-[#777d6d]">
              <strong className="mb-0.5 text-[13px] text-[#dfe1d9]">{stat.value}</strong>
              {stat.label}
            </span>
          ))}
        </div>
      </section>

      <label className="flex items-center gap-[9px] rounded-xl border border-line bg-[#191b17] px-[13px] py-[11px] text-[#777d71]">
        <Icon name="search" size={19} />
        <input
          className="w-full border-0 bg-transparent text-xs text-[#eef0e9] outline-0 placeholder:text-[#686d62]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sammlung durchsuchen"
        />
      </label>

      <div className="mx-0.5 mt-[25px] mb-3 flex items-end justify-between">
        <div>
          <p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">DEINE KARTEN</p>
          <h2 className="mt-[3px] mb-0 text-[17px] tracking-[-0.25px] font-bold">{query ? `${filtered.length} Treffer` : "Zuletzt hinzugefügt"}</h2>
        </div>
        <button className="flex items-center gap-0.5 text-[10px] text-[#8c9285]">Alle <Icon name="chevron" size={15} /></button>
      </div>

      {filtered.length ? (
        <section className="flex flex-col gap-[9px]">
          {filtered.map((entry) => (
            <article key={entry.card.id} className="flex min-w-0 gap-3 rounded-[14px] border border-line bg-panel p-2.5">
              <CardImage card={entry.card} className="h-[67px] w-12 shrink-0 rounded-[5px]" />
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex items-start justify-between gap-[5px]">
                  <h3 className="m-0 truncate text-xs font-bold">{entry.card.name}</h3>
                  <ManaCost value={entry.card.manaCost} />
                </div>
                <p className="mt-[7px] mb-[3px] text-[9px] text-[#9aa092]">{entry.card.setName}</p>
                <small className="text-[8px] text-[#656a5f]">{entry.card.setCode} · #{entry.card.collectorNumber}</small>
              </div>
              <aside className="flex flex-col items-end px-0.5 py-1">
                <strong className="text-xs">×{entry.quantity + entry.foilQuantity}</strong>
                <span className="mt-auto text-[9px] text-acid">{formatCurrency((entry.card.priceEur ?? 0) * (entry.quantity + entry.foilQuantity))}</span>
                {entry.foilQuantity > 0 && <em className="mt-[3px] text-[7px] font-black text-foil not-italic">FOIL</em>}
              </aside>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-[18px] border border-dashed border-white/11 px-7 py-[43px] text-center">
          <div className="mx-auto grid size-[55px] -rotate-3 place-items-center rounded-[17px] bg-[#20231c] text-[#7f8674]"><Icon name="cards" size={30} /></div>
          <h3 className="mt-[18px] mb-[7px] text-sm font-bold">{entries.length ? "Keine Karte gefunden" : "Noch ist dein Binder leer"}</h3>
          <p className="m-0 text-[10px] leading-[1.5] text-[#777c71]">{entries.length ? "Probiere einen anderen Suchbegriff." : "Scanne deine erste Karte – das dauert nur einen Augenblick."}</p>
        </section>
      )}
    </main>
  );
}
