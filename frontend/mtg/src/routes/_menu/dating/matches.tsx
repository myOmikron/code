import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge, Button, Heading, Subheading, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DateStatus } from "src/api/generated";
import type { DateResponse } from "src/api/generated";
import { DatingStartDialog } from "src/components/dating-start-dialog";
import { ManaCost } from "src/components/mana-cost";
import { RequireAccount } from "src/components/require-account";
import i18n from "src/i18n";
import { manaSymbols, rejectionKey } from "src/utils/dating";
import { useStartDeck } from "src/utils/use-start-deck";

export const Route = createFileRoute("/_menu/dating/matches")({
    loader: async () => {
        await i18n.loadNamespaces(["dating"]);
        return Api.dating.dates();
    },
    component: RouteComponent,
});

/**
 * The account's matches, and the Commanders that said no.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("dating");
    const { matches, shots } = Route.useLoaderData();
    const router = useRouter();
    const startDeck = useStartDeck();
    const [busy, setBusy] = useState<string | null>(null);

    const [starting, setStarting] = useState<DateResponse | null>(null);

    const commanderOf = (date: DateResponse) => ({
        commander: date.commander,
        name: date.name,
        printing: date.printing,
        art: date.image_art_crop,
    });

    const act = async (date: DateResponse, action: () => Promise<unknown>) => {
        setBusy(date.commander);
        try {
            await action();
            await router.invalidate();
        } finally {
            setBusy(null);
        }
    };

    const row = (date: DateResponse) => {
        const matched = date.status === DateStatus.Matched;
        const art = date.image_art_crop ?? date.image_normal ?? null;
        return (
            <li key={date.commander} className={"flex items-center gap-3 py-3"}>
                <span className={"size-14 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"}>
                    {art !== null && (
                        <img
                            src={art}
                            alt={t("accessibility.art", { name: date.name })}
                            crossOrigin={"anonymous"}
                            className={"size-full object-cover object-[center_35%]"}
                        />
                    )}
                </span>
                <div className={"flex min-w-0 flex-1 flex-col gap-0.5"}>
                    <span className={"flex items-center gap-2"}>
                        <span className={"truncate font-semibold text-zinc-950 dark:text-white"}>{date.name}</span>
                        {date.color_identity !== "" && <ManaCost value={manaSymbols(date.color_identity)} />}
                    </span>
                    {matched && date.shared && (
                        <Text className={"truncate text-xs"}>{t("description.shared", { shared: date.shared })}</Text>
                    )}
                    {date.status === DateStatus.Rejected && date.reason && (
                        <Text className={"truncate text-xs"}>
                            {t(rejectionKey(date.reason, date.commander), { detail: date.reason.detail ?? "" })}
                        </Text>
                    )}
                    {date.status === DateStatus.Unmatched && (
                        <span>
                            <Badge color={"zinc"}>{t("label.unmatched")}</Badge>
                        </span>
                    )}
                </div>
                <div className={"flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center"}>
                    {matched ? (
                        <Button
                            plain={true}
                            disabled={busy !== null}
                            onClick={() => act(date, () => Api.dating.unmatch(date.commander))}
                        >
                            {t("button.unmatch")}
                        </Button>
                    ) : (
                        <Button
                            outline={true}
                            disabled={busy !== null}
                            onClick={() => act(date, () => Api.dating.comeBack(date.commander))}
                        >
                            {t("button.come-back")}
                        </Button>
                    )}
                    {date.open_date ? (
                        <Button color={"lime"} href={`/dating/date/${date.open_date}`}>
                            {t("button.continue-date")}
                        </Button>
                    ) : (
                        <Button color={"lime"} disabled={busy !== null} onClick={() => setStarting(date)}>
                            {t("button.start-deck")}
                        </Button>
                    )}
                </div>
            </li>
        );
    };

    return (
        <RequireAccount>
            <div className={"mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6"}>
                <div className={"flex items-center gap-2"}>
                    <Button plain={true} href={"/dating"} aria-label={t("button.swipe")}>
                        <ArrowLeftIcon />
                    </Button>
                    <Heading>{t("heading.matches")}</Heading>
                </div>

                <section className={"flex flex-col"}>
                    {matches.length === 0 ? (
                        <Text>{t("description.no-matches")}</Text>
                    ) : (
                        <ul className={"divide-y divide-zinc-950/5 dark:divide-white/5"}>{matches.map(row)}</ul>
                    )}
                </section>

                <section className={"flex flex-col gap-2"}>
                    <Subheading>{t("heading.shots")}</Subheading>
                    {shots.length === 0 ? (
                        <Text>{t("description.no-shots")}</Text>
                    ) : (
                        <ul className={"divide-y divide-zinc-950/5 dark:divide-white/5"}>{shots.map(row)}</ul>
                    )}
                </section>
            </div>
            <DatingStartDialog
                name={starting?.name ?? null}
                busy={busy !== null}
                onClose={() => setStarting(null)}
                onStart={(mode) => {
                    if (starting === null) return;
                    const date = starting;
                    void act(date, () => startDeck(commanderOf(date), mode));
                }}
            />
        </RequireAccount>
    );
}
