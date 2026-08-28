import { CheckIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { hapticTap } from "src/utils/haptics";
import { WATCH_LANGUAGES, useWatchLanguageLabels } from "src/components/watch-language-labels";

/**
 * The properties for {@link WatchLanguageDialog}
 */
export type WatchLanguageDialogProps = {
    /** The codes in force, `null` to keep the dialog closed */
    languages: Array<string> | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** Records the new set, empty for any language */
    onSave: (languages: Array<string>) => void;
};

/**
 * Which languages of a card count.
 *
 * A cycling badge would not do here: there are a dozen codes and the answer is
 * a set rather than one of them — "English or German" is the common case, not
 * an exotic one. So the badge opens this, and the codes are chips because a
 * column of checkboxes for eleven two-letter words is a lot of screen for very
 * little text.
 *
 * @returns the dialog
 */
export function WatchLanguageDialog({ languages, onClose, onSave }: WatchLanguageDialogProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();
    const labels = useWatchLanguageLabels();
    const [picked, setPicked] = useState<Array<string>>([]);

    // The dialog stays mounted, so it has to be pointed at whatever it opened on.
    useEffect(() => {
        setPicked(languages ?? []);
    }, [languages]);

    /**
     * Adds a code to the set, or takes it back out
     *
     * @param code the language being toggled
     */
    function toggle(code: string) {
        hapticTap();
        setPicked((held) => (held.includes(code) ? held.filter((kept) => kept !== code) : [...held, code]));
    }

    return (
        <Dialog open={languages !== null} onClose={onClose} size={"sm"}>
            <DialogTitle>{t("heading.languages")}</DialogTitle>
            <DialogBody className={"flex flex-col gap-3"}>
                <Text className={"text-sm"}>{t("description.languages")}</Text>

                {/* "Any" is the empty set rather than a twelfth chip beside the
                    others: it is the absence of a choice, and a chip that
                    silently clears its neighbours reads as one of them. */}
                <button
                    type={"button"}
                    aria-pressed={picked.length === 0}
                    onClick={() => {
                        hapticTap();
                        setPicked([]);
                    }}
                    className={clsx(
                        "flex min-h-10 items-center gap-2 rounded-(--radius-control) px-3 text-sm font-medium transition",
                        picked.length === 0
                            ? "bg-(--color-brand-600) text-white"
                            : "bg-zinc-950/5 text-zinc-700 hover:bg-zinc-950/10 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15",
                    )}
                >
                    {picked.length === 0 && <CheckIcon className={"size-4 shrink-0"} />}
                    {t("label.any-language")}
                </button>

                <div className={"flex flex-wrap gap-2"}>
                    {WATCH_LANGUAGES.map((code) => {
                        const on = picked.includes(code);
                        return (
                            <button
                                key={code}
                                type={"button"}
                                aria-pressed={on}
                                onClick={() => toggle(code)}
                                className={clsx(
                                    "flex min-h-9 items-center gap-1.5 rounded-(--radius-pill) px-3 text-sm font-medium transition",
                                    on
                                        ? "bg-(--color-brand-600) text-white"
                                        : "bg-zinc-950/5 text-zinc-700 hover:bg-zinc-950/10 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15",
                                )}
                            >
                                {on && <CheckIcon className={"size-4 shrink-0"} />}
                                {labels.language(code)}
                            </button>
                        );
                    })}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button color={"blue"} onClick={() => onSave(picked)}>
                    {t("button.save-entry")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
