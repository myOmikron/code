import type { Middleware, SendBugReportRequest } from "src/api/generated";

/** One API request, as a Bug report carries it */
export type RecordedRequest = {
    method: string;
    /** The path, with the query's keys and without its values */
    path: string;
    /** `null` when no answer came back */
    status: number | null;
    duration_ms: number;
    trace_id: string | null;
};

/** One console error, uncaught exception or unhandled rejection */
export type RecordedError = {
    kind: "console-error" | "error" | "unhandled-rejection";
    message: string;
    stack: string | null;
};

/** A printing the scanner considered */
export type ScannerCandidate = {
    name: string;
    set: string;
    collector_number: string;
    score: number;
};

/** One frame the scanner tried to recognise */
export type ScannerRecognition = {
    /** What the title bar read, empty when nothing legible was found */
    ocr_text: string;
    /** Which traineddata read it */
    ocr_model: string;
    /** Whether the candidates came from the name or from the picture */
    path: "name" | "embedding";
    /** The best candidates, best first */
    candidates: ScannerCandidate[];
    /** What the frame was confirmed as, `null` when it was not */
    chosen: (Omit<ScannerCandidate, "score"> & { inliers: number }) | null;
};

/** Where a Bug report was started, with what that place knows */
export type ReportStart =
    | { kind: "menu" }
    | { kind: "error-screen"; error: unknown }
    | { kind: "scanner"; recognitions: ScannerRecognition[]; crop: Blob | null };

/** The diagnostics document a Bug report carries */
export type Diagnostics = {
    start: ReportStart["kind"];
    requests: RecordedRequest[];
    console: RecordedError[];
    /** The error the error screen showed */
    error: { message: string; stack: string | null } | null;
    scanner: { recognitions: ScannerRecognition[] } | null;
};

/** Records what the app does, for a Bug report to carry */
export type DiagnosticsRecorder = {
    /** Goes into the generated API client's configuration */
    middleware: Middleware;
    /**
     * Starts listening for console errors, uncaught exceptions and unhandled rejections
     *
     * @param target the console to wrap and the window to listen on
     * @param target.console the console whose `error` is wrapped
     * @param target.window the window whose error events are listened to
     */
    install(target: { console: Pick<Console, "error">; window: EventTarget }): void;
    /**
     * What a Bug report started at `start` carries
     *
     * @param start where the Bug report was started
     * @returns the diagnostics document
     */
    snapshot(start: ReportStart): Diagnostics;
};

/** How many requests and errors a recorder keeps */
export type DiagnosticsLimits = { requests: number; errors: number };

/** The browser around a Bug report */
export type ReportContext = {
    route: string;
    release: string;
    userAgent: string;
    viewport: string;
    language: string;
};

const MAX_RECOGNITIONS = 3;
const MAX_CANDIDATES = 5;
const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;

/**
 * Creates a recorder with bounded ring buffers
 *
 * @param limits how many requests and errors to keep
 * @param now the clock request durations are measured with
 * @returns the recorder
 */
export function createDiagnosticsRecorder(
    limits: DiagnosticsLimits = { requests: 20, errors: 20 },
    now: () => number = () => performance.now(),
): DiagnosticsRecorder {
    const requests: RecordedRequest[] = [];
    const errors: RecordedError[] = [];
    const started = new WeakMap<RequestInit, number>();

    const push = <T>(buffer: T[], entry: T, limit: number) => {
        buffer.push(entry);
        if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
    };
    const record = (url: string, init: RequestInit, response: Response | undefined) => {
        const start = started.get(init);
        push(
            requests,
            {
                method: (init.method ?? "GET").toUpperCase(),
                path: withoutQueryValues(url),
                status: response?.status ?? null,
                duration_ms: start === undefined ? 0 : Math.round(now() - start),
                trace_id: response?.headers.get("x-trace-id") ?? null,
            },
            limits.requests,
        );
    };

    return {
        middleware: {
            pre: async ({ url, init }) => {
                const own = { ...init };
                started.set(own, now());
                return { url, init: own };
            },
            post: async ({ url, init, response }) => {
                record(url, init, response);
            },
            onError: async ({ url, init, response }) => {
                record(url, init, response);
            },
        },
        install: ({ console, window }) => {
            const original = console.error.bind(console);
            console.error = (...args: unknown[]) => {
                push(errors, { kind: "console-error", ...describe(args) }, limits.errors);
                original(...args);
            };
            window.addEventListener("error", (event) => {
                const { error, message } = event as ErrorEvent;
                push(errors, { kind: "error", ...describe([error ?? message]) }, limits.errors);
            });
            window.addEventListener("unhandledrejection", (event) => {
                const { reason } = event as PromiseRejectionEvent;
                push(errors, { kind: "unhandled-rejection", ...describe([reason]) }, limits.errors);
            });
        },
        snapshot: (start) => ({
            start: start.kind,
            requests: [...requests],
            console: [...errors],
            error: start.kind === "error-screen" ? describe([start.error]) : null,
            scanner:
                start.kind === "scanner"
                    ? {
                          recognitions: start.recognitions.slice(-MAX_RECOGNITIONS).map((recognition) => ({
                              ...recognition,
                              candidates: recognition.candidates.slice(0, MAX_CANDIDATES),
                          })),
                      }
                    : null,
        }),
    };
}

/**
 * Puts a Bug report together from what the player gave and what the recorder knows
 *
 * @param recorder the recorder whose snapshot goes along
 * @param input the player's text and images, where it started and whether the scanner crop goes along
 * @param input.text what the player wrote
 * @param input.images the images the player attached
 * @param input.start where the Bug report was started
 * @param input.includeCrop whether the scanner crop goes along
 * @param input.context the browser around it
 * @returns the `report` part and the images, the scanner crop first
 */
export function composeBugReport(
    recorder: DiagnosticsRecorder,
    input: { text: string; images: Blob[]; start: ReportStart; includeCrop: boolean; context: ReportContext },
): { report: SendBugReportRequest; images: Blob[] } {
    const { text, images, start, includeCrop, context } = input;
    const crop = start.kind === "scanner" && includeCrop ? start.crop : null;
    return {
        report: {
            text,
            route: context.route,
            release: context.release,
            user_agent: context.userAgent,
            viewport: context.viewport,
            language: context.language,
            diagnostics: recorder.snapshot(start),
        },
        images: crop ? [crop, ...images] : images,
    };
}

/**
 * A url's path with the query's keys and without its values
 *
 * @param url absolute or relative to the page
 * @returns the path
 */
export function withoutQueryValues(url: string): string {
    const parsed = new URL(url, "http://relative.invalid");
    const keys = [...parsed.searchParams.keys()];
    return keys.length > 0 ? `${parsed.pathname}?${keys.join("&")}` : parsed.pathname;
}

/**
 * Turns what was logged or thrown into a message and the first stack among it
 *
 * @param values the console's arguments, or the one thing thrown
 * @returns the message and stack
 */
function describe(values: unknown[]): { message: string; stack: string | null } {
    const stack = values.find((value): value is Error => value instanceof Error)?.stack ?? null;
    const message = values.map(asText).join(" ");
    return { message: message.slice(0, MAX_MESSAGE), stack: stack?.slice(0, MAX_STACK) ?? null };
}

/**
 * One logged value as text
 *
 * @param value anything
 * @returns its text
 */
function asText(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/** The app's one recorder, fed by the API client and the global error handlers */
export const DIAGNOSTICS = createDiagnosticsRecorder();

/** Starts recording console errors, uncaught exceptions and unhandled rejections */
export function installDiagnostics() {
    DIAGNOSTICS.install({ console, window });
}
