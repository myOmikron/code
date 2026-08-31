import {
    DocumentDuplicateIcon,
    FunnelIcon,
    NoSymbolIcon,
    RectangleStackIcon,
    ScaleIcon,
    ShieldCheckIcon,
    SwatchIcon,
    UserGroupIcon,
    XMarkIcon,
} from "@heroicons/react/16/solid";
import { CheckCircleIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import clsx from "clsx";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BracketRulesResponse, CardFinish } from "src/api/generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { DeckAdvisorPool } from "src/components/deck-advisor-pool";
import { DeckAdvisorSetup, shapeChoiceFor } from "src/components/deck-advisor-setup";
import { ManaCost } from "src/components/mana-cost";
import { useDeckLabels } from "src/components/deck-labels";
import { AdvisorSettings, IgnoredCard, KeptCard } from "src/utils/advisor-settings";
import type { HouseRule } from "src/utils/deck-rules";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/**
 * The properties for {@link DeckAdvisorAssumptions}
 */
export type DeckAdvisorAssumptionsProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away */
    onClose: () => void;
    /** The bracket the advice is graded at, 1 to 5 */
    bracket: number;
    /** Whether the deck claims that bracket itself, or is being held to a guess */
    claimed: boolean;
    /** The five brackets as the server defines them, for their names and rules */
    brackets: Array<BracketRulesResponse>;
    /** The agreed deviations from the format that are actually in effect */
    houseRules: Array<HouseRule>;
    /** The pool restriction in force, or null while the whole pool is searched */
    poolQuery: string | null;
    /** Applies a pool restriction, or clears it with null */
    onApplyPool: (query: string | null) => void;
    /** The cards the advisor must never suggest for this deck */
    ignored: Array<IgnoredCard>;
    /** Lets one ignored card back in */
    onUnignore: (card: IgnoredCard) => void;
    /** The cards the advisor must stop proposing as cuts */
    kept: Array<KeptCard>;
    /** Lets one kept card back onto the cut table */
    onUnkeep: (card: KeptCard) => void;
    /** What is in force right now, for the "Plays" and "Form" readouts and for a re-run of the setup */
    settings: AdvisorSettings;
    /** Replaces the whole settings document, from a re-run of the setup */
    onSaveSettings: (next: AdvisorSettings) => void;
    /** Claims a bracket for the deck itself, from a re-run of the setup */
    onSaveBracket: (bracket: number | null) => void;
    /** Theme id to card count, from the live analysis when there is one — a re-run's step 1 reference */
    detected: Record<string, number>;
};

/** Which icon stands for which agreement, so a rule is recognised before it is read */
const RULE_ICONS: Record<HouseRule["kind"], ComponentType<{ className?: string }>> = {
    colors: SwatchIcon,
    commanders: UserGroupIcon,
    duplicates: DocumentDuplicateIcon,
    banned: NoSymbolIcon,
    "deck-size": RectangleStackIcon,
};

/**
 * The colour identity as mana symbols.
 *
 * A claim of no colours at all is still a claim, so it is drawn as colourless
 * rather than as an empty space — the same way the picker that sets it spells
 * it.
 *
 * @param colors the letters the deck claims
 *
 * @returns the symbols, for {@link ManaCost}
 */
function pips(colors: string): string {
    return colors === "" ? "{C}" : [...colors].map((letter) => `{${letter}}`).join("");
}

/**
 * Everything the advice is standing on, in one place.
 *
 * These four things — the bracket, what the table agreed to, the pool the
 * suggestions are drawn from, and the cards ruled out — used to be two
 * banners, a chip and a search box stacked above the panels, and between them
 * they took the top third of the page. Almost nobody touches any of them: a
 * deck is played by the book, at its own bracket, out of the whole card pool,
 * having turned nothing down.
 *
 * Each section is shaped like the thing it describes rather than written out
 * as another paragraph: the bracket is a five-step ladder because that is
 * what a bracket is, the pool is its own query box, and the cards ruled out
 * are their own artwork. Three sections of prose under three headings is what
 * this looked like before, and it read as a page of small print — which is
 * how small print gets skipped.
 *
 * @returns the dialog
 */
