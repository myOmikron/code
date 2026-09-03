import { Button, Description, Dialog, DialogActions, DialogBody, DialogTitle, Field, Label, Select } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SetPicker } from "src/components/set-picker";
import { listScanSets } from "src/scanner/scan-client";
import type { ScanLanguageChoice } from "src/scanner/scan-client";
import { CARD_LANGUAGES } from "src/utils/card-languages";
import type { IndexedSet } from "src/utils/set-families";
import type { Camera } from "src/utils/use-camera";

/**
 * The properties for {@link ScanSettingsSheet}
 */
export type ScanSettingsSheetProps = {
    open: boolean;
    onClose: () => void;
    camera: Camera;
    language: ScanLanguageChoice;
    onLanguage: (choice: ScanLanguageChoice) => void;
    /** Set codes the scan is narrowed to; empty means every set */
    sets: string[];
    onSets: (codes: string[]) => void;
};

/**
 * What the scanner is set to, reachable from the scanner itself.
 *
 * Here rather than in the app's global settings: these are noticed to be wrong while a box is
 * being sorted, which is exactly when a different screen is furthest away.
 *
 * @returns the dialog
 */
export function ScanSettingsSheet({
    open,
    onClose,
    camera,
    language,
    onLanguage,
    sets,
    onSets,
}: ScanSettingsSheetProps) {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const [known, setKnown] = useState<IndexedSet[]>([]);
    const [picking, setPicking] = useState(false);

    // Read from the catalogue that is already loaded, and only once the dialog is opened. The list
    // the scanner used to offer came from an index that no longer exists, so the set filter had
    // nothing to choose between and quietly narrowed nothing.
    useEffect(() => {
        if (!open || known.length > 0) return;
        let cancelled = false;
        void listScanSets()
            .then((found) => {
                if (!cancelled) setKnown(found);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [open, known.length]);

    return (
        <>
            <Dialog open={open} onClose={onClose} size={"lg"}>
                <DialogTitle>{t("heading.scan-settings")}</DialogTitle>
                <DialogBody>
                    <div className="flex flex-col gap-6">
                        <Field>
                            <Label>{t("label.card-language")}</Label>
                            <Description>{t("description.card-language")}</Description>
                            {/* Their own names, so a Japanese stack is found under 日本語 rather
                                than under a translation of it. */}
                            <Select
                                value={language}
                                onChange={(event) => onLanguage(event.target.value as ScanLanguageChoice)}
                            >
                                <option value="auto">{t("label.language-auto")}</option>
                                {CARD_LANGUAGES.map((entry) => (
                                    <option key={entry.code} value={entry.code}>
                                        {entry.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field>
                            <Label>{t("label.camera")}</Label>
                            <Description>{t("description.camera")}</Description>
                            {/* Empty until a camera has been allowed: a browser withholds the
                                labels until then, and a list of anonymous ids helps nobody. */}
                            <Select
                                value={camera.deviceId}
                                disabled={camera.devices.length === 0}
                                onChange={(event) => void camera.choose(event.target.value)}
                            >
                                {camera.devices.length === 0 ? (
                                    <option value="">{t("label.camera-unknown")}</option>
                                ) : null}
                                {camera.devices.map((device, index) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || t("label.camera-numbered", { number: index + 1 })}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field>
                            <Label>{t("label.set-scope")}</Label>
                            <Description>{t("description.set-scope")}</Description>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button outline disabled={known.length === 0} onClick={() => setPicking(true)}>
                                    {sets.length === 0
                                        ? t("button.all-sets")
                                        : t("label.sets-limited", { count: sets.length })}
                                </Button>
                                {sets.length > 0 ? (
                                    <Button plain onClick={() => onSets([])}>
                                        {t("button.all-sets")}
                                    </Button>
                                ) : null}
                            </div>
                        </Field>
                    </div>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>

            <SetPicker
                open={picking}
                sets={known}
                initialSelection={sets}
                onCancel={() => setPicking(false)}
                onConfirm={(codes) => {
                    onSets(codes);
                    setPicking(false);
                }}
            />
        </>
    );
}
