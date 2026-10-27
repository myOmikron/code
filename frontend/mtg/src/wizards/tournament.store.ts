import { type WizardRunStore, createInMemoryWizardRunStore } from "components";
import { toLocalInput } from "src/utils/tournament-settings";

/**
 * Seven in the evening, a week from today: a start a new Tournament can begin with
 *
 * @returns the instant
 */
function nextEvening(): Date {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(19, 0, 0, 0);
    return start;
}

/**
 * Where a run of the Tournament Wizard is kept while the page is open: in memory, starting out with the values a
 * new Tournament suggests that no Field Type's default can
 *
 * @returns the store
 */
export function createTournamentWizardStore(): WizardRunStore {
    const store = createInMemoryWizardRunStore();
    let fresh = true;
    return {
        load: async (key) => {
            if (!fresh) return store.load(key);
            fresh = false;
            return {
                values: {
                    startsAt: { value: toLocalInput(nextEvening()), secret: false },
                    visibility: { value: "Public", secret: false },
                    checkIn: { value: "Off", secret: false },
                },
                completedSteps: [],
                currentStep: "general",
            };
        },
        save: store.save,
    };
}
