import { ArrowPathIcon, ArrowUpTrayIcon, ChevronLeftIcon, TrashIcon } from "@heroicons/react/24/outline";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
  EmptyState,
  HeadingLayout,
  StackedList,
  StackedListFlexRow,
  Strong,
  Text,
} from "components";
import { useMemo, useState } from "react";
import { CardChooser } from "../components/CardChooser";
import { CardImage } from "../components/CardImage";
import { usePendingScans } from "../context/pending-scans-context";
import { groupPendingScans, pendingValue } from "../pendingScans";
import { formatCurrency } from "../utils/format";

export const Route = createFileRoute("/liste")({ component: PendingListRoute });

/** Review of everything the scanner has staged. This is the hand-off point: the list lives in
 *  localStorage today and is meant to be pushed to a backend later, which is why entries are kept
 *  individually — sending can then acknowledge and drop exactly what the server accepted. */
function PendingListRoute() {
  const navigate = useNavigate();
  const { scans, remove, replaceCard, clear } = usePendingScans();
  // Which entry is being corrected. Groups share a card, so correcting one corrects that copy —
  // the id is what makes "this one" unambiguous.
  const [correcting, setCorrecting] = useState<string | null>(null);
  const correctingScan = scans.find((scan) => scan.id === correcting) ?? null;

  const groups = useMemo(() => groupPendingScans(scans), [scans]);
  const alternativesById = useMemo(
    () => new Map(scans.map((scan) => [scan.id, scan.alternatives])),
    [scans],
  );
  const value = useMemo(() => pendingValue(scans), [scans]);

  return (
    <main className="min-h-svh px-5 py-8 lg:mx-auto lg:max-w-[880px] lg:px-12 lg:py-10">
      <HeadingLayout
        heading="Gescannte Karten"
        headingDescription={
          scans.length > 0
            ? `${scans.length} ${scans.length === 1 ? "Karte" : "Karten"} · ${formatCurrency(value)}`
            : undefined
        }
        headingChildren={
          <Button plain onClick={() => void navigate({ to: "/scan" })}>
            <ChevronLeftIcon className="size-4" /> Scannen
          </Button>
        }
      >
        {scans.length === 0 ? (
          <EmptyState
            className="mt-6"
            title="Noch nichts gescannt"
            description="Erkannte Karten sammeln sich hier, bis du sie weitergibst."
            action={<Button color="lime" onClick={() => void navigate({ to: "/scan" })}>Scannen starten</Button>}
          />
        ) : (
          <>
            <StackedList className="mt-6">
              {groups.map((group) => (
                <StackedListFlexRow key={`${group.card.id}-${group.foil}`} className="gap-3">
                  <CardImage card={group.card} className="h-[67px] w-12 shrink-0 rounded-[5px]" />
                  <div className="min-w-0 flex-1">
                    <Strong className="block truncate">{group.card.name}</Strong>
                    <Text className="truncate">{group.card.setName}</Text>
                    <Text className="truncate">{group.card.setCode} · #{group.card.collectorNumber}</Text>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {group.foil && <Badge color="purple">FOIL</Badge>}
                    <Badge>×{group.ids.length}</Badge>
                    {(alternativesById.get(group.ids[0])?.length ?? 0) > 0 && (
                      <Button plain aria-label={`${group.card.name} austauschen`} onClick={() => setCorrecting(group.ids[0])}>
                        <ArrowPathIcon className="size-4" />
                      </Button>
                    )}
                    {/* Removes one copy, which is why the group keeps its member ids. */}
                    <Button plain aria-label={`Eine Kopie von ${group.card.name} entfernen`} onClick={() => remove(group.ids[0])}>
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                </StackedListFlexRow>
              ))}
            </StackedList>

            <div className="mt-6 flex items-center gap-2">
              {/* No backend is wired up yet — see sendPendingScans in this file's sibling note.
                  The affordance is here so the shape of the hand-off is visible, but it must not
                  pretend to have sent anything. */}
              <Button color="lime" disabled title="Noch kein Backend verbunden">
                <ArrowUpTrayIcon className="size-4" /> Ans Backend senden
              </Button>
              <Button plain onClick={clear}>Liste leeren</Button>
            </div>
            <Text className="mt-2">Die Liste liegt auf diesem Gerät. Das Senden ans Backend ist noch nicht angebunden.</Text>
          </>
        )}
      </HeadingLayout>

      <Dialog open={correctingScan !== null} onClose={() => setCorrecting(null)} size="xl">
        <DialogTitle>Karte austauschen</DialogTitle>
        <DialogBody>
          {correctingScan && (
            <>
              <Text className="mb-3">Die Erkennung liegt oft richtig bei der Karte und daneben beim Druck. Wähle den richtigen aus.</Text>
              <CardChooser
                cards={[correctingScan.card, ...correctingScan.alternatives]}
                selectedId={correctingScan.card.id}
                onSelect={(card) => { replaceCard(correctingScan.id, card); setCorrecting(null); }}
                label="Richtige Karte wählen"
              />
            </>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setCorrecting(null)}>Schließen</Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
