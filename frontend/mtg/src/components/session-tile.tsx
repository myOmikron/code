import { ArchiveBoxIcon } from "@heroicons/react/20/solid";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Strong, Text } from "components";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ScannerSessionResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import type { MenuAt } from "src/components/context-menu";

/**
 * The properties for {@link SessionTile}
 */
export type SessionTileProps = {
    /** The staging area */
    session: ScannerSessionResponse;
    /** What the session files into, empty when it has not been decided */
    destination?: string;
    /** Whether keyboard navigation currently points at this session */
    selected?: boolean;
    /** Records pointer or focus arriving on this session */
    onActivate?: () => void;
    /** Opens this session's menu, on right click or a long press */
    onMenu?: (session: ScannerSessionResponse, at: MenuAt) => void;
};

/**
 * One staging area on the shelf.
 *
 * A collection's tile is led by the cards in it. A session's cannot be: the point of a staging
 * area is that what is in it has not been decided yet — the printings may still be wrong, and
 * putting four of them across the top would be showing off a guess. So this one is led by its
 * marker and says the two numbers that matter, how many copies are waiting and where they are
 * headed.
 *
 * @returns the tile
 */
export function SessionTile({ session, destination, selected = false, onActivate, onMenu }: SessionTileProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const tile = useRef<HTMLLIElement>(null);
    // An empty box is not worth looking at, it is worth filling: opening one leads straight to the
    // camera. Both urls name the session, so the device follows the link rather than whatever it
    // was pointed at last.
    const empty = session.copies === 0;

    const trigger = onMenu === undefined ? {} : contextMenuTrigger((at) => onMenu(session, at));

    useEffect(() => {
        if (selected) tile.current?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    return (
        <li
            ref={tile}
            onMouseEnter={onActivate}
            {...trigger}
            className={clsx(
                "relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) transition",
                selected
                    ? "ring-2 ring-(--color-brand-500)"
                    : "ring-1 ring-zinc-950/5 hover:ring-zinc-950/15 dark:ring-white/10 dark:hover:ring-white/25",
                CONTEXT_MENU_TARGET,
            )}
        >
            <Link
                to={empty ? "/scan/live/$sessionUuid" : "/scan/staged/$sessionUuid"}
                params={{ sessionUuid: session.uuid }}
                className={"flex flex-col gap-3 p-4 focus:outline-none"}
                aria-label={session.name}
                onFocus={onActivate}
            >
                <div className={"flex items-center gap-3"}>
                    <CollectionMarker color={session.color} icon={session.icon} size={"lg"} />
                    <Strong className={"min-w-0 flex-1 truncate"}>{session.name}</Strong>
                </div>

                <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                    <span className={"tabular-nums"}>
                        {tg("label.cards", { count: session.copies, amount: session.copies })}
                    </span>
                    <span aria-hidden={true}>·</span>
                    <span className={"tabular-nums"}>{t("label.stack-count", { count: session.stacks })}</span>
                </Text>

                <Text className={"flex min-w-0 items-center gap-1.5"}>
                    <ArchiveBoxIcon className={"size-4 shrink-0 opacity-60"} />
                    <span className={"truncate"}>{destination ?? t("label.no-destination")}</span>
                </Text>
            </Link>
        </li>
    );
}
