import clsx from "clsx";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Field,
    FieldGroup,
    Input,
    Label,
    Switch,
    SwitchField,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import { COLOR_LETTERS, deckRuleZero, letters, ruleZeroSave } from "src/utils/deck-rules";

/**
 * The properties for {@link DeckRuleZeroDialog}
 */
export type DeckRuleZeroDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The deck the table agreed about */
    deck: DeckResponse;
    /**
     * The colours the deck may play today.
     *
     * The commander's while it decides, the claim otherwise — which is exactly
     * what the picker starts from.
     */
    colors: Array<string>;
    /** How many cards the format asks for, `null` when it names no number */
    formatSize: number | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after something was written */
    onSaved: () => void | Promise<void>;
};

/**
 * What the table agreed this deck is played under.
 *
 * Five deviations from the format, edited as the one conversation they were:
 * nothing here blocks anything, it only decides which remarks the deck earns.
 * The colours are among them — they predate the rest and keep their own
 * endpoint, but a claimed identity is a house rule like any other and asking
 * about it in a second dialog would have been asking twice.
 *
 * @returns the dialog
 */
export function DeckRuleZeroDialog({ open, deck, colors, formatSize, onClose, onSaved }: DeckRuleZeroDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();

    const ruleZero = deckRuleZero(deck);
    const [follow, setFollow] = useState(deck.allowed_color_identity == null);
    const [picked, setPicked] = useState<Array<string>>(colors);
    const [extraCommanders, setExtraCommanders] = useState(ruleZero.extraCommanders);
    const [duplicates, setDuplicates] = useState(ruleZero.duplicates);
    const [banned, setBanned] = useState(ruleZero.banned);
    const [deckSize, setDeckSize] = useState(ruleZero.deckSize === null ? "" : String(ruleZero.deckSize));
    const [touched, setTouched] = useState(false);
    const [busy, setBusy] = useState(false);

    // The dialog stays mounted, so it has to be pointed at whatever it was
    // opened on — and at whatever the last save turned the deck into.
    useEffect(() => {
        setFollow(deck.allowed_color_identity == null);
        setPicked(colors);
        setTouched(false);
        setExtraCommanders(deck.allow_extra_commanders);
        setDuplicates(deck.allow_duplicates);
        setBanned(deck.allow_banned);
        setDeckSize(deck.deck_size == null ? "" : String(deck.deck_size));
        // Deliberately not keyed on `colors`, which is a fresh array every render.
    }, [deck, open]);

    // A caller that only learns the commander's colours after opening (the
    // layout fetches them on demand) still gets them preselected — but only
    // until the first click on the picker, so a slow answer never overwrites
    // a choice already made.
    const seed = colors.join("");
    useEffect(() => {
        if (!touched) setPicked(letters(seed));
    }, [seed, touched]);

    /**
     * Writes the halves of the form that moved, and nothing else
     */
    async function save() {
        setBusy(true);
        try {
            const change = ruleZeroSave(deck, {
                follow,
                colors: picked,
                extraCommanders,
                duplicates,
                banned,
                deckSize,
            });
            if (change.colors !== undefined) await Api.decks.setColors(deck.uuid, change.colors);
            if (change.rules !== undefined) await Api.decks.setRuleZero(deck.uuid, change.rules);
            notify.success(t("toast.rule-zero-saved"));
            onClose();
            await onSaved();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.rule-zero")}</DialogTitle>
            <DialogDescription>{t("description.rule-zero")}</DialogDescription>
            <DialogBody>
                <FieldGroup>
                    <div className={"flex flex-col gap-3"}>
                        <SwitchField>
                            <Label>{t("label.colors-follow-commander")}</Label>
                            <Description>{t("description.rule-zero-colors")}</Description>
                            <Switch color={"blue"} checked={follow} onChange={setFollow} />
                        </SwitchField>
                        <div
                            role={"group"}
                            aria-label={t("heading.colors")}
                            className={"flex flex-wrap items-center gap-1"}
                        >
                            {COLOR_LETTERS.map((color) => {
                                const on = picked.includes(color);
                                return (
                                    <button
                                        key={color}
                                        type={"button"}
                                        disabled={follow}
                                        aria-pressed={on}
                                        aria-label={labels.color(color)}
                                        title={labels.color(color)}
                                        onClick={() => {
                                            setTouched(true);
                                            setPicked((previous) =>
                                                previous.includes(color)
                                                    ? previous.filter((letter) => letter !== color)
                                                    : COLOR_LETTERS.filter(
                                                          (letter) => previous.includes(letter) || letter === color,
                                                      ),
                                            );
                                        }}
                                        className={clsx(
                                            "relative rounded-(--radius-control) p-1.5 transition",
                                            follow
                                                ? "cursor-not-allowed"
                                                : "hover:bg-zinc-950/5 dark:hover:bg-white/10",
                                        )}
                                    >
                                        <ManaCost
                                            value={`{${color}}`}
                                            symbolClassName={on ? "size-5" : "size-5 opacity-40 grayscale"}
                                        />
                                        {/* Struck through as well as greyed out: a
                                            colour that is only paler than the one
                                            beside it is a difference nobody reading
                                            in greyscale, or with a screen in the
                                            sun, can be asked to see. */}
                                        {!on && (
                                            <span
                                                aria-hidden={"true"}
                                                className={
                                                    "pointer-events-none absolute inset-0 flex items-center justify-center"
                                                }
                                            >
                                                <span
                                                    className={
                                                        "h-0.5 w-6 -rotate-45 rounded-full bg-zinc-600 dark:bg-zinc-300"
                                                    }
                                                />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <SwitchField>
                        <Label>{t("label.rule-zero-extra-commanders")}</Label>
                        <Description>{t("description.rule-zero-commanders")}</Description>
                        <Switch color={"blue"} checked={extraCommanders} onChange={setExtraCommanders} />
                    </SwitchField>

                    <SwitchField>
                        <Label>{t("label.rule-zero-duplicates")}</Label>
                        <Description>{t("description.rule-zero-duplicates")}</Description>
                        <Switch color={"blue"} checked={duplicates} onChange={setDuplicates} />
                    </SwitchField>

                    <Field>
                        <Label>{t("label.rule-zero-deck-size")}</Label>
                        <Description>{t("description.rule-zero-deck-size")}</Description>
                        <Input
                            type={"number"}
                            min={1}
                            value={deckSize}
                            placeholder={formatSize === null ? undefined : String(formatSize)}
                            onChange={(event) => setDeckSize(event.target.value)}
                        />
                    </Field>

                    <SwitchField>
                        <Label>{t("label.rule-zero-banned")}</Label>
                        <Description>{t("description.rule-zero-banned")}</Description>
                        <Switch color={"blue"} checked={banned} onChange={setBanned} />
                    </SwitchField>
                </FieldGroup>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button disabled={busy} onClick={() => void save()}>
                    {t("button.save-rule-zero")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
