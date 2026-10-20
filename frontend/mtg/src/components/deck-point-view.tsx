import { ArrowLeftIcon, ArrowUturnLeftIcon } from "@heroicons/react/20/solid";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
    Badge,
    Button,
    ConfirmDialog,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Heading,
    notify,
    Strong,
    Subheading,
    Text,
} from "components";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckPointEntryResponse, DeckPointResponse } from "src/api/generated";
import { DeckChangeBody, useSettingWords } from "src/components/deck-history-list";
import { useDeckLabels, ZONE_ORDER } from "src/components/deck-labels";
import { formatDateTime } from "src/utils/format";

/**
 * The properties for {@link DeckPointView}
 */
export type DeckPointViewProps = {
    /** The deck */
    deckUuid: string;
    /** The deck as it was right after one of its Deck changes */
    point: DeckPointResponse;
};

/**
 * A deck as it was at an earlier point of its Deck history, read-only, with the way back to it
 *
 * @returns the view
 */
export function DeckPointView({ deckUuid, point }: DeckPointViewProps) {
    const [t] = useTranslation("deck");
    const router = useRouter();
    const navigate = useNavigate();

    const [confirming, setConfirming] = useState(false);
    const date = formatDateTime(point.change.changed_at);

    /**
     * Resets the deck to this point and goes back to the Deck history
     */
    async function reset() {
        await Api.decks.reset(deckUuid, point.change.uuid);
        setConfirming(false);
        notify.success(t("toast.history-reset"));
        await navigate({ to: "/decks/$deckUuid/history", params: { deckUuid } });
        await router.invalidate();
    }

    return (
        <div className={"flex flex-col gap-8"}>
            <div className={"flex flex-col gap-4"}>
                <div>
                    <Button plain={true} href={"/decks/$deckUuid/history"} params={{ deckUuid }}>
                        <ArrowLeftIcon />
                        {t("button.history-back")}
                    </Button>
                </div>
                <div className={"flex flex-wrap items-center justify-between gap-4"}>
                    <Heading>{t("heading.history-point", { date })}</Heading>
                    <Button color={"blue"} onClick={() => setConfirming(true)}>
                        <ArrowUturnLeftIcon />
                        {t("button.history-reset")}
                    </Button>
                </div>
                <Text>{t("description.history-point")}</Text>
            </div>

            <section className={"flex flex-col gap-2"}>
                <Subheading>{t("heading.history-point-change")}</Subheading>
                <DeckChangeBody change={point.change} />
            </section>

            <PointSettings point={point} />

            <PointEntries entries={point.entries} />

            <ConfirmDialog
                open={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={reset}
                title={t("heading.history-reset-confirm")}
                description={t("description.history-reset-confirm", { date })}
                confirmLabel={t("button.history-reset")}
                confirmColor={"blue"}
            />
        </div>
    );
}

/**
 * The properties for {@link PointSettings}
 */
type PointSettingsProps = {
    /** The deck at the point */
    point: DeckPointResponse;
};

/**
 * The recorded deck fields as they were at the point
 *
 * @returns the section
 */
function PointSettings({ point }: PointSettingsProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const { colors, agreement } = useSettingWords();

    const settings = point.settings;
    const none = t("label.history-value-none");
    const rows: Array<[string, string]> = [
        [t("label.history-field-name"), settings.name],
        [t("label.history-field-description"), settings.description ?? none],
        [t("label.history-field-format"), labels.format(settings.format)],
        [t("label.history-field-colors"), colors(settings.allowed_color_identity)],
        [t("label.history-field-bracket"), settings.bracket?.toString() ?? none],
        [t("label.history-field-allow-extra-commanders"), agreement(settings.allow_extra_commanders)],
        [t("label.history-field-allow-duplicates"), agreement(settings.allow_duplicates)],
        [t("label.history-field-allow-banned"), agreement(settings.allow_banned)],
        [t("label.history-field-deck-size"), settings.deck_size?.toString() ?? t("label.history-value-format-size")],
    ];

    return (
        <section className={"flex flex-col gap-2"}>
            <Subheading>{t("heading.history-point-settings")}</Subheading>
            <DescriptionList>
                {rows.map(([term, value]) => (
                    <Fragment key={term}>
                        <DescriptionTerm>{term}</DescriptionTerm>
                        <DescriptionDetails className={"break-words whitespace-pre-line"}>{value}</DescriptionDetails>
                    </Fragment>
                ))}
            </DescriptionList>
        </section>
    );
}

/**
 * The properties for {@link PointEntries}
 */
type PointEntriesProps = {
    /** The Deck entries the deck held at the point */
    entries: Array<DeckPointEntryResponse>;
};

/**
 * The decklist at the point, zone by zone
 *
 * @returns the section
 */
function PointEntries({ entries }: PointEntriesProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const zones = ZONE_ORDER.map((zone) => ({
        zone,
        entries: entries.filter((entry) => entry.zone === zone),
    })).filter(({ entries }) => entries.length > 0);

    return (
        <section className={"flex flex-col gap-4"}>
            <Subheading>{t("heading.history-point-cards")}</Subheading>
            {zones.length === 0 && <Text>{t("label.history-point-empty")}</Text>}
            {zones.map(({ zone, entries }) => (
                <div key={zone} className={"flex flex-col gap-1"}>
                    <Strong>
                        {t("label.history-point-zone", {
                            zone: labels.zone(zone),
                            count: entries.reduce((sum, entry) => sum + entry.quantity, 0),
                        })}
                    </Strong>
                    <ul className={"flex flex-col gap-1"}>
                        {entries.map((entry) => (
                            <li
                                key={`${entry.printing}-${entry.foil}-${entry.proxy}`}
                                className={"flex flex-wrap items-center gap-2"}
                            >
                                <Text>
                                    {t("label.history-point-line", {
                                        quantity: entry.quantity,
                                        name: entry.name ?? t("label.unknown-printing"),
                                    })}
                                </Text>
                                {entry.foil && <Badge color={"amber"}>{t("label.foil")}</Badge>}
                                {entry.proxy && <Badge color={"zinc"}>{t("label.proxy")}</Badge>}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </section>
    );
}
