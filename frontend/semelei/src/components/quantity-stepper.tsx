import { MinusIcon, PlusIcon } from "@heroicons/react/16/solid";
import React from "react";
import { Button } from "components";

/**
 * The properties for {@link QuantityStepper}
 */
export type QuantityStepperProps = {
    /** Current quantity */
    quantity: number;
    /** Called with the new quantity (0 means "remove") */
    onChange: (quantity: number) => void;
    /** Stretch to the full width (− and + at the edges) — for card actions */
    wide?: boolean;
};

/**
 * Large-touch-target +/- stepper used in catalog and cart.
 *
 * Compact by default (for list rows); `wide` fills the width so it matches
 * a full-width button when used as a card's main action.
 *
 * @param props {@link QuantityStepperProps}
 *
 * @returns the stepper
 */
export function QuantityStepper(props: QuantityStepperProps) {
    return (
        <div className={props.wide ? "flex w-full items-center justify-between gap-2" : "flex items-center gap-2"}>
            <Button outline onClick={() => props.onChange(props.quantity - 1)}>
                <MinusIcon />
            </Button>
            <span className={"w-8 text-center text-base font-medium text-zinc-950 tabular-nums dark:text-white"}>
                {props.quantity}
            </span>
            <Button outline onClick={() => props.onChange(Math.min(props.quantity + 1, 99))}>
                <PlusIcon />
            </Button>
        </div>
    );
}
