import { Alert, AlertActions, AlertDescription, AlertTitle, Button, ProgressBar, Text } from "components";
import { useTranslation } from "react-i18next";
import type { ScanLoadProgress } from "src/scanner/scan-client";

/**
 * The properties for {@link ScanLoadGate}
 */
export type ScanLoadGateProps = {
    /** Transfer size of the index in bytes, 0 while it is not known yet */
    total: number;
    /** Whether the browser reports a connection that costs money by the megabyte */
    metered: boolean;
    /** Set once the download is under way */
    progress: ScanLoadProgress | null;
    error: string;
    onConfirm: () => void;
};

/**
 * Asks before spending someone's data, then shows where the download has got to.
 *
 * One alert for both steps rather than two: the question and the answer belong in the same place,
 * and swapping the whole view at the moment of consent loses the connection between the number
 * someone agreed to and the bar that fills up to it.
 *
 * @returns the alert
 */
export function ScanLoadGate({ total, metered, progress, error, onConfirm }: ScanLoadGateProps) {
    const [t, { language }] = useTranslation("scan");
    const megabytes = (bytes: number) =>
        new Intl.NumberFormat(language, { maximumFractionDigits: bytes < 10e6 ? 1 : 0 }).format(bytes / 1e6);
    const share = progress && progress.total > 0 ? Math.min(1, progress.loaded / progress.total) : 0;

    return (
        <Alert open onClose={() => undefined}>
            <AlertTitle>{t("heading.load-card-data")}</AlertTitle>
            <AlertDescription>{t("description.load-card-data")}</AlertDescription>

            {metered && !progress ? <Text className="mt-4">{t("description.metered-connection")}</Text> : null}
            {error ? <Text className="mt-4 text-red-600 dark:text-red-400">{error}</Text> : null}

            {progress ? (
                <div className="mt-6 flex flex-col gap-2">
                    <ProgressBar progress={progress.stage === "model" ? 100 : share * 100} />
                    <div className="flex items-baseline justify-between gap-3">
                        <Text className="text-xs">{t(`label.stage-${progress.stage}`)}</Text>
                        <Text className="font-mono text-xs">
                            {progress.stage === "model"
                                ? progress.detail
                                : t("label.megabytes-of", {
                                      done: megabytes(progress.loaded),
                                      total: megabytes(progress.total),
                                  })}
                        </Text>
                    </div>
                </div>
            ) : (
                <AlertActions>
                    <Button disabled={total <= 0} onClick={onConfirm}>
                        {t("button.load-card-data")}
                    </Button>
                    {total > 0 ? (
                        <Text className="font-mono">{t("label.megabytes", { size: megabytes(total) })}</Text>
                    ) : null}
                </AlertActions>
            )}
        </Alert>
    );
}
