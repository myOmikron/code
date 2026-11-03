import {
    DocumentDuplicateIcon,
    FlagIcon,
    FunnelIcon,
    NoSymbolIcon,
    PuzzlePieceIcon,
    RectangleStackIcon,
    ScaleIcon,
    ShieldCheckIcon,
    Squares2X2Icon,
    SwatchIcon,
    UserGroupIcon,
    XMarkIcon,
} from "@heroicons/react/16/solid";
import { CheckCircleIcon, EyeSlashIcon, PlusIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import clsx from "clsx";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BracketRulesResponse, CardFinish } from "src/api/generated";
import type { Diagnostics } from "src/api/graph-generated";
import { SplitToggle } from "src/components/charts/split-toggle";
import { CardThumbnail } from "src/components/card-thumbnail";
import { FixBadges } from "src/components/deck-advisor-debrief-dialog";
import { DeckAdvisorPool } from "src/components/deck-advisor-pool";
import { DeckAdvisorSetup, ShapeChoice, shapeChoiceFor } from "src/components/deck-advisor-setup";
import { DeckThemeAddDialog } from "src/components/deck-theme-add-dialog";
import { ManaCost } from "src/components/mana-cost";
import { QuietButton } from "src/components/quiet-button";
import { useDeckLabels } from "src/components/deck-labels";
import { AdvisorSettings, IgnoredCard, KeptCard } from "src/utils/advisor-settings";
import { Direction, fixOf } from "src/utils/advisor-directions";
import type { HouseRule } from "src/utils/deck-rules";
import { THEME_LEVELS, ThemeLevel } from "src/utils/deck-theme-prefs";
import { themeListing } from "src/utils/deck-theme-read";
import { parseTypeSource, typeSourceLabel } from "src/utils/type-source";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/** The dialog's three tabs */
export type GoalsTab = "goals" | "table" | "cards";

/**
 * The properties for {@link DeckAdvisorGoals}
 */
export type DeckAdvisorGoalsProps = {
    /** The tab to show, `null` while closed */
    tab: GoalsTab | null;
    onTab: (tab: GoalsTab) => void;
    onClose: () => void;
    bracket: number;
    claimed: boolean;
    brackets: Array<BracketRulesResponse>;
    houseRules: Array<HouseRule>;
    poolQuery: string | null;
    onApplyPool: (query: string | null) => void;
    ignored: Array<IgnoredCard>;
    onUnignore: (card: IgnoredCard) => void;
    kept: Array<KeptCard>;
    onUnkeep: (card: KeptCard) => void;
    settings: AdvisorSettings;
    onSaveSettings: (next: AdvisorSettings) => void;
    onSaveBracket: (bracket: number | null) => void;
    detected: Record<string, number>;
    typeSource?: string;
    /** The deck's analysis, for its themes */
    report: Diagnostics | null;
    /** Theme id to label */
    themeLabels: Record<string, string>;
    onSetThemeLevel: (themeId: string, level: ThemeLevel | null) => void;
    onSetShape: (shape: ShapeChoice) => void;
    /** Takes a direction back out of the deck's targets */
    onRemoveDirection: (direction: Direction) => void;
    /** Asks how the deck played, for a new direction */
    onAddDirection: () => void;
};

const RULE_ICONS: Record<HouseRule["kind"], ComponentType<{ className?: string }>> = {
    colors: SwatchIcon,
    commanders: UserGroupIcon,
    duplicates: DocumentDuplicateIcon,
    banned: NoSymbolIcon,
    "deck-size": RectangleStackIcon,
};

/**
 * A colour identity as mana symbols
 *
 * @param colors the letters
 *
 * @returns the symbols, colourless as `{C}`
 */
function pips(colors: string): string {
    return colors === "" ? "{C}" : [...colors].map((letter) => `{${letter}}`).join("");
}

/**
 * Everything the advice stands on, in one place: the goals the reader set,
 * the table the deck is built for, and the cards the advisor may offer.
 *
 * @returns the dialog
 */
