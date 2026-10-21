import { Badge, Subheading, Text } from "components";
import { useTranslation } from "react-i18next";
import { formatFullDay } from "src/utils/format";
import { RELEASE_NOTE_KINDS, UNRELEASED } from "src/utils/release-notes";
import type { Release, ReleaseNoteKind } from "src/utils/release-notes";

/** The props of {@link ReleaseNotes} */
export type ReleaseNotesProps = {
    /** The Release to show */
    release: Release;
};

/** The badge colour of each kind */
const KIND_COLORS = { new: "lime", improved: "sky", fixed: "amber" } as const;

/**
 * One Release on the "What's new" page: its version, its date and its notes by kind.
 *
 * @returns the Release's section
 */
export function ReleaseNotes(props: ReleaseNotesProps) {
    const { release } = props;
    const [t, i18n] = useTranslation("whats-new");
    const [tg] = useTranslation();
    const german = i18n.resolvedLanguage === "de";

    const kindLabels: Record<ReleaseNoteKind, string> = {
        new: t("label.new"),
        improved: t("label.improved"),
        fixed: t("label.fixed"),
    };

    return (
        <section className={"flex flex-col gap-4"}>
            <div
                className={
                    "flex items-baseline justify-between gap-4 border-b border-zinc-950/10 pb-2 dark:border-white/10"
                }
            >
                <Subheading>
                    {release.version === UNRELEASED
                        ? t("label.unreleased")
                        : tg("label.version", { version: release.version })}
                </Subheading>
                {release.date !== null && (
                    <Text>
                        <time dateTime={release.date}>{formatFullDay(release.date)}</time>
                    </Text>
                )}
            </div>
            {RELEASE_NOTE_KINDS.filter((kind) => release.notes[kind].length > 0).map((kind) => (
                <div key={kind} className={"flex flex-col items-start gap-2"}>
                    <Badge color={KIND_COLORS[kind]}>{kindLabels[kind]}</Badge>
                    <ul className={"flex list-disc flex-col gap-1 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500"}>
                        {release.notes[kind].map((note) => (
                            <li key={note.file}>
                                <Text>{german ? note.de : note.en}</Text>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </section>
    );
}
