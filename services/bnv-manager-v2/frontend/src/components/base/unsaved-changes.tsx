import React from "react";
import { Block } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link BlockUnsavedChanges}
 */
export type BlockUnsavedChangesProps = {
    /** The condition to block navigation */
    condition: boolean;
};

/**
 * Block navigation on unsaved changes
 */
export default function BlockUnsavedChanges(props: BlockUnsavedChangesProps) {
    const [tg] = useTranslation();
    return (
        <Block
            withResolver={false}
            shouldBlockFn={() => {
                if (props.condition) {
                    return !window.confirm(tg("toast.unsaved-changes"));
                }
                return false;
            }}
        />
    );
}
