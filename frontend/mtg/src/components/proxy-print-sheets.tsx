import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The properties for {@link PrintSheets}
 */
export type PrintSheetsProps = {
    /** The sheets to hand to the printer */
    children: ReactNode;
};

/**
 * The sheets, parked outside the app for the printer to find.
 *
 * The navigation, the list and the preview have no business on paper, and a
 * sheet measured in millimetres has no business inside a column as wide as the
 * window. The paper copy sits directly under `body`, where the app's print rule
 * hides everything that is not it.
 *
 * @returns the parked sheets
 */
export function PrintSheets({ children }: PrintSheetsProps) {
    const [host] = useState(() => document.createElement("div"));

    useEffect(() => {
        host.dataset.printSheets = "true";
        host.className = "hidden print:block";
        document.body.append(host);
        return () => host.remove();
    }, [host]);

    return createPortal(children, host);
}
