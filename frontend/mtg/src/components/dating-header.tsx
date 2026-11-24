import {
    AdjustmentsHorizontalIcon,
    ArrowLeftIcon,
    ChatBubbleLeftRightIcon,
    UserCircleIcon,
} from "@heroicons/react/20/solid";
import { Button, Heading } from "components";
import { useTranslation } from "react-i18next";
import type { DatingCardResponse } from "src/api/generated";
import { DatingColorFilter } from "src/components/dating-color-filter";
import { DatingPolyToggle } from "src/components/dating-poly-toggle";
import { DatingSetFilter } from "src/components/dating-set-filter";
import type { Color, ColorChoice } from "src/utils/dating";

/**
 * The properties for {@link DatingHeader}
 */
export type DatingHeaderProps = {
    /** The lead whose second Commander is swiped, `undefined` outside the partner stack */
    pairing?: { lead: DatingCardResponse | null; onLeave: () => void };
    /** Hide the filters until the profile questions are answered */
    profileNeeded: boolean;
    colors: ReadonlyMap<Color, ColorChoice>;
    onToggleColor: (color: Color) => void;
    sets: string[];
    onSets: (sets: string[]) => void;
    /** Whether the set picker is open, so the page can mute its shortcuts */
    onPicking: (picking: boolean) => void;
    poly: boolean;
    onPoly: (poly: boolean) => void;
    /** Open the filter sheet */
    onFilters: () => void;
};

/**
 * The swipe page's header: the title, the filters inline on desktop, and the filter, profile and matches buttons.
 *
 * @returns the header
 */
export function DatingHeader(props: DatingHeaderProps) {
    const { pairing, profileNeeded, colors, onToggleColor, sets, onSets, onPicking, poly, onPoly, onFilters } = props;
    const [t] = useTranslation("dating");
    const narrowed = colors.size > 0 || sets.length > 0 || poly;
    const lead = pairing?.lead ?? null;

    return (
        <header className={"flex items-center gap-1 lg:gap-5"}>
            {pairing ? (
                <div className={"flex min-w-0 flex-1 items-center gap-2"}>
                    <Button plain={true} onClick={pairing.onLeave} aria-label={t("button.back-to-commanders")}>
                        <ArrowLeftIcon />
                    </Button>
                    {lead !== null && (
                        <>
                            <span
                                className={"size-9 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"}
                            >
                                {lead.image_art_crop && (
                                    <img
                                        src={lead.image_art_crop}
                                        alt={""}
                                        crossOrigin={"anonymous"}
                                        className={"size-full object-cover object-[center_35%]"}
                                    />
                                )}
                            </span>
                            <Heading compact={true} className={"min-w-0 truncate"}>
                                {t(`heading.find-${(lead.seeks ?? "Partner").toLowerCase()}`, { name: lead.name })}
                            </Heading>
                        </>
                    )}
                </div>
            ) : (
                <Heading compact={true} className={"min-w-0 flex-1 truncate pl-1 lg:pl-0"}>
                    {t("heading.title")}
                </Heading>
            )}
            {!profileNeeded && (
                <div className={"hidden items-center gap-5 lg:flex"}>
                    <DatingColorFilter choices={colors} onToggle={onToggleColor} />
                    {!pairing && (
                        <>
                            <DatingSetFilter sets={sets} onSets={onSets} onPicking={onPicking} />
                            <DatingPolyToggle poly={poly} onPoly={onPoly} />
                        </>
                    )}
                    <span aria-hidden={true} className={"h-6 w-px bg-zinc-950/10 dark:bg-white/10"} />
                </div>
            )}
            <div className={"flex shrink-0 items-center"}>
                {!profileNeeded && (
                    <Button
                        plain={true}
                        className={"relative"}
                        aria-label={t("button.filters")}
                        title={t("button.filters")}
                        onClick={onFilters}
                    >
                        <AdjustmentsHorizontalIcon />
                        {narrowed && (
                            <span
                                aria-hidden={true}
                                className={"absolute top-1.5 right-1.5 size-2 rounded-full bg-lime-500 lg:hidden"}
                            />
                        )}
                    </Button>
                )}
                <Button plain={true} href={"/dating/profile"} aria-label={t("button.profile")}>
                    <UserCircleIcon />
                </Button>
                <Button plain={true} href={"/dating/matches"} aria-label={t("button.matches")}>
                    <ChatBubbleLeftRightIcon />
                </Button>
            </div>
        </header>
    );
}
