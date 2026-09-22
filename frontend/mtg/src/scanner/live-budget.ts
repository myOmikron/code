/** One optional operation at a time, with a bounded wait and no queue of stale frames. */
export function createLiveBudget() {
    let running = false;
    return async function run<T>(task: () => Promise<T>, milliseconds: number): Promise<T | undefined> {
        if (running || milliseconds <= 0) return undefined;
        running = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const work = Promise.resolve()
            .then(task)
            .finally(() => {
                running = false;
            });
        try {
            return await Promise.race([
                work,
                new Promise<undefined>((resolve) => {
                    timer = setTimeout(() => resolve(undefined), milliseconds);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    };
}
