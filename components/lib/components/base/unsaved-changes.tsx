import { Block } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link BlockUnsavedChanges}
 */
export type BlockUnsavedChangesProps = {
    /** The condition to block navigation */
    condition: boolean;
    /** Allow navigation that only changes the search params, e.g. between the steps of a Wizard */
    ignoreSearchChanges?: boolean;
};

/**
 * Block navigation on unsaved changes
 */
export default function BlockUnsavedChanges(props: BlockUnsavedChangesProps) {
    const [tg] = useTranslation();
    return (
        <Block
            withResolver={false}
            enableBeforeUnload={props.condition}
            shouldBlockFn={({ current, next }) => {
                if (props.ignoreSearchChanges && current.pathname === next.pathname) return false;
                if (props.condition) {
                    // eslint-disable-next-line no-alert
                    return !window.confirm(tg("toast.unsaved-changes"));
                }
                return false;
            }}
        />
    );
}
