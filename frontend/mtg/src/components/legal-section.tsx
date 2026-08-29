import { Subheading, Text } from "components";
import type { ReactNode } from "react";

/**
 * The properties for {@link LegalSection}
 */
export type LegalSectionProps = {
    /** What the section is about */
    title: string;
    /** The paragraphs under it */
    children: ReactNode;
};

/**
 * One numbered-off part of a legal page: a heading and its paragraphs.
 *
 * The paragraphs are handed in as strings rather than as markup, because that
 * is the form a lawyer reviews and the translators keep in step; anything a
 * reader has to click is passed as a child instead.
 *
 * @returns the section
 */
export function LegalSection({ title, children }: LegalSectionProps) {
    return (
        <section className={"flex flex-col gap-2"}>
            <Subheading>{title}</Subheading>
            {typeof children === "string" ? <Text className={"whitespace-pre-line"}>{children}</Text> : children}
        </section>
    );
}
