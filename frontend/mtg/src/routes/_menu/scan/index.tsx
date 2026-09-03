import { CameraIcon, PencilSquareIcon, RectangleStackIcon, TrashIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
    EmptyState,
    Heading,
    PrimaryButton,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionOverviewResponse, ScannerSessionResponse } from "src/api/generated";
import { ContextMenu, useContextMenu } from "src/components/context-menu";
import type { ContextMenuSection } from "src/components/context-menu";
import { SessionBufferList } from "src/components/session-buffer-list";
import { SessionDialog } from "src/components/session-dialog";
import { SessionTile } from "src/components/session-tile";
import { useAccount } from "src/context/account";
import { defaultDraft, useScannerSessions } from "src/context/scanner-session-context";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";
import { inspectScanDownload, loadScanner } from "src/scanner/scan-client";
import type { ScanDownload } from "src/scanner/scan-client";
import { loadScanLanguage } from "src/utils/scan-language";
import { useShortcuts } from "src/utils/use-shortcuts";

export const Route = createFileRoute("/_menu/scan/")({ component: ScanStartRoute });

/**
 * The way into scanning.
 *
 * Built like the shelf it feeds: a heading, the one action worth a primary button, and then the
 * box that is currently open — which is the only thing somebody standing in front of this page
 * needs to know before starting the camera, because it is where the next hundred cards will land.
 *
 * The line at the bottom is the other thing worth knowing before walking away from a signal: the
 * catalogue is 85 MB and the scanner runs on it offline, so whether this device already has it is
 * the difference between scanning in a shop's back room and not.
 *
 * @returns the page
 */
