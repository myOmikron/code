import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Text } from "components";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProxySheet } from "src/components/proxy-sheet";
import type { ProxyGroupSheets } from "src/utils/proxy-list";
import type { ProxyFace } from "src/utils/proxy-print";

/** How far a finger has to travel to turn the page, in pixels */
const SWIPE = 50;

/**
 * The properties for {@link ProxySheetPager}
 */
export type ProxySheetPagerProps = {
    /** The sheets, one array of pictures each */
    sheets: Array<Array<ProxyFace>>;
    /** Whether a hairline is drawn around each card */
    cutLines: boolean;
    /** Where each group lands on the sheets */
    spans: Array<ProxyGroupSheets>;
};

/**
 * The sheets, one at a time, the way a pdf reader shows them.
 *
 * @returns the page on show, its thumbnails and where each deck starts
 */
export function ProxySheetPager({ sheets, cutLines, spans }: ProxySheetPagerProps) {
    const [t] = useTranslation("game-utils");
    const [wanted, setWanted] = useState(0);
    const strip = useRef<HTMLOListElement>(null);
    const thumbnails = useRef<Array<HTMLButtonElement | null>>([]);
    const touch = useRef<{ x: number; y: number } | null>(null);

    // The list can shrink under the page on show.
    const page = Math.min(wanted, sheets.length - 1);
    const sheet = sheets[page];

    /**
     * Turns to a sheet, if there is one
     *
     * @param next the sheet, counted from 0
     */
    function turnTo(next: number) {
        if (next < 0 || next >= sheets.length) return;
        setWanted(next);

        // By hand: scrollIntoView would move the page along with the strip.
        const thumbnail = thumbnails.current[next]?.getBoundingClientRect();
        const row = strip.current?.getBoundingClientRect();
        if (thumbnail !== undefined && row !== undefined) {
            strip.current?.scrollBy({ left: thumbnail.left + thumbnail.width / 2 - (row.left + row.width / 2) });
        }
    }

    return (
        <div className={"flex flex-col gap-3"}>
            <div
                role={"group"}
                tabIndex={0}
                aria-label={t("accessibility.sheet-preview")}
                className={"flex items-center justify-center gap-1 rounded-(--radius-control)"}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") turnTo(page - 1);
                    if (event.key === "ArrowRight") turnTo(page + 1);
                }}
                onTouchStart={(event) => {
                    const start = event.touches[0];
                    touch.current = start === undefined ? null : { x: start.clientX, y: start.clientY };
                }}
                onTouchEnd={(event) => {
                    const end = event.changedTouches[0];
                    const start = touch.current;
                    touch.current = null;
                    if (start === null || end === undefined) return;

                    const x = end.clientX - start.x;
                    if (Math.abs(x) < SWIPE || Math.abs(x) < Math.abs(end.clientY - start.y)) return;
                    turnTo(page + (x < 0 ? 1 : -1));
                }}
            >
                <Button
                    plain={true}
                    aria-label={t("accessibility.previous-sheet")}
                    disabled={page === 0}
                    onClick={() => turnTo(page - 1)}
                >
                    <ChevronLeftIcon />
                </Button>
                {/* Fits the sticky column on a short screen: 0.707 is a sheet's width over its height. */}
                <div className={"w-full max-w-[390px] min-w-0 flex-1 lg:max-w-[min(390px,calc((100dvh-20rem)*0.707))]"}>
                    {sheet !== undefined && <ProxySheet faces={sheet} cutLines={cutLines} mode={"screen"} />}
                </div>
                <Button
                    plain={true}
                    aria-label={t("accessibility.next-sheet")}
                    disabled={page === sheets.length - 1}
                    onClick={() => turnTo(page + 1)}
                >
                    <ChevronRightIcon />
                </Button>
            </div>

            <ol ref={strip} className={"flex gap-1.5 overflow-x-auto p-1"}>
                {sheets.map((faces, index) => (
                    <li key={index} className={"shrink-0"}>
                        <button
                            ref={(button) => {
                                thumbnails.current[index] = button;
                            }}
                            type={"button"}
                            aria-label={t("accessibility.show-sheet", { number: index + 1 })}
                            aria-current={index === page ? "page" : undefined}
                            onClick={() => turnTo(index)}
                            className={"flex w-11 flex-col items-center gap-0.5"}
                        >
                            <span
                                className={clsx(
                                    "block w-full",
                                    index === page && "outline-2 outline-offset-1 outline-(--color-accent)",
                                )}
                            >
                                <ProxySheet faces={faces} cutLines={false} mode={"screen"} />
                            </span>
                            <span className={"text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>{index + 1}</span>
                        </button>
                    </li>
                ))}
            </ol>

            {spans.length > 1 && (
                <ul className={"flex flex-wrap gap-x-4 gap-y-1"}>
                    {spans.map(({ group, first, last }) => (
                        <li key={group.deck?.uuid ?? "hand"}>
                            <button type={"button"} className={"min-h-9 text-left"} onClick={() => turnTo(first)}>
                                <Text className={"text-xs"}>
                                    <span className={"font-medium text-zinc-950 dark:text-white"}>
                                        {group.deck?.name ?? t("label.hand-picked")}
                                    </span>{" "}
                                    {first === last
                                        ? t("label.sheet-number", { number: first + 1 })
                                        : t("label.sheet-range", { first: first + 1, last: last + 1 })}
                                </Text>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
