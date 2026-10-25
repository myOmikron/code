import { describe, expect, it, vi } from "vitest";
import { composeBugReport, createDiagnosticsRecorder } from "./diagnostics";
import type { ScannerRecognition } from "./diagnostics";

/**
 * A recorder installed on a fresh console and window, with a clock the test moves
 *
 * @returns the recorder, its console, its window and the clock
 */
function installed() {
    const clock = { now: 0 };
    const recorder = createDiagnosticsRecorder({ requests: 3, errors: 2 }, () => clock.now);
    const target = { console: { error: vi.fn() }, window: new EventTarget() };
    recorder.install(target);
    return { recorder, clock, ...target };
}

/**
 * Sends one request through the recorder's middleware
 *
 * @param recorder the recorder
 * @param url the url requested
 * @param response what the server answers, `null` for a network failure
 * @param clock moved by `milliseconds` while the request runs
 * @param clock.now the clock's current time
 * @param milliseconds how long the request takes
 */
async function request(
    recorder: ReturnType<typeof createDiagnosticsRecorder>,
    url: string,
    response: Response | null,
    clock: { now: number } = { now: 0 },
    milliseconds = 0,
) {
    const init: RequestInit = { method: "POST", body: "secret body" };
    const params = (await recorder.middleware.pre?.({ fetch, url, init })) ?? { url, init };
    clock.now += milliseconds;
    if (response) {
        await recorder.middleware.post?.({ fetch, url: params.url, init: params.init, response });
    } else {
        await recorder.middleware.onError?.({
            fetch,
            url: params.url,
            init: params.init,
            error: new TypeError("offline"),
        });
    }
}

/**
 * A recognition as the scanner hands it over
 *
 * @param name the card it read
 * @returns the recognition
 */
function recognition(name: string): ScannerRecognition {
    return {
        ocr_text: name,
        ocr_model: "eng",
        path: "name",
        candidates: Array.from({ length: 7 }, (_, rank) => ({
            name,
            set: "lea",
            collector_number: String(rank),
            score: 1 - rank / 10,
        })),
        chosen: null,
    };
}