export function DeckAdvisorGoals({
    tab,
    onTab,
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
    typeSource,
    report,
    themeLabels,
    onSetThemeLevel,
    onSetShape,
    onRemoveDirection,
    onAddDirection,
}: DeckAdvisorGoalsProps) {
    const [t] = useTranslation("advisor");
    const labels = useDeckLabels();
    const [rerunning, setRerunning] = useState(false);
    const [addingTheme, setAddingTheme] = useState(false);
    const open = tab !== null;

    const typeSourceInfo = parseTypeSource(typeSource);
    const typeSourceCaption = typeSourceInfo === null ? null : typeSourceLabel(typeSourceInfo);

    const { cards } = useSuggestionCards(open ? [...ignored, ...kept].map((card) => card.name) : []);

    const rules = brackets.find((entry) => entry.number === bracket);
    const listing = report === null ? null : themeListing(report, settings.themes, themeLabels);
    const themeRows = [
        ...new Set([...(listing?.listed.map((row) => row.id) ?? []), ...Object.keys(settings.themes.levels)]),
    ];
    const tabs: Array<{ id: GoalsTab; icon: ComponentType<{ className?: string }>; count: number }> = [
        { id: "goals", icon: FlagIcon, count: settings.directions.length },
        { id: "table", icon: ScaleIcon, count: houseRules.length },
        { id: "cards", icon: Squares2X2Icon, count: ignored.length + kept.length + (poolQuery === null ? 0 : 1) },
    ];

    return (
        <>
            <Dialog open={open} onClose={onClose} size={"2xl"}>
                <DialogTitle>{t("heading.goals")}</DialogTitle>
                <div role={"tablist"} className={"mt-4 flex gap-5 border-b border-zinc-950/10 dark:border-white/10"}>
                    {tabs.map(({ id, icon: Icon, count }) => (
                        <button
                            key={id}
                            type={"button"}
                            role={"tab"}
                            aria-selected={tab === id}
                            onClick={() => onTab(id)}
                            className={clsx(
                                "-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-sm/6 font-medium transition",
                                tab === id
                                    ? "border-(--color-accent) text-zinc-950 dark:text-white"
                                    : "border-transparent text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
                            )}
                        >
                            <Icon className={"size-4"} />
                            {t(`label.goals-tab-${id}`)}
                            {count > 0 && (
                                <span
                                    className={
                                        "rounded-(--radius-pill) bg-zinc-950/5 px-1.5 text-[11px]/5 tabular-nums dark:bg-white/10"
                                    }
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <DialogBody>
                    <div className={"flex flex-col gap-6"} role={"tabpanel"}>
                        {tab === "goals" && (
                            <>
                                <Section icon={FlagIcon} title={t("heading.directions")}>
                                    {settings.directions.length === 0 ? (
                                        <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                            {t("description.directions-empty")}
                                        </p>
                                    ) : (
                                        <ul className={"flex flex-col gap-2"}>
                                            {settings.directions.map((direction) => {
                                                const fix = fixOf(direction);
                                                if (fix === undefined) return null;
                                                return (
                                                    <li
                                                        key={`${direction.problem}:${direction.fix}`}
                                                        className={
                                                            "flex items-start justify-between gap-3 rounded-(--radius-control) p-3 ring-1 ring-zinc-950/10 dark:ring-white/10"
                                                        }
                                                    >
                                                        <span className={"flex flex-col gap-1"}>
                                                            <span
                                                                className={
                                                                    "text-sm/6 font-medium text-zinc-950 dark:text-white"
                                                                }
                                                            >
                                                                {t(`label.fix-${fix.id}`)}
                                                            </span>
                                                            <span
                                                                className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}
                                                            >
                                                                {t("label.direction-because", {
                                                                    problem: t(`label.problem-${direction.problem}`),
                                                                    cost: t(`label.fix-cost-${fix.id}`),
                                                                })}
                                                            </span>
                                                            <FixBadges fix={fix} />
                                                        </span>
                                                        <button
                                                            type={"button"}
                                                            onClick={() => onRemoveDirection(direction)}
                                                            title={t("accessibility.remove-direction", {
                                                                name: t(`label.fix-${fix.id}`),
                                                            })}
                                                            aria-label={t("accessibility.remove-direction", {
                                                                name: t(`label.fix-${fix.id}`),
                                                            })}
                                                            className={
                                                                "rounded-(--radius-control) p-1 text-zinc-400 transition hover:bg-lime-400/15 hover:text-lime-700 dark:text-zinc-500 dark:hover:text-lime-300"
                                                            }
                                                        >
                                                            <XMarkIcon className={"size-4"} />
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                    <QuietButton onClick={onAddDirection} className={"mt-2"}>
                                        <PlusIcon className={"size-3.5"} />
                                        {t("button.add-direction")}
                                    </QuietButton>
                                </Section>

                                <Section icon={PuzzlePieceIcon} title={t("heading.themes")}>
                                    <ul className={"flex flex-col gap-1.5"}>
                                        {themeRows.map((id) => {
                                            const level = settings.themes.levels[id];
                                            return (
                                                <li
                                                    key={id}
                                                    className={"flex flex-wrap items-center justify-between gap-2"}
                                                >
                                                    <span className={"text-sm/6 text-zinc-950 dark:text-white"}>
                                                        {themeLabels[id] ?? id.replace(/_/g, " ")}
                                                    </span>
                                                    <span className={"flex items-center gap-1"}>
                                                        <SplitToggle<ThemeLevel>
                                                            options={[...THEME_LEVELS]}
                                                            value={level ?? ("" as ThemeLevel)}
                                                            onChange={(next) => onSetThemeLevel(id, next)}
                                                            nameOf={(option) => t(`label.theme-level-${option}`)}
                                                        />
                                                        {level !== undefined && (
                                                            <button
                                                                type={"button"}
                                                                onClick={() => onSetThemeLevel(id, null)}
                                                                title={t("accessibility.clear-theme-level")}
                                                                aria-label={t("accessibility.clear-theme-level")}
                                                                className={
                                                                    "rounded-(--radius-control) p-1 text-zinc-400 hover:text-lime-700 dark:text-zinc-500 dark:hover:text-lime-300"
                                                                }
                                                            >
                                                                <XMarkIcon className={"size-3.5"} />
                                                            </button>
                                                        )}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    <QuietButton onClick={() => setAddingTheme(true)} className={"mt-2"}>
                                        <PlusIcon className={"size-3.5"} />
                                        {t("button.new-theme")}
                                    </QuietButton>
                                </Section>

                                <Section icon={RectangleStackIcon} title={t("heading.shape")}>
                                    <SplitToggle<ShapeChoice>
                                        options={["fast", "balanced", "big"]}
                                        value={shapeChoiceFor(settings.targets.curve)}
                                        onChange={onSetShape}
                                        nameOf={(option) => t(`label.setup-shape-${option}`)}
                                    />
                                </Section>
                            </>
                        )}

                        {tab === "table" && (
                            <Section icon={ScaleIcon} title={t("heading.read-against")}>
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
                                        {rules.extra_turns !== "any" && (
                                            <Badge color={"zinc"}>
                                                {rules.extra_turns === "none"
                                                    ? t("label.no-extra-turns")
                                                    : t("label.no-extra-turn-chains")}
                                            </Badge>
                                        )}
                                        {rules.combos !== "any" && (
                                            <Badge color={"zinc"}>
                                                {rules.combos === "none"
                                                    ? t("label.no-combos")
                                                    : t("label.no-two-card-combos")}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                                {typeSourceCaption !== null && (
                                    <p className={"mt-2 text-xs/5 text-zinc-500 dark:text-zinc-400"} title={typeSource}>
                                        {t(typeSourceCaption.key, typeSourceCaption.params)}
                                    </p>
                                )}
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
                            </Section>
                        )}

                        {tab === "cards" && (
                            <>
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
                                                                title={t("accessibility.unignore-card", {
                                                                    name: card.name,
                                                                })}
                                                                aria-label={t("accessibility.unignore-card", {
                                                                    name: card.name,
                                                                })}
                                                                onClick={() => onUnignore(card)}
                                                                className={
                                                                    "absolute top-1 right-1 rounded-full bg-(--surface-card)/90 p-1 text-zinc-600 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/10 transition hover:text-lime-700 dark:text-zinc-300 dark:ring-white/15 dark:hover:text-lime-300 pointer-coarse:p-2"
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
                                                                title={t("accessibility.unkeep-card", {
                                                                    name: card.name,
                                                                })}
                                                                aria-label={t("accessibility.unkeep-card", {
                                                                    name: card.name,
                                                                })}
                                                                onClick={() => onUnkeep(card)}
                                                                className={
                                                                    "absolute top-1 right-1 rounded-full bg-(--surface-card)/90 p-1 text-zinc-600 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/10 transition hover:text-lime-700 dark:text-zinc-300 dark:ring-white/15 dark:hover:text-lime-300 pointer-coarse:p-2"
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
                            </>
                        )}
                    </div>
                </DialogBody>
                <DialogActions>
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
            <DeckThemeAddDialog
                open={addingTheme}
                onClose={() => setAddingTheme(false)}
                detected={detected}
                listed={themeRows}
                onAdd={(theme) => onSetThemeLevel(theme, "core")}
            />
        </>
    );
}

/** The properties for {@link Section} */
type SectionProps = {
    icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
    title: string;
    count?: number;
    children: ReactNode;
};

/**
 * One titled section of the dialog
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
