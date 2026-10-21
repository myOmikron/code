import { createFileRoute } from "@tanstack/react-router";
import { Heading, Text } from "components";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ReleaseNotes } from "src/components/release-notes";
import i18n from "src/i18n";
import { markReleaseNotesSeen, RELEASES } from "src/utils/use-release-notes";

export const Route = createFileRoute("/_menu/whats-new")({
    loader: () => i18n.loadNamespaces("whats-new"),
    component: RouteComponent,
});

/**
 * The "What's new" page: the Release notes of every Release, newest first, reachable without an account.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("whats-new");

    useEffect(markReleaseNotesSeen, []);

    return (
        <div className={"flex max-w-3xl flex-col gap-8 py-4"}>
            <div className={"flex flex-col gap-2"}>
                <Heading>{t("heading.whats-new")}</Heading>
                <Text>{t("description.whats-new")}</Text>
            </div>
            {RELEASES.length === 0 ? (
                <Text>{t("description.no-release-notes")}</Text>
            ) : (
                RELEASES.map((release) => <ReleaseNotes key={release.version} release={release} />)
            )}
        </div>
    );
}
