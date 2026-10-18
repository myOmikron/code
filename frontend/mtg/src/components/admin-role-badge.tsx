import { Badge } from "components";
import { useTranslation } from "react-i18next";
import { Role } from "src/api/generated";

/**
 * The properties for {@link AdminRoleBadge}
 */
export type AdminRoleBadgeProps = {
    /** The Role to show */
    role: Role;
};

/**
 * An Account's Role as a badge, Admins stand out
 *
 * @returns the badge
 */
export function AdminRoleBadge({ role }: AdminRoleBadgeProps) {
    const [t] = useTranslation("admin");
    return role === Role.Admin ? (
        <Badge color={"blue"}>{t("label.role-admin")}</Badge>
    ) : (
        <Badge color={"zinc"}>{t("label.role-member")}</Badge>
    );
}
