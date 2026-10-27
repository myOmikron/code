import * as Headless from "@headlessui/react";
import clsx from "clsx";
import type React from "react";

/** Classes of a selectable tile; the selected state comes from headlessui's `data-checked` */
export const tileClassName = clsx(
    "group relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-(--radius-card) px-3 pt-5 pb-4 text-center transition-colors duration-150",
    "border border-zinc-950/10 bg-white text-zinc-500 data-hover:border-zinc-950/20 data-hover:text-zinc-700",
    "dark:border-white/10 dark:bg-white/2.5 dark:text-zinc-400 dark:data-hover:border-white/20 dark:data-hover:text-zinc-200",
    "data-checked:border-(--color-brand-500) data-checked:bg-(--color-brand-50) data-checked:text-(--color-brand-700)",
    "dark:data-checked:border-(--color-brand-400)/50 dark:data-checked:bg-(--color-brand-900)/40 dark:data-checked:text-(--color-brand-200)",
    "data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500",
    "data-disabled:cursor-default data-disabled:opacity-50",
);

/**
 * The properties for {@link TileContent}
 */
export type TileContentProps = {
    /** An icon drawn in the current text color, 32px; without one the tile shows only its label */
    icon?: React.ReactNode;
    /** What the tile stands for */
    label: string;
};

/**
 * The inside of a selectable tile: a check mark in the corner once selected, the icon and the label
 */
export function TileContent(props: TileContentProps) {
    return (
        <>
            <span
                aria-hidden={"true"}
                className={clsx(
                    "absolute top-2 right-2 flex size-4 items-center justify-center rounded-full transition",
                    "border border-zinc-950/15 dark:border-white/20",
                    "group-data-checked:border-transparent group-data-checked:bg-(--color-brand-600)",
                )}
            >
                <svg
                    className={"size-2.5 stroke-white opacity-0 group-data-checked:opacity-100"}
                    viewBox={"0 0 14 14"}
                    fill={"none"}
                >
                    <path d={"M3 8L6 11L11 3.5"} strokeWidth={2.5} strokeLinecap={"round"} strokeLinejoin={"round"} />
                </svg>
            </span>
            {props.icon && (
                <span
                    aria-hidden={"true"}
                    className={"flex size-8 items-center justify-center *:size-8 *:fill-current"}
                >
                    {props.icon}
                </span>
            )}
            <Headless.Label
                passive={true}
                className={clsx(
                    "text-sm/5 font-medium text-balance text-zinc-950 dark:text-white",
                    "group-data-checked:text-(--color-brand-800) dark:group-data-checked:text-white",
                )}
            >
                {props.label}
            </Headless.Label>
        </>
    );
}

/** Classes of a grid of tiles */
export const tileGroupClassName = "grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]";

/**
 * A grid of {@link CheckboxTile}s
 *
 * @example
 * ```tsx
 * <CheckboxTileGroup>
 *   <CheckboxTile checked={windows} onChange={setWindows} icon={<WindowsIcon />} label="Windows" />
 *   <CheckboxTile checked={linux} onChange={setLinux} icon={<LinuxIcon />} label="Linux" />
 * </CheckboxTileGroup>
 * ```
 */
export function CheckboxTileGroup(props: React.ComponentPropsWithoutRef<"div">) {
    const { className, ...rest } = props;
    return <div data-slot="control" role="group" {...rest} className={clsx(className, tileGroupClassName)} />;
}

/**
 * The properties for {@link CheckboxTile}
 */
export type CheckboxTileProps = TileContentProps & {
    /** Whether the tile is checked */
    checked: boolean;
    /** Called with the new state when the tile is toggled */
    onChange: (checked: boolean) => void;
    /** The tile can't be toggled right now */
    disabled?: boolean;
};

/**
 * A large, clickable checkbox showing an icon above its label; several tiles of a group can be checked
 */
export function CheckboxTile(props: CheckboxTileProps) {
    return (
        <Headless.Field disabled={props.disabled}>
            <Headless.Checkbox checked={props.checked} onChange={props.onChange} className={tileClassName}>
                <TileContent icon={props.icon} label={props.label} />
            </Headless.Checkbox>
        </Headless.Field>
    );
}
