import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useEffect, useState } from "react";
import { CardChooser } from "./CardChooser";
import { listPrintings } from "../scanClient";
import type { CardRecord } from "../types";

/**
 * Pick any printing of a card.
 *
 * The scanner's own runners-up are only ever three, and the printing is the axis it is least sure
 * about — so a correction has to reach every printing of the card, not just the ones that happened
 * to rank. The list is fetched from the index on open (it needs the card's set shards, which are
 * usually already warm) rather than held in the staging entry, which keeps localStorage small.
 */
export function PrintingPicker({
  card,
  open,
  onClose,
  onSelect,
}: {
  card: CardRecord | null;
  open: boolean;
  onClose: () => void;
  onSelect: (card: CardRecord) => void;
}) {
  const [printings, setPrintings] = useState<CardRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const name = card?.name ?? null;

  useEffect(() => {
    if (!open || !name) return;
    let active = true;
    setPrintings(null);
    setFailed(false);
    void listPrintings(name)
      .then((result) => { if (active) setPrintings(result); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [open, name]);

  // The scanned printing may be missing from the index lookup (a card the user corrected to
  // something outside it), so it is merged in rather than assumed present — otherwise the dialog
  // would show no selection at all.
  const shown = card && printings
    ? printings.some((printing) => printing.id === card.id) ? printings : [card, ...printings]
    : [];

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Druck wählen</DialogTitle>
      <DialogBody>
        {card && (
          <>
            <Text className="mb-3">
              {printings === null && !failed
                ? `Drucke von ${card.name} werden geladen …`
                : `${shown.length} ${shown.length === 1 ? "Druck" : "Drucke"} von ${card.name}`}
            </Text>
            {failed && <Text>Die Drucke konnten nicht geladen werden.</Text>}
            <CardChooser
              cards={shown}
              selectedId={card.id}
              onSelect={onSelect}
              label={`Druck von ${card.name} wählen`}
              layout="grid"
            />
          </>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>Schließen</Button>
      </DialogActions>
    </Dialog>
  );
}
