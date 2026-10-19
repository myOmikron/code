import { BoldIcon, H2Icon, ItalicIcon, LinkIcon, ListBulletIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import { ErrorMessage, Field, Input, Label, Text, Textarea } from "components";
import { NewsPostBody } from "src/components/news-post-body";
import { NewsPostProblems } from "src/utils/news";

/** A formatting the toolbar applies */
type Format = "bold" | "italic" | "heading" | "list" | "link";

/**
 * The properties for {@link NewsPostEditor}
 */
export type NewsPostEditorProps = {
    /** The title */
    title: string;
    /** The body, as Markdown */
    body: string;
    /** What is wrong with title or body */
    problems: NewsPostProblems;
    /** Called with the new title */
    onTitleChange: (title: string) => void;
    /** Called with the new body */
    onBodyChange: (body: string) => void;
};

/**
 * Title, Markdown text with a formatting toolbar, and a live preview
 *
 * Editor and preview sit side by side on wide screens and are two tabs on narrow ones.
 *
 * @param props {@link NewsPostEditorProps}
 *
 * @returns the editor
 */
export function NewsPostEditor(props: NewsPostEditorProps) {
    const [t] = useTranslation("admin");
    const [tab, setTab] = React.useState<"write" | "preview">("write");
    const textarea = React.useRef<HTMLTextAreaElement>(null);

    /**
     * Apply a formatting to the selected text, or insert a placeholder when nothing is selected
     *
     * @param format the formatting
     */
    function apply(format: Format) {
        const element = textarea.current;
        if (!element) return;
        const text = props.body;
        let from = element.selectionStart;
        let to = element.selectionEnd;
        const placeholder = t(`label.placeholder-${format}`);

        let insert: string;
        let selectFrom: number;
        let selectTo: number;
        if (format === "heading" || format === "list") {
            const prefix = format === "heading" ? "## " : "- ";
            from = from === 0 ? 0 : text.lastIndexOf("\n", from - 1) + 1;
            const lineEnd = text.indexOf("\n", to);
            to = lineEnd === -1 ? text.length : lineEnd;
            insert = (text.slice(from, to) || placeholder)
                .split("\n")
                .map((line) => prefix + line)
                .join("\n");
            selectFrom = prefix.length;
            selectTo = insert.length;
        } else {
            const selected = text.slice(from, to) || placeholder;
            if (format === "link") {
                insert = `[${selected}](https://)`;
                selectFrom = selected.length + 3;
                selectTo = insert.length - 1;
            } else {
                const marker = format === "bold" ? "**" : "_";
                insert = `${marker}${selected}${marker}`;
                selectFrom = marker.length;
                selectTo = marker.length + selected.length;
            }
        }

        props.onBodyChange(text.slice(0, from) + insert + text.slice(to));
        requestAnimationFrame(() => {
            element.focus();
            element.setSelectionRange(from + selectFrom, from + selectTo);
        });
    }

    const tools: Array<{ format: Format; icon: React.ComponentType<{ className?: string }> }> = [
        { format: "bold", icon: BoldIcon },
        { format: "italic", icon: ItalicIcon },
        { format: "heading", icon: H2Icon },
        { format: "list", icon: ListBulletIcon },
        { format: "link", icon: LinkIcon },
    ];

    const tabClass = (active: boolean) =>
        clsx(
            "min-h-11 flex-1 cursor-pointer rounded-lg px-3 text-sm font-medium",
            active
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
        );

    return (
        <div className={"flex flex-col gap-6"}>
            <Field>
                <Label>{t("label.title")}</Label>
                <Input
                    value={props.title}
                    maxLength={255}
                    invalid={props.problems.title !== undefined}
                    onChange={(e) => props.onTitleChange(e.target.value)}
                />
                {props.problems.title && <ErrorMessage>{t(`error.title-${props.problems.title}`)}</ErrorMessage>}
            </Field>

            <div
                className={"flex gap-1 rounded-xl border border-zinc-950/10 p-1 lg:hidden dark:border-white/10"}
                role={"tablist"}
            >
                <button
                    type={"button"}
                    role={"tab"}
                    aria-selected={tab === "write"}
                    className={tabClass(tab === "write")}
                    onClick={() => setTab("write")}
                >
                    {t("button.write")}
                </button>
                <button
                    type={"button"}
                    role={"tab"}
                    aria-selected={tab === "preview"}
                    className={tabClass(tab === "preview")}
                    onClick={() => setTab("preview")}
                >
                    {t("button.preview")}
                </button>
            </div>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <Field className={clsx(tab !== "write" && "max-lg:hidden")}>
                    <Label>{t("label.text")}</Label>
                    <div
                        className={"mt-3 flex flex-wrap gap-1"}
                        role={"toolbar"}
                        aria-label={t("accessibility.formatting")}
                    >
                        {tools.map(({ format, icon: Icon }) => (
                            <button
                                key={format}
                                type={"button"}
                                title={t(`accessibility.${format}`)}
                                aria-label={t(`accessibility.${format}`)}
                                onClick={() => apply(format)}
                                className={
                                    "flex size-11 cursor-pointer items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 sm:size-9 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                                }
                            >
                                <Icon className={"size-5"} />
                            </button>
                        ))}
                    </div>
                    <Textarea
                        ref={textarea}
                        rows={18}
                        className={"mt-2"}
                        value={props.body}
                        invalid={props.problems.body !== undefined}
                        onChange={(e) => props.onBodyChange(e.target.value)}
                    />
                    {props.problems.body && <ErrorMessage>{t(`error.body-${props.problems.body}`)}</ErrorMessage>}
                </Field>

                <section
                    className={clsx("flex flex-col gap-3", tab !== "preview" && "max-lg:hidden")}
                    aria-label={t("accessibility.preview")}
                >
                    <span
                        className={
                            "hidden text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 lg:block dark:text-white"
                        }
                    >
                        {t("label.preview")}
                    </span>
                    <div
                        className={
                            "rounded-2xl border border-zinc-950/10 bg-[var(--surface-card)] p-5 lg:mt-12 dark:border-white/10"
                        }
                    >
                        <h2 className={"mb-3 text-lg font-semibold text-zinc-950 dark:text-white"}>{props.title}</h2>
                        {props.body.trim() ? (
                            <NewsPostBody markdown={props.body} />
                        ) : (
                            <Text>{t("label.preview-empty")}</Text>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
