import { ChevronRightIcon, MagnifyingGlassIcon, Square3Stack3DIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle, Button, HeadingLayout, Text } from "components";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SetPicker } from "src/components/set-picker";
import { useCardIndex } from "src/context/card-index-context";
import { useScanScope } from "src/context/scan-scope-context";

export const Route = createFileRoute("/_collect/scan/")({ component: ScanScopeRoute });

/**
 * Step one of scanning: decide what the scanner searches, before the camera opens.
 *
 * Narrowing to the releases actually being sorted is not just tidier — routes outside the
 * selection are never scored, which is both faster and removes a whole class of wrong matches.
 *
 * @returns the page
 */
function ScanScopeRoute() {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { status, progress, cardCount, sets } = useCardIndex();
    const { codes, choose } = useScanScope();
    const [pickerOpen, setPickerOpen] = useState(false);

    const ready = status === "ready";
    const scopedCards = useMemo(() => {
        if (codes.length === 0) return cardCount;
        const chosen = new Set(codes.map((code) => code.toUpperCase()));
        return sets.reduce((sum, set) => sum + (chosen.has(set.code.toUpperCase()) ? set.cardCount : 0), 0);
    }, [codes, sets, cardCount]);

    /**
     * Stores the chosen scope and opens the camera
     *
     * @param next the selected set codes; empty means every set
     */
    function start(next: string[]) {
        choose(next);
        void navigate({ to: "/scan/live" });
    }

    return (
        <main className="min-h-svh px-5 py-8 lg:mx-auto lg:max-w-220 lg:px-12 lg:py-10">
            <HeadingLayout heading={t("heading.what-to-scan")} headingDescription={t("description.scope")}>
                {/* The count belongs beside the button, not inside it: a Button fills with its colour,
                    and Text's muted grey is unreadable on the lime fill. */}
                <div className="mt-6 grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                        <Button color="lime" className="w-full" disabled={!ready} onClick={() => start([])}>
                            <Square3Stack3DIcon className="size-5" />
                            {t("button.all-sets")}
                        </Button>
                        <Text className="text-center">
                            {ready
                                ? tg("label.cards", { count: cardCount, amount: cardCount.toLocaleString("de-DE") })
                                : progress}
                        </Text>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Button outline className="w-full" disabled={!ready} onClick={() => setPickerOpen(true)}>
                            <MagnifyingGlassIcon className="size-5" />
                            {t("button.choose-sets")}
                        </Button>
                        <Text className="text-center">
                            {codes.length > 0
                                ? t("label.sets-with-cards", {
                                      sets: codes.length,
                                      cards: scopedCards.toLocaleString("de-DE"),
                                  })
                                : t("label.narrow-to-release")}
                        </Text>
                    </div>
                </div>

                {codes.length > 0 && (
                    <Button outline className="mt-4 w-full" disabled={!ready} onClick={() => start(codes)}>
                        {t("button.continue-with-selection")} <ChevronRightIcon className="size-5" />
                    </Button>
                )}

                {status === "error" && (
                    <Alert open onClose={() => undefined} className="mt-6">
                        <AlertTitle>{t("heading.index-not-loaded")}</AlertTitle>
                        <AlertDescription>{t("description.index-not-loaded")}</AlertDescription>
                    </Alert>
                )}
            </HeadingLayout>

            <SetPicker
                open={pickerOpen}
                sets={sets}
                initialSelection={codes}
                onCancel={() => setPickerOpen(false)}
                onConfirm={start}
            />
        </main>
    );
}
