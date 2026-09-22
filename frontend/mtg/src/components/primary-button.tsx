import { Button, type PrimaryButtonProps } from "components";

/** MTG's primary action, sharing the base button's links, sizes and loading state. */
export function PrimaryButton(props: PrimaryButtonProps) {
    return <Button {...props} color={"lime"} />;
}
