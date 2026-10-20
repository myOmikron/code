import { QrCodeIcon, VideoCameraSlashIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Field, Form, Heading, Input, RequiredLabel, Text } from "components";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { QrScanner } from "src/components/qr-scanner";
import i18n from "src/i18n";
import type { Camera } from "src/utils/use-camera";

/** A code, typed or decoded — four to eight letters/digits, with or without its display dash */
const CODE_PATTERN = /^[A-Za-z0-9-]{4,8}$/;

/** The deep link's path shape, `/join/{code}`, an optional trailing slash and all */
const JOIN_PATH_PATTERN = /^\/join\/([A-Za-z0-9-]{4,8})\/?$/;

/**
 * Uppercases a typed or scanned code and strips whitespace and the display dash
 *
 * @param raw the code as typed or decoded
 *
 * @returns the normalised code
 */
function normalizeCode(raw: string): string {
    return raw.toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Reads a scanned QR payload: a `/join/{code}` deep link on any origin, or a bare code
 *
 * @param value the decoded text
 *
 * @returns the code inside it, or `null` if it names no code
 */
function extractCode(value: string): string | null {
    const trimmed = value.trim();
    try {
        const url = new URL(trimmed);
        const match = JOIN_PATH_PATTERN.exec(url.pathname);
        if (match) return match[1];
    } catch {
        // Not a URL; try it as a bare code.
    }
    return CODE_PATTERN.test(trimmed) ? trimmed : null;
}

export const Route = createFileRoute("/_menu/join/")({
    loader: async () => {
        await i18n.loadNamespaces("join");
    },
    component: RouteComponent,
});

/**
 * Join by typing a code or scanning its QR; reachable without a session
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("join");
    const navigate = useNavigate();

    const [code, setCode] = useState("");
    // Mounting `<QrScanner>` requests the camera, so it is only mounted on demand.
    const [scanning, setScanning] = useState(false);
    // Bumped to remount the scanner, which resumes scanning after a non-join QR.
    const [scannerKey, setScannerKey] = useState(0);
    const [cameraNote, setCameraNote] = useState<"denied" | "unavailable" | null>(null);

    /** Opens the deep-link page for a typed or decoded code, if it is not blank */
    const goToCode = useCallback(
        (raw: string) => {
            const normalized = normalizeCode(raw);
            if (normalized === "") return;
            void navigate({ to: "/join/$code", params: { code: normalized } });
        },
        [navigate],
    );

    // Memoized: `<QrScanner>` restarts its scan loop whenever `onScan` changes identity.
    const handleScan = useCallback(
        (value: string) => {
            const code = extractCode(value);
            if (code === null) {
                setScannerKey((key) => key + 1);
                return;
            }
            goToCode(code);
        },
        [goToCode],
    );

    /** Stops scanning when the camera fails; only a denied permission gets its own note */
    const handleCameraError = useCallback((error: Camera["error"]) => {
        if (error === null) return;
        setCameraNote(error === "denied" ? "denied" : "unavailable");
        setScanning(false);
    }, []);

    return (
        <div className={"flex flex-col items-center gap-6 p-4 sm:p-6"}>
            <div className={"flex w-full max-w-md flex-col gap-6"}>
                <div className={"flex flex-col gap-2"}>
                    <Heading>{t("heading.join")}</Heading>
                    <Text>{t("description.join")}</Text>
                </div>

                <Form onSubmit={() => goToCode(code)}>
                    <Field>
                        <RequiredLabel>{t("label.code")}</RequiredLabel>
                        <div className={"mt-2 flex gap-2"}>
                            <Input
                                autoFocus={true}
                                required={true}
                                maxLength={7}
                                autoCapitalize={"characters"}
                                autoComplete={"off"}
                                className={"font-mono tracking-widest uppercase"}
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                            />
                            <Button type={"submit"} disabled={code.trim() === ""}>
                                {t("button.join")}
                            </Button>
                        </div>
                    </Field>
                </Form>

                <div className={"flex flex-col gap-3"}>
                    {!scanning ? (
                        <Button
                            outline={true}
                            onClick={() => {
                                setCameraNote(null);
                                setScannerKey((key) => key + 1);
                                setScanning(true);
                            }}
                        >
                            <QrCodeIcon />
                            {t("button.scan-qr")}
                        </Button>
                    ) : (
                        <>
                            <QrScanner key={scannerKey} onScan={handleScan} onError={handleCameraError} />
                            <Button outline={true} onClick={() => setScanning(false)}>
                                <VideoCameraSlashIcon />
                                {t("button.stop-scan")}
                            </Button>
                        </>
                    )}
                    {cameraNote !== null && (
                        <Text>
                            {cameraNote === "denied"
                                ? t("description.camera-denied")
                                : t("description.camera-unavailable")}
                        </Text>
                    )}
                </div>
            </div>
        </div>
    );
}
