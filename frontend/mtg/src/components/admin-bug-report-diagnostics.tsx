import {
    Badge,
    Strong,
    Subheading,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Text,
} from "components";
import { useTranslation } from "react-i18next";
import type { Diagnostics, ScannerRecognition } from "src/utils/diagnostics";

/** How a stack trace is set */
const STACK =
    "overflow-x-auto rounded-md bg-zinc-950/5 p-3 font-mono text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300";

/**
 * The properties for {@link AdminBugReportDiagnostics}
 */
export type AdminBugReportDiagnosticsProps = {
    /** What the app sent along */
    diagnostics: Diagnostics;
};

/**
 * Everything a Bug report's app sent along: the error, requests, console errors and scanner context
 *
 * @returns the sections
 */
export function AdminBugReportDiagnostics({ diagnostics }: AdminBugReportDiagnosticsProps) {
    const [t] = useTranslation("admin");

    return (
        <div className={"flex flex-col gap-6"}>
            {diagnostics.error && (
                <div className={"flex flex-col gap-2"}>
                    <Subheading>{t("heading.bug-report-error")}</Subheading>
                    <Text className={"break-all"}>{diagnostics.error.message}</Text>
                    {diagnostics.error.stack && <pre className={STACK}>{diagnostics.error.stack}</pre>}
                </div>
            )}

            {diagnostics.scanner && (
                <div className={"flex flex-col gap-3"}>
                    <Subheading>{t("heading.bug-report-scanner")}</Subheading>
                    {diagnostics.scanner.recognitions.length === 0 ? (
                        <Text>{t("description.bug-report-no-recognitions")}</Text>
                    ) : (
                        diagnostics.scanner.recognitions.map((recognition, index) => (
                            <Recognition key={index} recognition={recognition} />
                        ))
                    )}
                </div>
            )}

            <div className={"flex flex-col gap-2"}>
                <Subheading>{t("heading.bug-report-requests")}</Subheading>
                {diagnostics.requests.length === 0 ? (
                    <Text>{t("description.bug-report-no-requests")}</Text>
                ) : (
                    <Table dense={true}>
                        <TableHead>
                            <TableRow>
                                <TableHeader>{t("label.bug-report-request")}</TableHeader>
                                <TableHeader>{t("label.bug-report-status")}</TableHeader>
                                <TableHeader>{t("label.bug-report-duration")}</TableHeader>
                                <TableHeader>{t("label.bug-report-trace")}</TableHeader>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {diagnostics.requests.map((request, index) => (
                                <TableRow key={index}>
                                    <TableCell className={"font-mono text-xs break-all whitespace-normal"}>
                                        {request.method} {request.path}
                                    </TableCell>
                                    <TableCell className={"tabular-nums"}>
                                        {request.status === null ? (
                                            <Badge color={"red"}>{t("label.bug-report-no-answer")}</Badge>
                                        ) : (
                                            <Badge color={request.status >= 400 ? "red" : "zinc"}>
                                                {request.status}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className={"tabular-nums"}>{request.duration_ms} ms</TableCell>
                                    <TableCell className={"font-mono text-xs select-all"}>
                                        {request.trace_id ?? ""}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>

            <div className={"flex flex-col gap-2"}>
                <Subheading>{t("heading.bug-report-console")}</Subheading>
                {diagnostics.console.length === 0 ? (
                    <Text>{t("description.bug-report-no-console")}</Text>
                ) : (
                    <ul className={"flex flex-col gap-3"}>
                        {diagnostics.console.map((entry, index) => (
                            <li key={index} className={"flex flex-col gap-1"}>
                                <div className={"flex flex-wrap items-center gap-2"}>
                                    <Badge color={entry.kind === "console-error" ? "zinc" : "red"}>{entry.kind}</Badge>
                                    <Text className={"break-all"}>{entry.message}</Text>
                                </div>
                                {entry.stack && <pre className={STACK}>{entry.stack}</pre>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/**
 * The properties for {@link Recognition}
 */
type RecognitionProps = {
    /** One frame the scanner tried to recognise */
    recognition: ScannerRecognition;
};

/**
 * What the scanner read and which printings it weighed for one frame
 *
 * @returns the recognition
 */
function Recognition({ recognition }: RecognitionProps) {
    const [t] = useTranslation("admin");
    const { chosen } = recognition;

    return (
        <div className={"flex flex-col gap-2 rounded-lg border border-zinc-950/10 p-3 dark:border-white/10"}>
            <Text>
                <Strong>{t("label.bug-report-ocr")}</Strong>{" "}
                {recognition.ocr_text === "" ? t("label.bug-report-ocr-nothing") : recognition.ocr_text} (
                {recognition.ocr_model})
            </Text>
            <Text>
                <Strong>{t("label.bug-report-path")}</Strong>{" "}
                {recognition.path === "name" ? t("label.bug-report-path-name") : t("label.bug-report-path-embedding")}
            </Text>
            <Text>
                <Strong>{t("label.bug-report-chosen")}</Strong>{" "}
                {chosen
                    ? `${chosen.name} (${chosen.set.toUpperCase()} ${chosen.collector_number}), ${t("label.bug-report-inliers", { count: chosen.inliers })}`
                    : t("label.bug-report-not-chosen")}
            </Text>
            <Table dense={true}>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.bug-report-candidate")}</TableHeader>
                        <TableHeader>{t("label.bug-report-score")}</TableHeader>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {recognition.candidates.map((candidate) => (
                        <TableRow key={`${candidate.set}-${candidate.collector_number}`}>
                            <TableCell>
                                {candidate.name} ({candidate.set.toUpperCase()} {candidate.collector_number})
                            </TableCell>
                            <TableCell className={"tabular-nums"}>{candidate.score.toFixed(3)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
