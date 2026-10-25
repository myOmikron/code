import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, XMarkIcon } from "@heroicons/react/20/solid";
import {
    Button,
    StackedList,
    StackedListDescription,
    StackedListFlexRow,
    StackedListItem,
    StackedListTitle,
    Subheading,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { TournamentSummaryResponse } from "src/api/generated";
import { formatStart, useTournamentLabels } from "src/components/tournament-labels";
import { useLoaded } from "src/utils/use-loaded";

/**
 * The Tournaments offered to the reader to take over, each to accept or decline.
 *
 * Shows nothing while there is no offer. Accepting makes the reader the
 * Owner and leads to the Tournament.
 *
 * @returns the offers, or nothing
 */
export function TournamentHandoverOffers() {
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();
    const navigate = useNavigate();
    const offers = useLoaded(() => Api.tournaments.handover.offers(), []);
    const [busy, setBusy] = useState(false);

    if (offers.data === null || offers.data.tournaments.length === 0) return null;

    /**
     * Takes over an offered Tournament and opens it
     *
     * @param tournament the Tournament
     */
    async function accept(tournament: TournamentSummaryResponse) {
        setBusy(true);
        try {
            await Api.tournaments.handover.accept(tournament.uuid);
            notify.success(t("toast.handover-accepted", { name: tournament.name }));
            await navigate({ to: "/tournaments/$tournamentUuid", params: { tournamentUuid: tournament.uuid } });
        } finally {
            setBusy(false);
        }
    }

    /**
     * Turns down an offered Tournament
     *
     * @param tournament the Tournament
     */
    async function decline(tournament: TournamentSummaryResponse) {
        setBusy(true);
        try {
            await Api.tournaments.handover.decline(tournament.uuid);
            notify.success(t("toast.handover-declined", { name: tournament.name }));
            offers.reload();
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className={"mb-8 flex flex-col gap-2"}>
            <Subheading>{t("heading.handover-offers")}</Subheading>
            <StackedList>
                {offers.data.tournaments.map((tournament) => (
                    <StackedListFlexRow key={tournament.uuid}>
                        <StackedListItem>
                            <StackedListTitle>
                                <Link
                                    to={"/tournaments/$tournamentUuid"}
                                    params={{ tournamentUuid: tournament.uuid }}
                                    className={"hover:underline"}
                                >
                                    {tournament.name}
                                </Link>
                            </StackedListTitle>
                            <StackedListDescription>
                                {[formatStart(tournament.starts_at), labels.organizedBy(tournament.owner)].join(" · ")}
                            </StackedListDescription>
                        </StackedListItem>
                        <div className={"flex shrink-0 flex-wrap justify-end gap-2"}>
                            <Button outline={true} disabled={busy} onClick={() => void decline(tournament)}>
                                <XMarkIcon />
                                {t("button.decline-handover")}
                            </Button>
                            <Button color={"lime"} disabled={busy} onClick={() => void accept(tournament)}>
                                <CheckIcon />
                                {t("button.accept-handover")}
                            </Button>
                        </div>
                    </StackedListFlexRow>
                ))}
            </StackedList>
        </section>
    );
}
