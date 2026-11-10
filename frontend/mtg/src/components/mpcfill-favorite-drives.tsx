import { ChevronUpIcon, StarIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Description, Field, Label, Listbox, ListboxLabel, ListboxOption, Text } from "components";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link MpcFillFavoriteDrives}
 */
export type MpcFillFavoriteDrivesProps = {
    /** The starred drives, first one first */
    drives: Array<string>;
    /** The drives the order's art came from, to add from */
    known: Array<string>;
    /** Sets the starred drives */
    onChange: (drives: Array<string>) => void;
};

/**
 * The drives whose art comes first, in the reader's order.
 *
 * @returns the field
 */
export function MpcFillFavoriteDrives({ drives, known, onChange }: MpcFillFavoriteDrivesProps) {
    const [t] = useTranslation("game-utils");
    const addable = known.filter((source) => !drives.includes(source));

    /**
     * Moves a drive one place up
     *
     * @param at where it stands
     */
    function raise(at: number) {
        const next = [...drives];
        const [moved] = next.splice(at, 1);
        if (moved === undefined) return;
        next.splice(at - 1, 0, moved);
        onChange(next);
    }

    return (
        <Field>
            <Label>{t("label.favorite-drives")}</Label>
            <Description>{t("description.favorite-drives")}</Description>
            <div data-slot={"control"} className={"flex flex-col gap-2"}>
                {drives.length === 0 ? (
                    <Text className={"text-sm"}>{t("label.no-favorite-drives")}</Text>
                ) : (
                    <ul
                        className={
                            "divide-y divide-zinc-950/5 rounded-(--radius-control) ring-1 ring-zinc-950/10 dark:divide-white/5 dark:ring-white/10"
                        }
                    >
                        {drives.map((source, at) => (
                            <li key={source} className={"flex items-center gap-2 py-1 pr-1 pl-3"}>
                                <StarIcon className={"size-4 shrink-0 text-yellow-500 dark:text-yellow-400"} />
                                <span className={"min-w-0 flex-1 truncate text-sm text-zinc-950 dark:text-white"}>
                                    {source}
                                </span>
                                <Button
                                    plain={true}
                                    disabled={at === 0}
                                    onClick={() => raise(at)}
                                    aria-label={t("accessibility.raise-drive", { name: source })}
                                >
                                    <ChevronUpIcon />
                                </Button>
                                <Button
                                    plain={true}
                                    onClick={() => onChange(drives.filter((drive) => drive !== source))}
                                    aria-label={t("accessibility.unstar-drive", { name: source })}
                                >
                                    <XMarkIcon />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
                {addable.length > 0 && (
                    <Listbox<string | null>
                        value={null}
                        onChange={(source) => {
                            if (source !== null) onChange([...drives, source]);
                        }}
                        placeholder={t("label.add-drive")}
                        aria-label={t("label.add-drive")}
                    >
                        {addable.map((source) => (
                            <ListboxOption key={source} value={source}>
                                <ListboxLabel>{source}</ListboxLabel>
                            </ListboxOption>
                        ))}
                    </Listbox>
                )}
            </div>
        </Field>
    );
}
