import {
    ArchiveBoxIcon,
    ArrowPathIcon,
    ArrowTrendingUpIcon,
    BookOpenIcon,
    BoltIcon,
    BugAntIcon,
    CircleStackIcon,
    CubeTransparentIcon,
    FireIcon,
    HeartIcon,
    LinkIcon,
    MagnifyingGlassIcon,
    MapIcon,
    PlusCircleIcon,
    PuzzlePieceIcon,
    RectangleStackIcon,
    RocketLaunchIcon,
    ScissorsIcon,
    ShieldCheckIcon,
    SparklesIcon,
    StarIcon,
    TagIcon,
    TrophyIcon,
    UserGroupIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { TAG_DOT, tagColor, tagIcon } from "src/utils/deck-tags";
import type { TagColor, TagIconName } from "src/utils/deck-tags";

/** The pictograms behind the stable icon slugs stored in the database */
const ICONS = {
    tag: TagIcon,
    cards: RectangleStackIcon,
    ramp: ArrowTrendingUpIcon,
    bolt: BoltIcon,
    fire: FireIcon,
    search: MagnifyingGlassIcon,
    puzzle: PuzzlePieceIcon,
    trophy: TrophyIcon,
    shield: ShieldCheckIcon,
    heart: HeartIcon,
    star: StarIcon,
    sparkles: SparklesIcon,
    mana: CircleStackIcon,
    graveyard: ArchiveBoxIcon,
    recursion: ArrowPathIcon,
    token: CubeTransparentIcon,
    sacrifice: ScissorsIcon,
    combo: LinkIcon,
    counters: PlusCircleIcon,
    land: MapIcon,
    creature: BugAntIcon,
    spells: BookOpenIcon,
    combat: RocketLaunchIcon,
    politics: UserGroupIcon,
} satisfies Record<TagIconName, typeof TagIcon>;

/** Ink with enough contrast on each marker colour */
const INK: Record<TagColor, string> = {
    zinc: "text-white",
    red: "text-white",
    orange: "text-zinc-950",
    amber: "text-zinc-950",
    lime: "text-zinc-950",
    emerald: "text-white",
    teal: "text-white",
    cyan: "text-zinc-950",
    blue: "text-white",
    indigo: "text-white",
    violet: "text-white",
    fuchsia: "text-white",
    pink: "text-white",
};

const SIZE = {
    sm: { marker: "size-4", icon: "size-2.5" },
    md: { marker: "size-5", icon: "size-3" },
    lg: { marker: "size-6", icon: "size-3.5" },
} as const;

/** The properties for {@link DeckTagMarker} */
export type DeckTagMarkerProps = {
    /** The marker's colour slug */
    color: string;
    /** The pictogram slug */
    icon: string;
    /** How much room the marker gets */
    size?: keyof typeof SIZE;
    /** Extra classes for layout at its call site */
    className?: string;
};

/** A tag's coloured circle with its pictogram inside */
export function DeckTagMarker({ color, icon, size = "md", className }: DeckTagMarkerProps) {
    const resolvedColor = tagColor(color);
    const Icon = ICONS[tagIcon(icon)];

    return (
        <span
            aria-hidden={true}
            className={clsx(
                "inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-black/10",
                TAG_DOT[resolvedColor],
                INK[resolvedColor],
                SIZE[size].marker,
                className,
            )}
        >
            <Icon className={SIZE[size].icon} />
        </span>
    );
}
