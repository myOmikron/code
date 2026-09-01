import { CameraIcon, RectangleStackIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, HeadingLayout, PrimaryButton } from "components";
import { useTranslation } from "react-i18next";
import { usePendingScans } from "src/context/pending-scans-context";

export const Route = createFileRoute("/_collect/scan/")({ component: ScanStartRoute });

/**
 * The way into scanning, and back out of it.
 *
 * It used to be step one of the flow, where the sets to search were chosen before the camera
 * opened. That choice now lives in the scanner's own settings, where it can be changed while a box
 * is being sorted rather than only before it starts, so nothing is left to decide here.
 *
 * @returns the page
 */
function ScanStartRoute() {
    const [t] = useTranslation("scan");
    const navigate = useNavigate();
    const { scans } = usePendingScans();

    return (
        <main className="min-h-svh px-5 py-8 lg:mx-auto lg:max-w-220 lg:px-12 lg:py-10">
            <HeadingLayout heading={t("heading.scan")} headingDescription={t("description.scan")}>
                <div className="mt-6 flex flex-col gap-3">
                    <PrimaryButton className="w-full" onClick={() => void navigate({ to: "/scan/live" })}>
                        <CameraIcon className="size-5" />
                        {t("button.start-scanning")}
                    </PrimaryButton>

                    {scans.length > 0 ? (
                        <Button outline className="w-full" onClick={() => void navigate({ to: "/liste" })}>
                            <RectangleStackIcon className="size-5" />
                            {t("heading.staged", { count: scans.length })}
                        </Button>
                    ) : null}

                    <Button plain className="w-full" onClick={() => void navigate({ to: "/scan/neu" })}>
                        {t("button.new-scanner-bench")}
                    </Button>
                </div>
            </HeadingLayout>
        </main>
    );
}
