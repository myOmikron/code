import React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "components";

/**
 * Badge marking an order whose customer wants to pick it up early in the day
 *
 * @returns the badge
 */
export function EarlyPickupBadge() {
    const [tg] = useTranslation();
    return <Badge color={"sky"}>{tg("label.early-pickup")}</Badge>;
}
