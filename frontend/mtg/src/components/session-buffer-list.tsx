import { ArrowPathIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Text } from "components";
import { useTranslation } from "react-i18next";
import { CardThumbnail } from "src/components/card-thumbnail";
import { usePendingScans } from "src/context/pending-scans-context";
import { groupPendingScans } from "src/utils/pending-scans";

/**
 * What the device has scanned and the server has not taken yet.
 *
 * Shown rather than merely counted, because otherwise a phone with no signal — which is where a
 * scanner is used — reads as a scanner that is losing cards. These rows are deliberately thinner
 * than the staged ones: a copy can be dropped, and everything else waits until the card is a
 * stack the desk can see too, which is a second after the signal comes back.
 *
 * @returns the list, or nothing when the buffer is empty
 */
export function SessionBufferList() {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const { scans, removeMany } = usePendingScans();
    const groups = groupPendingScans(scans);
    if (groups.length === 0) return null;

    return (
        <div>
            <Text className="flex items-center gap-1.5">
                <ArrowPathIcon className="size-4 animate-spin" />
                {t("label.unsynced", { count: scans.length, amount: scans.length })}
            </Text>
            <ul className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/10">
                {groups.map((group) => (
                    <li key={`${group.card.id}-${group.foil}`} className="flex items-center gap-3 py-2">
                        <CardThumbnail
                            name={group.card.name}
                            image={group.card.imageUrl}
                            finish={group.foil ? "Foil" : "Nonfoil"}
                            compact
                            className="w-10 shrink-0 overflow-hidden rounded-md"
                        />
                        <div className="min-w-0 flex-1">
                            <Text className="truncate">{group.card.name}</Text>
                            <Text className="truncate font-mono text-xs">
                                {`${group.card.setCode.toUpperCase()} ${group.card.collectorNumber}`}
                            </Text>
                        </div>
                        {group.foil && <Badge color="blue">{tg("label.foil")}</Badge>}
                        <Badge>{group.ids.length}</Badge>
                        <Button
                            plain
                            aria-label={t("accessibility.remove", { name: group.card.name })}
                            onClick={() => removeMany(group.ids)}
                        >
                            <TrashIcon className="size-5" />
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
