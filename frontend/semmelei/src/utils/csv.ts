/**
 * Build a semicolon separated CSV.
 *
 * Semicolons and a BOM, because the file is opened in a German Excel: comma
 * separated columns land in one cell there, and without the BOM every umlaut
 * turns into mojibake.
 *
 * @param rows the rows, first one usually the header
 *
 * @returns the CSV text, ready to download
 */
export function toCsv(rows: Array<Array<string | number>>): string {
    const escape = (value: string | number) => {
        const text = String(value);
        return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return "﻿" + rows.map((row) => row.map(escape).join(";")).join("\r\n") + "\r\n";
}

/**
 * Offer a text as a file download.
 *
 * @param filename the name to suggest
 * @param content the file's content
 * @param mime the content type (defaults to CSV)
 */
export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
