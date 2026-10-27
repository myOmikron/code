import { defineWizard } from "components";
import { Visibility } from "src/api/generated";

/** Setting up a new Tournament: what it is, how it is played, who takes part */
export const tournamentWizard = defineWizard({
    id: "tournament",
    version: 1,
    steps: [
        {
            id: "general",
            label: "label.step-general",
            description: "description.step-general",
            sections: [
                {
                    id: "general-details",
                    fields: [
                        { id: "name", type: "text", label: "label.name", required: true, maxLength: 128 },
                        { id: "startsAt", type: "datetime", label: "label.starts-at", required: true },
                        { id: "location", type: "text", label: "label.location", maxLength: 255 },
                        {
                            id: "description",
                            type: "textarea",
                            label: "label.description",
                            description: "description.description",
                            maxLength: 4096,
                        },
                    ],
                },
            ],
        },
        {
            id: "game",
            label: "label.step-game",
            description: "description.step-game",
            sections: [
                {
                    id: "game-rules",
                    fields: [
                        {
                            id: "rules",
                            type: "tournament-rules",
                            label: "label.format",
                            description: "description.format",
                            required: true,
                        },
                    ],
                },
                {
                    id: "game-schedule",
                    label: "heading.schedule",
                    fields: [
                        {
                            id: "roundMinutes",
                            type: "number",
                            label: "label.round-minutes",
                            description: "description.round-minutes",
                            config: { integer: true },
                            min: 1,
                            max: 240,
                        },
                        {
                            id: "enteredAfterwards",
                            type: "switch",
                            label: "label.entered-afterwards",
                            description: "description.entered-afterwards",
                        },
                    ],
                },
            ],
        },
        {
            id: "registration",
            label: "label.step-registration",
            description: "description.step-registration",
            sections: [
                {
                    id: "registration-access",
                    fields: [
                        {
                            id: "visibility",
                            type: "radio-tiles",
                            label: "label.visibility",
                            description: "description.visibility",
                            required: true,
                            config: {
                                options: [
                                    { value: Visibility.Public, label: "label.visibility-public", icon: "globe" },
                                    { value: Visibility.Unlisted, label: "label.visibility-unlisted", icon: "link" },
                                    { value: Visibility.Private, label: "label.visibility-private", icon: "lock" },
                                ],
                            },
                        },
                        {
                            id: "selfSignUp",
                            type: "switch",
                            label: "label.self-sign-up",
                            description: "description.self-sign-up",
                            visibleWhen: { field: "visibility", in: [Visibility.Public, Visibility.Unlisted] },
                        },
                    ],
                },
                {
                    id: "registration-limits",
                    label: "heading.limits",
                    fields: [
                        {
                            id: "participantLimit",
                            type: "number",
                            label: "label.participant-limit",
                            description: "description.participant-limit",
                            config: { integer: true },
                            min: 2,
                        },
                        {
                            id: "entryFee",
                            type: "entry-fee",
                            label: "label.entry-fee",
                            description: "description.entry-fee",
                        },
                    ],
                },
            ],
        },
    ],
} as const);
