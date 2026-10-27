import { useTranslation } from "react-i18next";
import { Subheading } from "../components/base/heading";
import { Text } from "../components/base/text";
import type { WizardDefinitionError } from "./validation";

/**
 * The properties for {@link WizardDefinitionErrors}
 */
export type WizardDefinitionErrorsProps = {
    /** ID of the broken Wizard */
    wizardId: string;
    /** Every error of its definition */
    errors: ReadonlyArray<WizardDefinitionError>;
};

/**
 * The error page shown instead of a Wizard whose definition is invalid
 */
export function WizardDefinitionErrors(props: WizardDefinitionErrorsProps) {
    const [tg] = useTranslation();
    return (
        <div role={"alert"} className={"flex flex-col gap-4"}>
            <Subheading>{tg("heading.wizard-invalid")}</Subheading>
            <Text>{tg("description.wizard-invalid", { wizard: props.wizardId })}</Text>
            <ul className={"list-disc pl-6 text-sm/6 text-red-600 dark:text-red-500"}>
                {props.errors.map((error, index) => (
                    <li key={index}>{error.message}</li>
                ))}
            </ul>
        </div>
    );
}
