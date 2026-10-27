import * as Headless from "@headlessui/react";
import type React from "react";
import clsx from "clsx";
import { TileContent, type TileContentProps, tileClassName, tileGroupClassName } from "./checkbox-tile";

/**
 * The properties for {@link RadioTileGroup}
 */
export type RadioTileGroupProps<T> = {
    /** The selected value, `null` while none is */
    value: T | null;
    /** Called with the newly selected value */
    onChange: (value: T) => void;
    /** The tiles can't be selected right now */
    disabled?: boolean;
    /** Additional CSS classes */
    className?: string;
    /** The {@link RadioTile}s */
    children: React.ReactNode;
};

/**
 * A grid of {@link RadioTile}s of which one can be selected
 *
 * @example
 * ```tsx
 * <RadioTileGroup value={size} onChange={setSize}>
 *   <RadioTile value={"small"} icon={<UserIcon />} label="1–20" />
 *   <RadioTile value={"large"} icon={<UserGroupIcon />} label="More than 20" />
 * </RadioTileGroup>
 * ```
 */
export function RadioTileGroup<T>(props: RadioTileGroupProps<T>) {
    return (
        <Headless.RadioGroup
            data-slot="control"
            value={props.value as T}
            onChange={props.onChange}
            disabled={props.disabled}
            className={clsx(props.className, tileGroupClassName)}
        >
            {props.children}
        </Headless.RadioGroup>
    );
}

/**
 * The properties for {@link RadioTile}
 */
export type RadioTileProps<T> = TileContentProps & {
    /** The value selecting this tile yields */
    value: T;
};

/**
 * A large, clickable radio button showing an icon above its label; place it in a {@link RadioTileGroup}
 */
export function RadioTile<T>(props: RadioTileProps<T>) {
    return (
        <Headless.Field>
            <Headless.Radio value={props.value} className={tileClassName}>
                <TileContent icon={props.icon} label={props.label} />
            </Headless.Radio>
        </Headless.Field>
    );
}
