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
    <main className="screen scope-screen">
      <header className="topbar brand-topbar">
        <div className="brand-mark"><Icon name="search" size={19} /></div>
        <div>
          <p className="eyebrow">CARDLENS</p>
          <h1>Was scannen wir?</h1>
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
          <section className="scope-choice">
            <button className="scope-card all" disabled={!ready} onClick={() => start([])}>
              <span className="scope-icon"><Icon name="layers" size={24} /></span>
              <strong>Alle Sets</strong>
              <small>{ready ? `${cardCount.toLocaleString("de-DE")} Karten` : progress}</small>
            </button>
            <button className="scope-card pick" disabled={!ready} onClick={() => setPickerOpen(true)}>
              <span className="scope-icon"><Icon name="search" size={24} /></span>
              <strong>Sets wählen</strong>
              <small>
                {codes.length > 0
                  ? `${codes.length} Sets · ${scopedCards.toLocaleString("de-DE")} Karten`
                  : "Auf ein Release eingrenzen"}
              </small>
            </button>
          </section>

          {codes.length > 0 && (
            <button className="scope-resume" disabled={!ready} onClick={() => start(codes)}>
              Weiter mit deiner Auswahl <Icon name="chevron" size={16} />
            </button>
          )}

          <section className="tip-card">
            <Icon name="spark" size={22} />
            <span>
              <strong>Weniger Sets, bessere Treffer</strong>
              <p>Grenzt du auf das Release ein, das du gerade sortierst, wird der Scan schneller und verwechselt keine Karten aus fremden Sets.</p>
            </span>
          </section>

          {status === "error" && <div className="notice">Der Referenzindex konnte nicht geladen werden.</div>}
        </>
      )}
    </main>
  );
}