export function DeckAdvisorAssumptions({
    open,
    onClose,
    bracket,
    claimed,
    brackets,
    houseRules,
    poolQuery,
    onApplyPool,
    ignored,
    onUnignore,
    kept,
    onUnkeep,
    settings,
    onSaveSettings,
    onSaveBracket,
    detected,
}: DeckAdvisorAssumptionsProps) {
    const [t] = useTranslation("advisor");
    const labels = useDeckLabels();
    const [rerunning, setRerunning] = useState(false);

    // Artwork for the cards that were turned down. A name in a list is a
    // string; a card is a picture, and recognising one at a glance is the
    // whole reason this section exists — "did I really hide that?".
    //
    // Only while the dialog is up: the page below it holds an ignore list for
    // the whole session, and resolving artwork nobody has asked to see is a
    // round trip for a closed dialog.
    const { cards } = useSuggestionCards(open ? [...ignored, ...kept].map((card) => card.name) : []);

    const rules = brackets.find((entry) => entry.number === bracket);
    const shapeLabels: Record<ReturnType<typeof shapeChoiceFor>, string> = {
        fast: t("label.setup-shape-fast"),
        balanced: t("label.setup-shape-balanced"),
        big: t("label.setup-shape-big"),
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} size={"2xl"}>
                <DialogTitle className={"flex items-center gap-3"}>
                    <span className={"min-w-0 flex-1"}>{t("heading.assumptions")}</span>
                    <Button
                        plain
                        onClick={onClose}
                        aria-label={t("button.assumptions-done")}
                        className={"-mr-2 shrink-0"}
                    >
                        <XMarkIcon className={"size-5"} />
                    </Button>
                </DialogTitle>
                {/* No inner scroll: the dialog's own backdrop scrolls, and a
                second scrollbar inside it meant two things to drag and a
                horizontal bar wherever a child reached past the edge. */}
                <DialogBody>
                    <div className={"flex flex-col gap-6"}>
                        <Section icon={ScaleIcon} title={t("heading.read-against")}>
                            {/* The bracket as the five-step scale it is: where this
                            deck sits, and what the neighbouring steps are. A
                            number in a sentence made the reader remember the
                            scale; the scale is right here. */}
                            <ol className={"flex gap-1"}>
                                {brackets.map((step) => {
                                    const here = step.number === bracket;
                                    return (
                                        <li key={step.number} className={"min-w-0 flex-1"}>
                                            <div
                                                aria-current={here ? "step" : undefined}
                                                className={clsx(
                                                    "flex flex-col gap-0.5 rounded-(--radius-control) px-2 py-1.5 text-center transition",
                                                    here
                                                        ? "bg-(--color-accent)/10 ring-1 ring-(--color-accent)/40"
                                                        : "bg-zinc-950/[0.03] dark:bg-white/[0.04]",
                                                )}
                                            >
                                                <span
                                                    className={clsx(
                                                        "text-sm/5 font-semibold tabular-nums",
                                                        here
                                                            ? "text-(--color-brand-700) dark:text-(--color-brand-300)"
                                                            : "text-zinc-400 dark:text-zinc-500",
                                                    )}
                                                >
                                                    {step.number}
                                                </span>
                                                <span
                                                    className={clsx(
                                                        "truncate text-[11px]/4",
                                                        here
                                                            ? "text-zinc-950 dark:text-white"
                                                            : "text-zinc-400 dark:text-zinc-500",
                                                    )}
                                                >
                                                    {labels.bracket(step.slug)}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                            <p className={"mt-2 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                {claimed
                                    ? t("description.bracket-claimed", { number: bracket })
                                    : t("description.bracket-assumed", { number: bracket })}
                            </p>
                            {/* What that step actually asks of the deck, as facts
                            rather than a paragraph. */}
                            {rules !== undefined && (
                                <div className={"mt-2 flex flex-wrap gap-1"}>
                                    <Badge color={"zinc"}>
                                        {rules.max_game_changers == null
                                            ? t("label.game-changers-any")
                                            : t("label.game-changers-max", { count: rules.max_game_changers })}
                                    </Badge>
                                    {!rules.mass_land_denial && (
                                        <Badge color={"zinc"}>{t("label.no-mass-land-denial")}</Badge>
                                    )}
                                    {!rules.extra_turns && <Badge color={"zinc"}>{t("label.no-extra-turns")}</Badge>}
                                </div>
                            )}

                            {/* What the table agreed to. Nothing here is a fault —
                            the deck is played this way on purpose — so it is
                            stated, never warned about. */}
                            <div className={"mt-4"}>
                                {houseRules.length === 0 ? (
                                    <p
                                        className={
                                            "flex items-center gap-1.5 text-xs/5 text-zinc-500 dark:text-zinc-400"
                                        }
                                    >
                                        <CheckCircleIcon
                                            className={"size-4 shrink-0 text-(--color-success)"}
                                            aria-hidden={"true"}
                                        />
                                        {t("description.by-the-book")}
                                    </p>
                                ) : (
                                    <>
                                        <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                            {t("description.rule-zero")}
                                        </p>
                                        <ul className={"mt-2 flex flex-col gap-1"}>
                                            {houseRules.map((rule) => {
                                                const Icon = RULE_ICONS[rule.kind];
                                                return (
                                                    <li
                                                        key={rule.kind}
                                                        className={
                                                            "flex items-start gap-2 rounded-(--radius-control) bg-zinc-950/[0.03] px-2.5 py-1.5 dark:bg-white/[0.04]"
                                                        }
                                                    >
                                                        <Icon
                                                            className={
                                                                "mt-0.5 size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                                                            }
                                                            aria-hidden={"true"}
                                                        />
                                                        <span
                                                            className={
                                                                "flex flex-wrap items-center gap-x-2 text-sm/6 text-zinc-950 dark:text-white"
                                                            }
                                                        >
                                                            {/* The one rule with a
                                                            visual form of its
                                                            own: "WUB" is a
                                                            spelling of the
                                                            colours, the pips
                                                            are the colours —
                                                            the same symbols
                                                            the deck's own
                                                            colour setting is
                                                            picked with. */}
                                                            {rule.kind === "colors" ? (
                                                                <>
                                                                    {t("label.colors-by-hand")}
                                                                    <ManaCost
                                                                        value={pips(rule.colors)}
                                                                        symbolClassName={"size-4"}
                                                                    />
                                                                </>
                                                            ) : (
                                                                labels.houseRule(rule)
                                                            )}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                )}
                            </div>

                            {/* The other two setup questions, read back the same
                            way the bracket above is: a fact, not a form.
                            "Plays" only appears once something is pinned —
                            with nothing pinned there is nothing to read back,
                            and the detector is doing the deciding, same as
                            always. */}
                            <dl
                                className={
                                    "mt-3 flex flex-col gap-1 border-t border-zinc-950/5 pt-3 dark:border-white/10"
                                }
                            >
                                {settings.themes.pinned.length > 0 && (
                                    <div className={"flex items-baseline justify-between gap-4 text-xs/5"}>
                                        <dt className={"text-zinc-500 dark:text-zinc-400"}>
                                            {t("label.assumed-themes")}
                                        </dt>
                                        <dd className={"text-right text-zinc-950 dark:text-white"}>
                                            {settings.themes.pinned.map((id) => id.replace(/_/g, " ")).join(", ")}
                                        </dd>
                                    </div>
                                )}
                                <div className={"flex items-baseline justify-between gap-4 text-xs/5"}>
                                    <dt className={"text-zinc-500 dark:text-zinc-400"}>{t("label.assumed-shape")}</dt>
                                    <dd className={"text-right text-zinc-950 dark:text-white"}>
                                        {shapeLabels[shapeChoiceFor(settings.targets.curve)]}
                                    </dd>
                                </div>
                            </dl>
                        </Section>

                        <Section icon={FunnelIcon} title={t("heading.pool")}>
                            <DeckAdvisorPool applied={poolQuery} onApply={onApplyPool} />
                        </Section>

                        <Section
                            icon={EyeSlashIcon}
                            title={t("heading.ignored")}
                            count={ignored.length > 0 ? ignored.length : undefined}
                        >
                            {ignored.length === 0 ? (
                                <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                    {t("description.ignored-empty")}
                                </p>
                            ) : (
                                <>
                                    <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                        {t("description.ignored")}
                                    </p>
                                    <ul className={"mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6"}>
                                        {ignored.map((card) => {
                                            const printing = cards.get(card.name);
                                            return (
                                                <li key={card.oracle_id} className={"group relative"}>
                                                    <CardThumbnail
                                                        name={card.name}
                                                        image={printing?.largeImageUrl ?? null}
                                                        thumbnail={printing?.imageUrl ?? null}
                                                        sizes={"96px"}
                                                        finish={CardFinish.Nonfoil}
                                                        className={
                                                            "w-full opacity-60 transition group-hover:opacity-100"
                                                        }
                                                    />
                                                    <button
                                                        type={"button"}
                                                        title={t("accessibility.unignore-card", { name: card.name })}
                                                        aria-label={t("accessibility.unignore-card", {
                                                            name: card.name,
                                                        })}
                                                        onClick={() => onUnignore(card)}
                                                        className={
                                                            "absolute top-1 right-1 rounded-full bg-(--surface-card)/90 p-1 text-zinc-600 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/10 transition hover:text-zinc-950 dark:text-zinc-300 dark:ring-white/15 dark:hover:text-white pointer-coarse:p-2"
                                                        }
                                                    >
                                                        <XMarkIcon className={"size-3.5"} />
                                                    </button>
                                                    <span
                                                        className={
                                                            "mt-1 block truncate text-center text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                                        }
                                                    >
                                                        {card.name}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </Section>

                        <Section
                            icon={ShieldCheckIcon}
                            title={t("heading.kept")}
                            count={kept.length > 0 ? kept.length : undefined}
                        >
                            {kept.length === 0 ? (
                                <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                    {t("description.kept-empty")}
                                </p>
                            ) : (
                                <>
                                    <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                        {t("description.kept")}
                                    </p>
                                    <ul className={"mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6"}>
                                        {kept.map((card) => {
                                            const printing = cards.get(card.name);
                                            return (
                                                <li key={card.oracle_id} className={"group relative"}>
                                                    <CardThumbnail
                                                        name={card.name}
                                                        image={printing?.largeImageUrl ?? null}
                                                        thumbnail={printing?.imageUrl ?? null}
                                                        sizes={"96px"}
                                                        finish={CardFinish.Nonfoil}
                                                        className={
                                                            "w-full opacity-60 transition group-hover:opacity-100"
                                                        }
                                                    />
                                                    <button
                                                        type={"button"}
                                                        title={t("accessibility.unkeep-card", { name: card.name })}
                                                        aria-label={t("accessibility.unkeep-card", { name: card.name })}
                                                        onClick={() => onUnkeep(card)}
                                                        className={
                                                            "absolute top-1 right-1 rounded-full bg-(--surface-card)/90 p-1 text-zinc-600 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/10 transition hover:text-zinc-950 dark:text-zinc-300 dark:ring-white/15 dark:hover:text-white pointer-coarse:p-2"
                                                        }
                                                    >
                                                        <XMarkIcon className={"size-3.5"} />
                                                    </button>
                                                    <span
                                                        className={
                                                            "mt-1 block truncate text-center text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                                        }
                                                    >
                                                        {card.name}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </Section>
                    </div>
                </DialogBody>
                <DialogActions>
                    {/* Closes this dialog rather than stacking on top of it — the
                    setup dialog opens in its place, pre-filled from what is
                    in force. Re-running does not clear `setup_done`;
                    finishing it is an edit, and the same dialog that wrote it
                    the first time writes it again either way. */}
                    <Button
                        outline
                        onClick={() => {
                            onClose();
                            setRerunning(true);
                        }}
                    >
                        {t("button.setup-rerun")}
                    </Button>
                    <Button onClick={onClose}>{t("button.assumptions-done")}</Button>
                </DialogActions>
            </Dialog>

            <DeckAdvisorSetup
                open={rerunning}
                onClose={() => setRerunning(false)}
                deck={{ bracket: claimed ? bracket : null }}
                brackets={brackets}
                settings={settings}
                onSave={onSaveSettings}
                onSaveBracket={onSaveBracket}
                detected={detected}
            />
        </>
    );
}

/** The properties for {@link Section} */
type SectionProps = {
    /** The mark that opens the heading */
    icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
    /** What the section is about */
    title: string;
    /** How many things are in it, where a number is worth having at a glance */
    count?: number;
    /** The section's own shape */
    children: ReactNode;
};

/**
 * One band of the dialog: a marked heading and whatever shape belongs under it.
 *
 * The heading is the only thing the three sections share. What sits below is
 * deliberately different in each — a scale, a query box, a wall of artwork —
 * because they are different kinds of thing, and three identical panels of
 * text under three identical headings is exactly the page this replaced.
 *
 * @returns the section
 */
function Section({ icon: Icon, title, count, children }: SectionProps) {
    return (
        <section className={"first:mt-0"}>
            <h3 className={"mb-2 flex items-center gap-2"}>
                <Icon className={"size-4 shrink-0 text-zinc-400 dark:text-zinc-500"} aria-hidden={"true"} />
                <span className={"text-xs/5 font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"}>
                    {title}
                </span>
                {count !== undefined && (
                    <span
                        className={
                            "rounded-(--radius-pill) bg-zinc-950/5 px-1.5 text-[11px]/5 font-medium text-zinc-500 tabular-nums dark:bg-white/10 dark:text-zinc-400"
                        }
                    >
                        {count}
                    </span>
                )}
                <span className={"h-px flex-1 bg-zinc-950/5 dark:bg-white/10"} />
            </h3>
            {children}
        </section>
    );
}
