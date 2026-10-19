import React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "components";

/**
 * The properties for {@link NewsPostStateBadge}
 */
export type NewsPostStateBadgeProps = {
    /** The News Post's publication time, unset for a Draft */
    publishedAt?: string | null;
};

/**
 * Whether a News Post is a Draft or Published
 *
 * @param props {@link NewsPostStateBadgeProps}
 *
 * @returns the badge
 */
export function NewsPostStateBadge(props: NewsPostStateBadgeProps) {
    const [t] = useTranslation("admin");
    return props.publishedAt ? (
        <Badge color={"green"}>{t("label.published")}</Badge>
    ) : (
        <Badge color={"zinc"}>{t("label.draft")}</Badge>
    );
}
