import { ChevronRightIcon, MagnifyingGlassIcon, Square3Stack3DIcon } from "@heroicons/react/24/outline";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle, Button, HeadingLayout, Text } from "components";
import { useMemo, useState } from "react";
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
    <main className="min-h-svh px-5 py-8 lg:mx-auto lg:max-w-[880px] lg:px-12 lg:py-10">
      <HeadingLayout
        heading="Was scannen wir?"
        headingDescription="Grenzt du auf das Release ein, das du gerade sortierst, wird der Scan schneller und verwechselt keine Karten aus fremden Sets."
      >
        {/* The count belongs beside the button, not inside it: a Button fills with its colour,
            and Text's muted grey is unreadable on the lime fill. */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Button color="lime" className="w-full" disabled={!ready} onClick={() => start([])}>
              <Square3Stack3DIcon className="size-5" />
              Alle Sets
            </Button>
            <Text className="text-center">{ready ? `${cardCount.toLocaleString("de-DE")} Karten` : progress}</Text>
          </div>
          <div className="flex flex-col gap-2">
            <Button outline className="w-full" disabled={!ready} onClick={() => setPickerOpen(true)}>
              <MagnifyingGlassIcon className="size-5" />
              Sets wählen
            </Button>
            <Text className="text-center">
              {codes.length > 0
                ? `${codes.length} Sets · ${scopedCards.toLocaleString("de-DE")} Karten`
                : "Auf ein Release eingrenzen"}
            </Text>
          </div>
        </div>

        {codes.length > 0 && (
          <Button outline className="mt-4 w-full" disabled={!ready} onClick={() => start(codes)}>
            Weiter mit deiner Auswahl <ChevronRightIcon className="size-4" />
          </Button>
        )}

        {status === "error" && (
          <Alert open onClose={() => undefined} className="mt-6">
            <AlertTitle>Referenzindex nicht geladen</AlertTitle>
            <AlertDescription>Der Kartenindex konnte nicht geladen werden. Prüfe die Verbindung und lade die Seite neu.</AlertDescription>
          </Alert>
        )}
      </HeadingLayout>

      <SetPicker
        open={pickerOpen}
        sets={sets}
        initialSelection={codes}
        onCancel={() => setPickerOpen(false)}
        onConfirm={start}
      />
    </main>
  );
}
