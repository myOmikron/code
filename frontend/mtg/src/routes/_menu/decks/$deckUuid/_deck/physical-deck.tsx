import { createFileRoute } from "@tanstack/react-router";
import { StackedList, Subheading, Text } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckPhysicalStackRow } from "src/components/deck-physical-stack-row";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/physical-deck")({
    loader: ({ params }) => Api.decks.physicalDeck(params.deckUuid),
    component: RouteComponent,
});

/**
 * What the owner has really put into the deck, for an Editor to read: real cards and Proxies.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("collection");
    const { stacks } = Route.useLoaderData();

    return (
        <section className={"flex flex-col gap-4"}>
            <div className={"flex flex-col gap-1"}>
                <Subheading>{t("heading.physical-deck")}</Subheading>
                <Text>{t("description.physical-deck-read-only")}</Text>
            </div>
            {stacks.length === 0 ? (
                <Text>{t("description.physical-deck-nothing")}</Text>
            ) : (
                <StackedList>
                    {stacks.map((stack) => (
                        <DeckPhysicalStackRow key={stack.uuid} stack={stack} />
                    ))}
                </StackedList>
            )}
        </section>
    );
}