function ScanStartRoute() {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { account } = useAccount();
    const { sessions, choose, create, update, remove } = useScannerSessions();
    const menu = useContextMenu<ScannerSessionResponse>();
    const [editing, setEditing] = useState<ScannerSessionResponse | undefined>(undefined);
    const [confirming, setConfirming] = useState<ScannerSessionResponse | null>(null);
    // What the pointer is on, the way a deck or a collection marks the tile under it. A staging
    // area is not "active": the keys act on the one being looked at.
    const [selected, setSelected] = useState<string | null>(null);
    // The scanner itself needs nobody: it recognises cards on the device. Only the staging areas
    // are an account's, so that half of the page is what disappears while nobody is signed in.
    const signedIn = account !== null;
    const shortcutHelpOpen = useShortcutHelpOpen();
    const [download, setDownload] = useState<ScanDownload | null>(null);
    const [collections, setCollections] = useState<CollectionOverviewResponse[]>([]);

    const marked = sessions.find((session) => session.uuid === selected) ?? null;

    /**
     * What one staging area can be told from its menu
     *
     * @param session the session the menu was opened on
     *
     * @returns the lines, grouped the way a collection's menu groups its own
     */
    function sectionsFor(session: ScannerSessionResponse): Array<ContextMenuSection> {
        return [
            {
                key: "open",
                items: [
                    {
                        key: "scan",
                        label: tg("button.start-scanning"),
                        icon: <CameraIcon />,
                        onSelect: () =>
                            void navigate({
                                to: "/scan/live/$sessionUuid",
                                params: { sessionUuid: session.uuid },
                            }),
                    },
                ],
            },
            {
                key: "edit",
                items: [
                    {
                        key: "rename",
                        label: tg("button.edit-session"),
                        icon: <PencilSquareIcon />,
                        onSelect: () => setEditing(session),
                    },
                    {
                        key: "delete",
                        label: tg("button.delete-session"),
                        icon: <TrashIcon />,
                        tone: "danger",
                        onSelect: () => setConfirming(session),
                    },
                ],
            },
        ];
    }

    /**
     * Names what a session files into
     *
     * @param session the session
     *
     * @returns the collection's name, or nothing when none was chosen
     */
    function destinationOf(session: ScannerSessionResponse): string | undefined {
        return collections.find((overview) => overview.collection.uuid === session.collection)?.collection.name;
    }

    /**
     * Opens a fresh box and points the camera at it.
     *
     * Starting a scan is starting a box: the sessions already on the shelf are opened by their own
     * tiles, and an empty one of those leads here too. A session that could not be created — no
     * account, no signal — does not stop the camera; the cards wait in the device's buffer and go
     * into a session as soon as there is one.
     *
     * @returns once the camera is on screen
     */
    async function start() {
        const made = signedIn ? await create(defaultDraft()).catch(() => null) : null;
        await (made === null
            ? navigate({ to: "/scan/live" })
            : navigate({ to: "/scan/live/$sessionUuid", params: { sessionUuid: made.uuid } }));
    }

    /**
     * Opens one staging area's cards, switching this device to it on the way
     *
     * @param session the session to open
     *
     * @returns once the navigation is done
     */
    async function openStaged(session: ScannerSessionResponse) {
        void choose(session.uuid);
        await navigate({ to: "/scan/staged/$sessionUuid", params: { sessionUuid: session.uuid } });
    }

    useShortcuts(
        {
            s: () => void start(),
            l: () => {
                if (marked !== null) void openStaged(marked);
            },
            e: () => {
                if (marked !== null) setEditing(marked);
            },
        },
        editing === undefined && confirming === null && menu.open === null && !shortcutHelpOpen,
    );

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
            .then((found) => {
                if (cancelled) return;
                setDownload(found);
                if (!found.cached) return;
                // Errors belong to the scanner's own load, which reports them where they can be
                // read. Here there is nothing to say and nobody waiting on an answer.
                void loadScanner(undefined, loadScanLanguage()).catch(() => undefined);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    // Only for the destination's name on the tile.
    useEffect(() => {
        let dropped = false;
        void Api.collections.list().then((found) => {
            if (!dropped) setCollections(found);
        });
        return () => {
            dropped = true;
        };
    }, []);

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-wrap items-start justify-between gap-3"}>
                <div className={"flex flex-col gap-2"}>
                    <Heading>{t("heading.scan")}</Heading>
                    <Text>{t("description.scan")}</Text>
                    {/* What matters exactly once per device: whether the catalogue is on it, and
                        so whether the scanner works where there is no signal. */}
                    {download !== null && (
                        <Text>
                            {download.cached
                                ? t("label.data-ready")
                                : t("label.data-missing", {
                                      size: new Intl.NumberFormat(undefined, {
                                          maximumFractionDigits: 0,
                                      }).format(download.total / 1e6),
                                  })}
                        </Text>
                    )}
                </div>
                <PrimaryButton onClick={() => void start()}>
                    <CameraIcon className={"size-5"} />
                    {tg("button.start-scanning")}
                </PrimaryButton>
            </div>

            <SessionBufferList />

            {signedIn &&
                (sessions.length === 0 ? (
                    <EmptyState
                        icon={<RectangleStackIcon />}
                        title={tg("heading.nothing-scanned")}
                        description={t("description.no-session")}
                    />
                ) : (
                    <ul className={"grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                        {sessions.map((session) => (
                            <SessionTile
                                key={session.uuid}
                                session={session}
                                destination={destinationOf(session)}
                                selected={session.uuid === selected}
                                onActivate={() => setSelected(session.uuid)}
                                onMenu={menu.openAt}
                            />
                        ))}
                    </ul>
                ))}

            <div>
                <Button plain onClick={() => void navigate({ to: "/scan/bench" })}>
                    {t("button.new-scanner-bench")}
                </Button>
            </div>

            <ContextMenu
                title={menu.open?.item.name}
                at={menu.open?.at ?? null}
                sections={menu.open === null ? [] : sectionsFor(menu.open.item)}
                onClose={menu.close}
            />

            <SessionDialog
                session={editing}
                onClose={() => setEditing(undefined)}
                onSave={async (draft) => {
                    if (editing) await update(editing.uuid, draft);
                }}
            />

            <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                <AlertTitle>{tg("heading.delete-session")}</AlertTitle>
                <AlertDescription>
                    {tg("description.delete-session", { name: confirming?.name ?? "" })}
                </AlertDescription>
                <AlertActions>
                    <Button plain onClick={() => setConfirming(null)}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={() => {
                            const doomed = confirming;
                            setConfirming(null);
                            if (doomed !== null) void remove(doomed.uuid);
                        }}
                    >
                        {tg("button.delete-session")}
                    </Button>
                </AlertActions>
            </Alert>
        </div>
    );
}
