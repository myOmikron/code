import clsx from "clsx";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link LifeTotal}
 */
export type LifeTotalProps = {
    /** Whose total it is, or nothing when there is no other tile to tell it from */
    name: string | undefined;
    /** Their current total */
    life: number;
    /** What the last few taps came to, gone once they have settled */
    delta: number | undefined;
};

/**
 * A player's total with their name over it and their last run of taps under it.
 *
 * Sized off the nearest container, which is the tile's frame when it stands
 * between the two life buttons and whatever box it is given otherwise; see the
 * note in the life tile on why every size carries two ceilings.
 *
 * @returns the total
 */
export function LifeTotal({ name, life, delta }: LifeTotalProps) {
    const [t] = useTranslation("game-utils");

    return (
        <div className={"flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[1cqh] overflow-hidden"}>
            {name !== undefined && (
                <h2
                    className={
                        "max-w-full truncate text-[min(11cqh,4cqw,0.95rem)] font-semibold tracking-wide text-white/80 @min-[22rem]:text-[min(11cqh,4cqw,1.9rem)]"
                    }
                >
                    {name}
                </h2>
            )}
            <strong
                aria-label={t("label.life", { count: life })}
                className={
                    "text-[min(46cqh,24cqw,6rem)] leading-none font-black tracking-tight tabular-nums @min-[22rem]:text-[min(46cqh,28cqw,12rem)]"
                }
            >
                {life}
            </strong>
            <span
                aria-hidden={true}
                className={clsx(
                    "rounded-(--radius-pill) bg-black/25 px-[2cqw] text-[min(14cqh,5cqw,0.85rem)] leading-tight font-bold text-white/90 tabular-nums transition-opacity @min-[22rem]:text-[min(14cqh,5cqw,1.7rem)]",
                    delta === undefined && "opacity-0",
                )}
            >
                {delta !== undefined && delta > 0 ? "+" : ""}
                {delta ?? 0}
            </span>
        </div>
    );
}
