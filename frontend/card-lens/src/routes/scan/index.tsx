import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { SetPicker } from "../../components/SetPicker";
import { useCardIndex } from "../../context/card-index-context";
import { useScanScope } from "../../context/scan-scope-context";

export const Route = createFileRoute("/scan/")({ component: ScanScopeRoute });

/** Step one of scanning: decide what the scanner searches, before the camera opens. Narrowing to
 *  the releases actually being sorted is not just tidier — routes outside the selection are never
 *  scored, which is both faster and removes a whole class of wrong matches. */
function ScanScopeRoute() {
  const navigate = useNavigate();
  const { status, progress, cardCount, sets } = useCardIndex();
  const { codes, choose } = useScanScope();
  const [pickerOpen, setPickerOpen] = useState(false);

  const ready = status === "ready";
  const scopedCards = useMemo(() => {
    if (codes.length === 0) return cardCount;
    const chosen = new Set(codes.map((code) => code.toUpperCase()));
    return sets.reduce((sum, set) => sum + (chosen.has(set.code.toUpperCase()) ? set.cardCount : 0), 0);
  }, [codes, sets, cardCount]);

  function start(next: string[]) {
    choose(next);
    void navigate({ to: "/scan/live" });
  }

  return (
    <main className="min-h-svh bg-gradient-to-b from-[#141612] to-[#10110f] to-52% px-5 pt-[max(22px,env(safe-area-inset-top))] pb-[calc(110px+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-[880px] lg:px-12 lg:py-10">
      <header className="mb-6 flex min-h-[52px] items-center justify-start gap-[11px]">
        <div className="grid size-[38px] place-items-center rounded-[11px] border border-acid/30 bg-acid/5 text-acid"><Icon name="search" size={19} /></div>
        <div>
          <p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">CARDLENS</p>
          <h1 className="mt-0.5 mb-0 text-[25px] leading-[1.1] tracking-[-0.65px] lg:text-[30px] font-bold">Was scannen wir?</h1>
        </div>
      </header>

      {pickerOpen ? (
        <SetPicker
          sets={sets}
          initialSelection={codes}
          onCancel={() => setPickerOpen(false)}
          onConfirm={start}
        />
      ) : (
        <>
          <section className="mb-3.5 grid grid-cols-2 gap-3">
            <button className="flex cursor-pointer flex-col items-start gap-1 rounded-[20px] border border-acid/30 bg-acid/7 px-4 py-5 text-left text-[#e9ece3] transition-colors hover:border-acid/35 hover:bg-acid/5 disabled:cursor-not-allowed disabled:opacity-45" disabled={!ready} onClick={() => start([])}>
              <span className="mb-2 grid size-11 place-items-center rounded-[14px] bg-acid/15 text-acid"><Icon name="layers" size={24} /></span>
              <strong className="text-[15px] font-bold text-acid">Alle Sets</strong>
              <small className="text-[11px] text-muted">{ready ? `${cardCount.toLocaleString("de-DE")} Karten` : progress}</small>
            </button>
            <button className="flex cursor-pointer flex-col items-start gap-1 rounded-[20px] border border-line bg-white/3 px-4 py-5 text-left text-[#e9ece3] transition-colors hover:border-acid/35 hover:bg-acid/5 disabled:cursor-not-allowed disabled:opacity-45" disabled={!ready} onClick={() => setPickerOpen(true)}>
              <span className="mb-2 grid size-11 place-items-center rounded-[14px] bg-white/5 text-[#cfd4c4]"><Icon name="search" size={24} /></span>
              <strong className="text-[15px] font-bold">Sets wählen</strong>
              <small className="text-[11px] text-muted">
                {codes.length > 0
                  ? `${codes.length} Sets · ${scopedCards.toLocaleString("de-DE")} Karten`
                  : "Auf ein Release eingrenzen"}
              </small>
            </button>
          </section>

          {codes.length > 0 && (
            <button className="mb-4 w-full rounded-2xl border border-line p-[13px] text-[13px] text-[#d3d8ca] disabled:cursor-not-allowed disabled:opacity-45" disabled={!ready} onClick={() => start(codes)}>
              Weiter mit deiner Auswahl <Icon name="chevron" size={16} />
            </button>
          )}

          <section className="mt-5 flex gap-3 rounded-[14px] border border-acid/10 bg-acid/5 p-[15px] text-acid">
            <Icon name="spark" size={22} />
            <span className="text-[#d9ddd1]">
              <strong className="text-[10px]">Weniger Sets, bessere Treffer</strong>
              <p className="mt-[3px] mb-0 text-[9px] leading-[1.45] text-[#7d8375]">Grenzt du auf das Release ein, das du gerade sortierst, wird der Scan schneller und verwechselt keine Karten aus fremden Sets.</p>
            </span>
          </section>

          {status === "error" && <div className="mx-1 my-3.5 rounded-xl border border-warn/20 bg-warn/7 px-3.5 py-3 text-[11px] text-[#e7a69f]">Der Referenzindex konnte nicht geladen werden.</div>}
        </>
      )}
    </main>
  );
}
