import { EmptyState } from "components";
import { useTranslation } from "react-i18next";

/**
 * The beamer screen for a retired or mistyped join code
 *
 * @returns the empty state
 */
export function DisplayNotFound() {
    const [t] = useTranslation("tournament");

    return (
        <div className={"flex min-h-svh items-center justify-center bg-(--surface-page) p-8"}>
            <EmptyState title={t("error.unknown-code")} />
        </div>
    );
}