describe("diagnostics recorder", () => {
    it("records method, path, status, duration and trace id of a request", async () => {
        const { recorder, clock } = installed();
        const response = new Response(null, { status: 500, headers: { "x-trace-id": "4bf92f35" } });

        await request(recorder, "https://mtg.test/api/frontend/v1/decks/abc", response, clock, 42);

        expect(recorder.snapshot({ kind: "menu" }).requests).toEqual([
            { method: "POST", path: "/api/frontend/v1/decks/abc", status: 500, duration_ms: 42, trace_id: "4bf92f35" },
        ]);
    });

    it("strips query values and leaves bodies out", async () => {
        const { recorder } = installed();

        await request(recorder, "https://mtg.test/api/frontend/v1/decks?search=Atraxa&limit=5", new Response());

        const [recorded] = recorder.snapshot({ kind: "menu" }).requests;
        expect(recorded.path).toBe("/api/frontend/v1/decks?search&limit");
        expect(JSON.stringify(recorded)).not.toContain("Atraxa");
        expect(JSON.stringify(recorded)).not.toContain("secret body");
    });

    it("records a request that never got an answer without a status", async () => {
        const { recorder } = installed();

        await request(recorder, "https://mtg.test/api/frontend/v1/me", null);

        expect(recorder.snapshot({ kind: "menu" }).requests[0]).toMatchObject({ status: null, trace_id: null });
    });

    it("keeps only the most recent requests", async () => {
        const { recorder } = installed();

        for (const path of ["a", "b", "c", "d", "e"]) {
            await request(recorder, `https://mtg.test/${path}`, new Response());
        }

        expect(recorder.snapshot({ kind: "menu" }).requests.map((entry) => entry.path)).toEqual(["/c", "/d", "/e"]);
    });

    it("records console errors and still prints them", () => {
        const printed = vi.fn();
        const console = { error: printed };
        const recorder = createDiagnosticsRecorder();
        recorder.install({ console, window: new EventTarget() });
        const failure = new Error("deck missing");

        console.error("Loading failed:", failure);

        expect(printed).toHaveBeenCalledWith("Loading failed:", failure);
        const [recorded] = recorder.snapshot({ kind: "menu" }).console;
        expect(recorded.kind).toBe("console-error");
        expect(recorded.message).toBe("Loading failed: Error: deck missing");
        expect(recorded.stack).toBe(failure.stack);
    });

    it("records unhandled exceptions and rejections", () => {
        const { recorder, window } = installed();
        const thrown = new Error("boom");

        window.dispatchEvent(Object.assign(new Event("error"), { error: thrown, message: "Uncaught Error: boom" }));
        window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "network down" }));

        expect(recorder.snapshot({ kind: "menu" }).console).toEqual([
            { kind: "error", message: "Error: boom", stack: thrown.stack },
            { kind: "unhandled-rejection", message: "network down", stack: null },
        ]);
    });

    it("keeps only the most recent errors", () => {
        const { recorder, console } = installed();

        console.error("first");
        console.error("second");
        console.error("third");

        expect(recorder.snapshot({ kind: "menu" }).console.map((entry) => entry.message)).toEqual(["second", "third"]);
    });

    it("carries neither an error nor scanner context from the menu", () => {
        const { recorder } = installed();

        const snapshot = recorder.snapshot({ kind: "menu" });

        expect(snapshot.start).toBe("menu");
        expect(snapshot.error).toBeNull();
        expect(snapshot.scanner).toBeNull();
    });

    it("carries the error and its stack from the error screen", () => {
        const { recorder } = installed();
        const crash = new TypeError("Cannot read properties of undefined");

        const snapshot = recorder.snapshot({ kind: "error-screen", error: crash });

        expect(snapshot.start).toBe("error-screen");
        expect(snapshot.error).toEqual({
            message: "TypeError: Cannot read properties of undefined",
            stack: crash.stack,
        });
        expect(snapshot.scanner).toBeNull();
    });

    it("carries the last three recognitions with five candidates each from the scanner", () => {
        const { recorder } = installed();
        const recognitions = ["One", "Two", "Three", "Four"].map(recognition);

        const snapshot = recorder.snapshot({ kind: "scanner", recognitions, crop: null });

        expect(snapshot.start).toBe("scanner");
        expect(snapshot.error).toBeNull();
        expect(snapshot.scanner?.recognitions.map((entry) => entry.ocr_text)).toEqual(["Two", "Three", "Four"]);
        expect(snapshot.scanner?.recognitions[0].candidates.map((entry) => entry.collector_number)).toEqual([
            "0",
            "1",
            "2",
            "3",
            "4",
        ]);
    });
});

describe("composing a bug report", () => {
    const context = {
        route: "/scan/live",
        release: "0.42.0",
        userAgent: "Mozilla/5.0 (Test)",
        viewport: "390x844",
        language: "de-DE",
    };
    const crop = new Blob(["crop"], { type: "image/jpeg" });
    const photo = new Blob(["photo"], { type: "image/webp" });

    it("sends the scanner crop first when it is kept", () => {
        const recorder = createDiagnosticsRecorder();

        const composed = composeBugReport(recorder, {
            text: "Wrong card",
            images: [photo],
            start: { kind: "scanner", recognitions: [], crop },
            includeCrop: true,
            context,
        });

        expect(composed.images).toEqual([crop, photo]);
        expect(composed.report).toMatchObject({
            text: "Wrong card",
            route: "/scan/live",
            release: "0.42.0",
            user_agent: "Mozilla/5.0 (Test)",
            viewport: "390x844",
            language: "de-DE",
        });
        expect(composed.report.diagnostics).toMatchObject({ start: "scanner" });
    });

    it("leaves the scanner crop out when unchecked", () => {
        const recorder = createDiagnosticsRecorder();

        const composed = composeBugReport(recorder, {
            text: "Wrong card",
            images: [photo],
            start: { kind: "scanner", recognitions: [], crop },
            includeCrop: false,
            context,
        });

        expect(composed.images).toEqual([photo]);
    });
});
