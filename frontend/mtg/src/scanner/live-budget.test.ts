import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveBudget } from "./live-budget";

afterEach(() => vi.useRealTimers());

describe("live OCR budget", () => {
    it("lets a slow job finish without queuing or returning it for a later frame", async () => {
        vi.useFakeTimers();
        const run = createLiveBudget();
        let finish!: (value: string) => void;
        const first = run(
            () =>
                new Promise<string>((resolve) => {
                    finish = resolve;
                }),
            350,
        );
        await vi.advanceTimersByTimeAsync(350);
        expect(await first).toBeUndefined();
        const stale = vi.fn(async () => "second frame");
        expect(await run(stale, 350)).toBeUndefined();
        expect(stale).not.toHaveBeenCalled();
        finish("old card");
        await vi.advanceTimersByTimeAsync(0);
        expect(await run(async () => "new card", 350)).toBe("new card");
        expect(vi.getTimerCount()).toBe(0);
    });

    it("releases the slot after failure", async () => {
        const run = createLiveBudget();
        await expect(
            run(async () => {
                throw new Error("OCR failed");
            }, 350),
        ).rejects.toThrow("OCR failed");
        expect(await run(async () => "retry", 350)).toBe("retry");
    });

    it("does not start another crop after the frame budget has expired", async () => {
        const task = vi.fn(async () => "unused");
        expect(await createLiveBudget()(task, 0)).toBeUndefined();
        expect(task).not.toHaveBeenCalled();
    });
});
