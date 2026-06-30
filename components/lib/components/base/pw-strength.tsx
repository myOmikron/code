import React from "react";
import { clsx } from "clsx";
import { Text } from "./text";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import { useTranslation } from "react-i18next";

/**
 * Lazily loads zxcvbn's (multi-megabyte) language dictionaries and configures
 * the estimator, exactly once.
 *
 * Kept out of the module's top level on purpose: importing the dictionaries
 * eagerly would pull them into every bundle that touches the component barrel —
 * even apps that never render this component. Loading them via dynamic
 * `import()` lets bundlers split them into a separate chunk fetched only when a
 * password is actually evaluated.
 */
let optionsPromise: Promise<void> | undefined;
function loadZxcvbnOptions(): Promise<void> {
    if (optionsPromise === undefined) {
        optionsPromise = Promise.all([
            import("@zxcvbn-ts/language-common"),
            import("@zxcvbn-ts/language-en"),
            import("@zxcvbn-ts/language-de"),
        ]).then(([common, en, de]) => {
            zxcvbnOptions.setOptions({
                dictionary: {
                    ...common.dictionary,
                    ...en.dictionary,
                    ...de.dictionary,
                },
                graphs: common.adjacencyGraphs,
                translations: en.translations,
            });
        });
    }
    return optionsPromise;
}

/**
 * The properties for {@link PasswordStrength}
 */
export type PasswordStrengthProps = {
    /** The password to evaluate */
    password: string;
};

/**
 * A 4-segment strength bar that visualises zxcvbn's password score alongside
 * an estimated crack-time label.
 *
 * The zxcvbn dictionaries are loaded lazily on first render, so the bar stays
 * neutral for a brief moment until they are available.
 *
 * @example
 * ```tsx
 * <PasswordStrength password={value} />
 * ```
 */
export function PasswordStrength(props: PasswordStrengthProps) {
    const { password } = props;
    const [tg] = useTranslation();

    const [result, setResult] = React.useState<ReturnType<typeof zxcvbn> | undefined>(undefined);

    React.useEffect(() => {
        let cancelled = false;
        loadZxcvbnOptions().then(() => {
            if (!cancelled) setResult(zxcvbn(password));
        });
        return () => {
            cancelled = true;
        };
    }, [password]);

    const score = result?.score;
    const seconds = result?.crackTimesSeconds.offlineSlowHashing1e4PerSecond;

    const century = 315360000;
    const year = 31536000;
    const month = 2678400;
    const week = 604800;
    const day = 86400;
    const hour = 3600;
    const minute = 60;

    const display =
        seconds === undefined
            ? undefined
            : seconds / century > 1
              ? tg("label.centuries")
              : seconds / year > 1
                ? tg("label.years")
                : seconds / month > 1
                  ? tg("label.months")
                  : seconds / week > 1
                    ? tg("label.weeks")
                    : seconds / day > 1
                      ? tg("label.days")
                      : seconds / hour > 1
                        ? tg("label.hours")
                        : seconds / minute > 1
                          ? tg("label.minutes")
                          : tg("label.seconds");

    return (
        <div>
            <div className="mt-3 mb-2 grid h-1 w-full grid-cols-4 gap-3">
                <div
                    className={clsx(
                        "rounded border border-zinc-400 dark:border-zinc-700",
                        score === 4 && "bg-green-500",
                        score === 3 && "bg-yellow-500",
                        score === 2 && "bg-orange-500",
                        (score === 1 || score === 0) && "bg-purple-500",
                    )}
                />
                <div
                    className={clsx(
                        "rounded border border-zinc-400 dark:border-zinc-700",
                        score === 4 && "bg-green-500",
                        score === 3 && "bg-yellow-500",
                        score === 2 && "bg-orange-500",
                    )}
                />
                <div
                    className={clsx(
                        "rounded border border-zinc-400 dark:border-zinc-700",
                        score === 4 && "bg-green-500",
                        score === 3 && "bg-yellow-500",
                    )}
                />
                <div
                    className={clsx(
                        "rounded border border-zinc-400 dark:border-zinc-700",
                        score === 4 && "bg-green-500",
                    )}
                />
            </div>
            {display !== undefined && <Text>{tg("label.estimated-crack-time", { time: display })}</Text>}
        </div>
    );
}
