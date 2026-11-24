import { Dialog, DialogActions, DialogBody, DialogTitle, Subheading } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DatingProfileResponse } from "src/api/generated";
import { DatingColorFilter } from "src/components/dating-color-filter";
import { DatingPolyToggle } from "src/components/dating-poly-toggle";
import { DatingPreferences } from "src/components/dating-preferences";
import { DatingSetFilter } from "src/components/dating-set-filter";
import { PrimaryButton } from "src/components/primary-button";
import type { Color, ColorChoice } from "src/utils/dating";

/**
 * The properties for {@link DatingFilterSheet}
 */
export type DatingFilterSheetProps = {
    open: boolean;
    onClose: () => void;
    /** The color filter of this session */
    colors: ReadonlyMap<Color, ColorChoice>;
    onToggleColor: (color: Color) => void;
    /** Sets and poly mode, left out while swiping a second Commander */
    session: {
        sets: string[];
        onSets: (sets: string[]) => void;
        poly: boolean;
        onPoly: (poly: boolean) => void;
    } | null;
    /** A saved preference changed; the stack is judged anew once the sheet closes */
    onPreferences: () => void;
};

/**
 * Two parts: what narrows the stack for now, and what is kept: poly mode and the preferences Commanders judge by.
 *
 * @returns the sheet
 */
export function DatingFilterSheet(props: DatingFilterSheetProps) {
    const { open, onClose, colors, onToggleColor, session, onPreferences } = props;
    const [t] = useTranslation("dating");
    const [profile, setProfile] = useState<DatingProfileResponse | null>(null);

    useEffect(() => {
        if (open) Api.dating.profile().then(setProfile);
    }, [open]);

    return (
        <Dialog open={open} onClose={onClose} size={"lg"}>
            <DialogTitle>{t("heading.filters")}</DialogTitle>
            <DialogBody className={"flex flex-col gap-8"}>
                <section className={"flex flex-col gap-3"}>
                    <Subheading>{t("heading.for-now")}</Subheading>
                    <DatingColorFilter choices={colors} onToggle={onToggleColor} />
                    {session !== null && (
                        <div>
                            <DatingSetFilter sets={session.sets} onSets={session.onSets} full={true} />
                        </div>
                    )}
                </section>
                <section className={"flex flex-col gap-3"}>
                    <Subheading>{t("heading.always")}</Subheading>
                    {session !== null && (
                        <div>
                            <DatingPolyToggle poly={session.poly} onPoly={session.onPoly} />
                        </div>
                    )}
                    {profile !== null && (
                        <DatingPreferences
                            profile={profile}
                            onChange={(next) => {
                                setProfile(next);
                                onPreferences();
                            }}
                        />
                    )}
                </section>
            </DialogBody>
            <DialogActions>
                <PrimaryButton onClick={onClose}>{t("button.show-commanders")}</PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
