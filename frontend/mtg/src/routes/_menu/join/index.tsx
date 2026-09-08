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
 * Uppercases a typed or scanned code and drops the whitespace/dash a visitor (or the card's own
 * `XXX-XXX` display form) might have put in it — what the join calls and the route both want is
 * the bare code underneath. Pure and stateless, so `handleScan` below can be memoized against it
 * without going stale.
 *
 * @param raw the code as typed or decoded
 *
 * @returns the normalised code
 */
function normalizeCode(raw: string): string {
    return raw.toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Reads a scanned QR payload: either a deep link (`{origin}/join/{code}`, any origin) or a bare
 * code drawn straight onto a whiteboard as a QR. Anything else is not a join code at all — the
 * scanner keeps looking rather than treating it as a wrong code.
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
        // Not a URL at all — fall through to the bare-code check below.
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
 * The typed-code field and the in-app scanner — the two ways in besides opening the deep link
 * itself, side by side rather than one behind a fallback.
 *
 * Reachable with no session at all: a visitor with nothing but a code on a whiteboard is exactly
 * who this page exists for, so there is no `<RequireAccount>` here.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("join");
    const navigate = useNavigate();

    const [code, setCode] = useState("");
    // Scanning is a separate switch from the camera's own state: mounting `<QrScanner>` is what
    // requests the camera (TRAP 3 — never on page load), and un-mounting it is what releases it,
    // whether that is the visitor pressing "stop" or the camera having failed to open at all.
    const [scanning, setScanning] = useState(false);
    // A bump remounts `<QrScanner>` with a fresh "done" flag and a fresh camera request, which is
    // how the scanner keeps looking after a frame decodes to something that is not a join code.
    const [scannerKey, setScannerKey] = useState(0);
    const [cameraNote, setCameraNote] = useState<"denied" | "unavailable" | null>(null);

    /**
     * Navigates to the deep-link page for a normalised code, if there is one to go to
     *
     * @param raw the code as typed or decoded, not yet normalised
     */
    function goToCode(raw: string) {
        const normalized = normalizeCode(raw);
        if (normalized === "") return;
        void navigate({ to: "/join/$code", params: { code: normalized } });
    }

    // Memoized against only `navigate` (stable across renders) and the two pure module-scope
    // helpers above: `<QrScanner>`'s scanning loop tears down and rebuilds whenever this prop's
    // identity changes, so a fresh closure on every keystroke in the code field — the two boxes
    // are on the same screen — would otherwise reset it mid-scan for no reason.
    const handleScan = useCallback(
        (value: string) => {
            const code = extractCode(value);
            if (code === null) {
                // Not a join code — keep scanning rather than showing a dead end.
                setScannerKey((key) => key + 1);
                return;
            }
            const normalized = normalizeCode(code);
            if (normalized === "") return;
            void navigate({ to: "/join/$code", params: { code: normalized } });
        },
        [navigate],
    );

    /**
     * Tracks why the camera would not open, so the page can say which failure it was and stop
     * offering a viewfinder that will never show anything.
     *
     * The hook tells four failures apart; this page has two things to say about them. A refused
     * permission is the one the visitor can still fix from here, so it keeps its own note —
     * an insecure origin, a device with no camera and one that would not open all land on the
     * same "no camera, type the code instead" line, which is the only advice that helps for any
     * of them anyway.
     */
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
