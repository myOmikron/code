import type { ScanLanguageChoice } from "src/scanner/scan-client";

/** Where the chosen card language is kept, so a stack survives a reload. */
const KEY = "cardlens.scanLanguage.v1";

/**
 * Which language the scanner is told to expect.
 *
 * Kept out of the scanner screen itself: it is a setting for a stack rather than for a card, and a
 * control on the viewfinder is one more thing between the camera and the person holding a box.
 *
 * @returns the stored choice, or letting the scanner work it out
 */
export function loadScanLanguage(): ScanLanguageChoice {
    return (localStorage.getItem(KEY) as ScanLanguageChoice | null) ?? "auto";
}

/**
 * Remembers which language the scanner should expect
 *
 * @param choice a language, or "auto"
 */
export function saveScanLanguage(choice: ScanLanguageChoice): void {
    localStorage.setItem(KEY, choice);
}
