import { CameraIcon, RectangleStackIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, HeadingLayout, PrimaryButton } from "components";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePendingScans } from "src/context/pending-scans-context";
import { inspectScanDownload, loadScanner } from "src/scanner/scan-client";
import { loadScanLanguage } from "src/utils/scan-language";

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

    // Nobody comes to this page to read it. It is one button, and behind that button is a worker
    // that is a 16 MB bundle before it has done anything, an inference session over an 85 MB
    // model, and a catalogue of 450000 printings to parse — seconds of work that used to start
    // only once the scanner itself was on screen, with someone watching it.
    //
    // So it starts here, while the button is still being reached for, and the scanner joins the
    // load already running instead of starting one of its own. Only when the files are already on
    // the device: what may not happen here is a download, which costs someone's data and is
    // theirs to agree to on the screen that states the size.
    useEffect(() => {
        let cancelled = false;
        void inspectScanDownload()
            .then((download) => {
                if (cancelled || !download.cached) return;
                // Errors belong to the scanner's own load, which reports them where they can be
                // read. Here there is nothing to say and nobody waiting on an answer.
                void loadScanner(undefined, loadScanLanguage()).catch(() => undefined);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

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
