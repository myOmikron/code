import { GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/24/solid";
import { type WizardFieldTypeRegistry, type WizardIconRegistry, standardWizardFieldTypes } from "components";
import { datetimeFieldType } from "src/wizards/field-types/datetime";
import { type EntryFeeValue, entryFeeFieldType } from "src/wizards/field-types/entry-fee";
import { type TournamentRulesValue, tournamentRulesFieldType } from "src/wizards/field-types/tournament-rules";

declare module "components" {
    /** mtg's own Wizard Field Types, next to the standard ones */
    interface WizardFieldTypeMap {
        /** A date and time, see {@link datetimeFieldType} */
        datetime: {
            /** `YYYY-MM-DDTHH:mm`, `""` while empty */
            value: string;
            /** Nothing to configure */
            config: object;
        };
        /** An optional entry fee, see {@link entryFeeFieldType} */
        "entry-fee": {
            /** The amount as typed and its currency */
            value: EntryFeeValue;
            /** Nothing to configure */
            config: object;
        };
        /** The rules a Tournament is played by, see {@link tournamentRulesFieldType} */
        "tournament-rules": {
            /** Format, Table size, Ruleset, best of and Top cut */
            value: TournamentRulesValue;
            /** Nothing to configure */
            config: object;
        };
    }
}

/** The Wizard Field Types of mtg: the standard ones and its own */
export const wizardFieldTypes: WizardFieldTypeRegistry = {
    ...standardWizardFieldTypes,
    datetime: datetimeFieldType,
    "entry-fee": entryFeeFieldType,
    "tournament-rules": tournamentRulesFieldType,
};

/** The icons mtg's Wizard definitions can name */
export const wizardIcons: WizardIconRegistry = {
    globe: GlobeAltIcon,
    link: LinkIcon,
    lock: LockClosedIcon,
};
