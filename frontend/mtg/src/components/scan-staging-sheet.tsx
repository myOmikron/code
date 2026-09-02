import { ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import { Dialog, DialogActions, DialogBody, DialogTitle, PrimaryButton, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogCloseButton } from "src/components/dialog-close-button";
import { FileIntoCollectionDialog } from "src/components/file-into-collection-dialog";
import { SessionBufferList } from "src/components/session-buffer-list";
import { SessionStackList } from "src/components/session-stack-list";
import { useScannerSessions } from "src/context/scanner-session-context";

/**
 * The properties for {@link ScanStagingSheet}
 */
export type ScanStagingSheetProps = {
    open: boolean;
    onClose: () => void;
};

/**
 * Everything scanned so far, with the corrections a scan actually needs.
 *
 * The list is the open session's, which is to say the server's: what is corrected here is
 * corrected on the desk as well, and the phone can be put down mid-box. Copies that have not
 * reached the server yet — no signal, or nobody signed in — are counted at the top rather than
 * hidden, because a scanner that quietly drops cards is worse than one that says it is behind.
 *
 * @returns the dialog
 */
export function ScanStagingSheet({ open, onClose }: ScanStagingSheetProps) {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const { active, entries, unsynced } = useScannerSessions();
    const [filing, setFiling] = useState(false);
    const copies = entries.reduce((sum, entry) => sum + entry.quantity, 0) + unsynced;

    return (
        <>
            {/* `tall`, because this is the whole point of the screen it opens from: a two thirds
                sheet on a phone cut the list to one and a half rows and put the rest behind a
                scroll inside a scroll. */}
            <Dialog open={open} onClose={onClose} size={"2xl"} tall>
                <DialogTitle className={"flex items-center gap-3"}>
                    <span className={"min-w-0 flex-1 truncate"}>{t("heading.staged", { count: copies })}</span>
                    <DialogCloseButton onClose={onClose} />
                </DialogTitle>
                <DialogBody>
                    {active !== null && <Text className={"mb-3 truncate"}>{active.name}</Text>}
                    <SessionStackList entries={entries} />
                    <SessionBufferList />
                </DialogBody>
                {entries.length > 0 && (
                    <DialogActions>
                        {/* The way out of the scanner without leaving it. A box is sorted in
                            stacks, and the moment a stack is done is the moment to file it. */}
                        <PrimaryButton onClick={() => setFiling(true)}>
                            <ArrowDownTrayIcon className="size-5" />
                            {tg("button.file-session")}
                        </PrimaryButton>
                    </DialogActions>
                )}
            </Dialog>

            <FileIntoCollectionDialog open={filing} onClose={() => setFiling(false)} />
        </>
    );
}
