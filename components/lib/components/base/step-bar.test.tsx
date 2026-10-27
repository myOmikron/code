import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { describe, expect, it, vi } from "vitest";
import StepBar from "./step-bar";

describe("StepBar", () => {
    it("renders steps without a select handler as plain text", () => {
        render(
            <StepBar
                steps={[
                    { label: "One", state: "finished" },
                    { label: "Two", state: "active" },
                ]}
            />,
        );

        expect(screen.queryByRole("button")).toBeNull();
        expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
    });

    it("lets the user select steps that have a select handler", async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(
            <StepBar
                steps={[
                    { label: "One", state: "finished", onSelect },
                    { label: "Two", state: "active" },
                    { label: "Three", state: "pending" },
                ]}
            />,
        );

        expect(screen.getAllByRole("button")).toHaveLength(1);
        await user.click(screen.getByRole("button", { name: "One" }));
        expect(onSelect).toHaveBeenCalledOnce();
    });

    it("summarises the progress as step x of y for mobile when collapsible", () => {
        i18n.addResource("en", "translation", "label.step-x-of-y", "Step {{current}} of {{total}}");
        render(
            <StepBar
                collapseOnMobile={true}
                steps={[
                    { label: "One", state: "finished" },
                    { label: "Two", state: "active" },
                    { label: "Three", state: "pending" },
                ]}
            />,
        );

        expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    });

    it("shows no progress summary by default", () => {
        i18n.addResource("en", "translation", "label.step-x-of-y", "Step {{current}} of {{total}}");
        render(<StepBar steps={[{ label: "One", state: "active" }]} />);

        expect(screen.queryByText("Step 1 of 1")).toBeNull();
    });

    it("shows no progress summary while no step is active", () => {
        i18n.addResource("en", "translation", "label.step-x-of-y", "Step {{current}} of {{total}}");
        render(
            <StepBar
                collapseOnMobile={true}
                steps={[
                    { label: "One", state: "finished" },
                    { label: "Two", state: "finished" },
                ]}
            />,
        );

        expect(screen.queryByText(/^Step \d of 2$/)).toBeNull();
    });
});
