import { ArrowLeftIcon, ArrowUturnLeftIcon } from "@heroicons/react/20/solid";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
    Badge,
    Button,
    ConfirmDialog,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Field,
    Heading,
    Input,
    Label,
    notify,
    Strong,
    Subheading,
    Text,
} from "components";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckPointEntryResponse, DeckPointResponse } from "src/api/generated";
import { CheckpointBadge, DeckChangeBody, settingsFields, useFieldWords } from "src/components/deck-history-list";
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
                {point.change.checkpoint != null && <CheckpointBadge name={point.change.checkpoint} />}
                <DeckChangeBody change={point.change} />
                <CheckpointForm deckUuid={deckUuid} point={point} />
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
 * The longest name of a Deck checkpoint, in bytes, as the server bounds it
 *
 * The one copy of the server's `CHECKPOINT_LENGTH` (services/mtg, Deck history
 * module) in the frontend. The OpenAPI spec states it as the `maxLength` of
 * `MaxStr_64`, but the generated client carries no schema constraints, so it
 * cannot be read from there.
 */
const CHECKPOINT_BYTES = 64;

/**
 * The properties for {@link CheckpointForm}
 */
type CheckpointFormProps = {
    /** The deck */
    deckUuid: string;
    /** The deck at the point whose Deck change gets named */
    point: DeckPointResponse;
};

/**
 * Names the point's Deck change with a Deck checkpoint, renames or removes it
 *
 * @returns the form
 */
function CheckpointForm({ deckUuid, point }: CheckpointFormProps) {
    const [t] = useTranslation("deck");
    const router = useRouter();

    const saved = point.change.checkpoint ?? "";
    const [name, setName] = useState(saved);
    const [busy, setBusy] = useState(false);
    useEffect(() => setName(saved), [saved]);

    const trimmed = name.trim();
    const fits = new TextEncoder().encode(trimmed).length <= CHECKPOINT_BYTES;

    /**
     * Saves the typed name as the Deck checkpoint
     */
    async function save() {
        setBusy(true);
        try {
            await Api.decks.setCheckpoint(deckUuid, point.change.uuid, trimmed);
            notify.success(t("toast.history-checkpoint-saved"));
            await router.invalidate();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Removes the Deck checkpoint
     */
    async function remove() {
        setBusy(true);
        try {
            await Api.decks.removeCheckpoint(deckUuid, point.change.uuid);
            notify.success(t("toast.history-checkpoint-removed"));
            await router.invalidate();
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            className={"flex flex-col gap-3 pt-2"}
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <Field>
                <Label>{t("label.history-checkpoint-name")}</Label>
                <Input
                    autoComplete={"off"}
                    value={name}
                    invalid={!fits}
                    onChange={(event) => setName(event.target.value)}
                />
            </Field>
            <Text>{t("description.history-checkpoint")}</Text>
            <div className={"flex flex-wrap gap-2"}>
                <Button type={"submit"} color={"blue"} disabled={busy || trimmed === "" || !fits || trimmed === saved}>
                    {t("button.history-checkpoint-save")}
                </Button>
                {saved !== "" && (
                    <Button type={"button"} outline={true} disabled={busy} onClick={() => void remove()}>
                        {t("button.history-checkpoint-remove")}
                    </Button>
                )}
            </div>
        </form>
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
    const words = useFieldWords();

    const rows = settingsFields(point.settings).map((field): [string, string] => {
        const [term, , value] = words(field);
        return [term, value];
    });

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
