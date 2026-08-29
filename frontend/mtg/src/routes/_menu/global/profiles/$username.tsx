import { createFileRoute } from "@tanstack/react-router";
import { UserIcon } from "@heroicons/react/20/solid";
import { Avatar, EmptyState, Heading, Subheading, Text } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { PublicCollectionTile } from "src/components/public-collection-tile";
import { PublicDeckTile } from "src/components/public-deck-tile";
import i18n from "src/i18n";
import { formatDate } from "src/utils/format";
import { isNotPublic } from "src/utils/public-page";

export const Route = createFileRoute("/_menu/global/profiles/$username")({
    loader: async ({ params }) => {
        // The tiles are the deck list's and the shelf's, so they read their
        // strings out of those namespaces rather than out of this page's.
        const strings = Promise.all([
            i18n.loadNamespaces("deck"),
            i18n.loadNamespaces("collection"),
            i18n.loadNamespaces("global"),
        ]);
        try {
            const [profile] = await Promise.all([Api.explore.profiles.get(params.username), strings]);
            return { profile };
        } catch (error) {
            if (isNotPublic(error)) {
                await strings;
                return { profile: null };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * Everything one account put on show.
 *
 * An account is only ever as public as the things on it: the page exists for
 * every account, and an account that published nothing has an empty one. There
 * is nothing here that is not already reachable through the deck search.
 *
 * @returns the page
 */
function RouteComponent() {
    const { username } = Route.useParams();
    const { profile } = Route.useLoaderData();
    const [t] = useTranslation("global");

    if (profile === null) {
        return (
            <EmptyState
                icon={<UserIcon />}
                title={t("heading.unknown-profile")}
                description={t("description.unknown-profile")}
            />
        );
    }

    const empty = profile.decks.length === 0 && profile.collections.length === 0;

    return (
        <div className={"flex flex-col gap-8"}>
            <div className={"flex items-center gap-4"}>
                <Avatar initials={profile.username.slice(0, 2).toUpperCase()} className={"size-12"} />
                <div className={"flex min-w-0 flex-col gap-1"}>
                    <Heading>{profile.username}</Heading>
                    <Text>{t("label.member-since", { date: formatDate(profile.created_at) })}</Text>
                </div>
            </div>

            {empty ? (
                <EmptyState
                    title={t("heading.profile-empty")}
                    description={t("description.profile-empty", { owner: username })}
                />
            ) : (
                <>
                    {profile.decks.length > 0 && (
                        <div className={"flex flex-col gap-4"}>
                            <div className={"flex flex-col gap-1"}>
                                <Subheading>{t("heading.profile-decks")}</Subheading>
                                <Text>{t("label.deck-count", { count: profile.decks.length })}</Text>
                            </div>
                            <ul className={"grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                                {profile.decks.map((deck) => (
                                    <PublicDeckTile key={deck.uuid} deck={deck} />
                                ))}
                            </ul>
                        </div>
                    )}

                    {profile.collections.length > 0 && (
                        <div className={"flex flex-col gap-4"}>
                            <div className={"flex flex-col gap-1"}>
                                <Subheading>{t("heading.profile-collections")}</Subheading>
                                <Text>{t("label.collection-count", { count: profile.collections.length })}</Text>
                            </div>
                            <ul className={"grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                                {profile.collections.map((collection) => (
                                    <PublicCollectionTile key={collection.uuid} collection={collection} />
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
