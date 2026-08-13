import i18next from "i18next";

import { OrderLanguage } from "src/api/generated";

/**
 * The language the shop is currently shown in, as the API spells it.
 *
 * Sent along with an order: the binding confirmation is written by the
 * deadline job, long after the browser that could have told us is gone.
 *
 * @returns the order's language
 */
export function orderLanguage(): OrderLanguage {
    return i18next.language?.startsWith("en") ? "En" : "De";
}
