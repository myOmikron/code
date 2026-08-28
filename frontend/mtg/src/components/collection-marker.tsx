import {
    ArchiveBoxIcon,
    ArrowsRightLeftIcon,
    BanknotesIcon,
    BoltIcon,
    BookOpenIcon,
    CircleStackIcon,
    CubeIcon,
    CubeTransparentIcon,
    EyeIcon,
    FireIcon,
    GiftIcon,
    HeartIcon,
    HomeIcon,
    LockClosedIcon,
    MapIcon,
    RectangleStackIcon,
    SparklesIcon,
    Squares2X2Icon,
    StarIcon,
    TagIcon,
    TrophyIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { COLLECTION_FILL, collectionColor, collectionIcon } from "src/utils/collection-style";
import type { CollectionIconName } from "src/utils/collection-style";

/** The pictograms behind the stable icon slugs stored in the database */
const ICONS = {
    box: ArchiveBoxIcon,
    binder: BookOpenIcon,
    shelf: Squares2X2Icon,
    deckbox: CubeIcon,
    cards: RectangleStackIcon,
    sealed: GiftIcon,
    bulk: CircleStackIcon,
    trade: ArrowsRightLeftIcon,
    money: BanknotesIcon,
    vault: LockClosedIcon,
    star: StarIcon,
    sparkles: SparklesIcon,
    trophy: TrophyIcon,
    heart: HeartIcon,
    fire: FireIcon,
    bolt: BoltIcon,
    land: MapIcon,
    token: CubeTransparentIcon,
    tag: TagIcon,
    home: HomeIcon,
    eye: EyeIcon,
} satisfies Record<CollectionIconName, typeof ArchiveBoxIcon>;

/** How much room the marker takes, and how big its pictogram is drawn */
const SIZE = {
    sm: { marker: "size-5", icon: "size-3" },
    md: { marker: "size-6", icon: "size-3.5" },
    lg: { marker: "size-8", icon: "size-4" },
    xl: { marker: "size-10", icon: "size-5" },
} as const;

/**
 * The properties for {@link CollectionIcon}
 */
export type CollectionIconProps = {
    /** The pictogram slug */
    icon: string;
    /** How the pictogram is drawn, size and ink included */
    className?: string;
};

/**
 * A collection's bare pictogram, without the coloured tile around it
 *
 * @returns the pictogram
 */
export function CollectionIcon({ icon, className }: CollectionIconProps) {
    const Icon = ICONS[collectionIcon(icon)];

    return <Icon aria-hidden={true} className={className} />;
}

/**
 * The properties for {@link CollectionMarker}
 */
export type CollectionMarkerProps = {
    /** The marker's colour slug */
    color: string;
    /** The pictogram slug */
    icon: string;
    /** How much room the marker gets */
    size?: keyof typeof SIZE;
    /** Extra classes for layout at its call site */
    className?: string;
};

/**
 * A collection's coloured circle with its pictogram inside.
 *
 * The same circle a deck tag wears, in the colour the collection's tile is
 * filled with, so picking one previews the other.
 *
 * @returns the marker
 */
export function CollectionMarker({ color, icon, size = "md", className }: CollectionMarkerProps) {
    const Icon = ICONS[collectionIcon(icon)];

    return (
        <span
            aria-hidden={true}
            className={clsx(
                "inline-flex shrink-0 items-center justify-center rounded-full text-white ring-1 ring-black/10",
                COLLECTION_FILL[collectionColor(color)],
                SIZE[size].marker,
                className,
            )}
        >
            <Icon className={SIZE[size].icon} />
        </span>
    );
}
