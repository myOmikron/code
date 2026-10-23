import { Badge } from "components";
import { useTranslation } from "react-i18next";
import type { AdminOpenIdProvider } from "src/api/generated";

/**
 * The properties for {@link AdminLoginMethodBadge}
 */
export type AdminLoginMethodBadgeProps = {
    /** The OpenID provider of an External Account, nothing for a Local Account */
    openidProvider?: AdminOpenIdProvider | null;
};

/**
 * Whether an Account is local or external as a badge, an External Account with its OpenID provider
 *
 * @returns the badge
 */
export function AdminLoginMethodBadge({ openidProvider }: AdminLoginMethodBadgeProps) {
    const [t] = useTranslation("admin");
    return openidProvider ? (
        <Badge color={"purple"}>{t("label.login-external", { provider: openidProvider.display_name })}</Badge>
    ) : (
        <Badge color={"zinc"}>{t("label.login-local")}</Badge>
    );
}
