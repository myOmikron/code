import React, { useEffect } from "react";
import { Api, UUID } from "src/api/api";
import { ClubSchema } from "src/api/generated/admin";

/** Data provided by the {@link CLUB_ADMIN_SINGLE_CLUB} */
export type ClubAdminSingleClubContext = {
    /** The currently active context */
    data: ClubSchema;

    /** Reload the devices' information */
    reset: () => void;
};

/** {@link React.Context} */
const CLUB_ADMIN_SINGLE_CLUB = React.createContext<ClubAdminSingleClubContext>({
    /** The currently loaded data */
    data: {
        admin_count: 0,
        created_at: "",
        member_count: 0,
        modified_at: "",
        name: "",
        uuid: "",
        primary_domain: "",
    },

    /** Reset the context */
    reset: () => {},
});
CLUB_ADMIN_SINGLE_CLUB.displayName = "ClubAdminSingleClubContext";
export default CLUB_ADMIN_SINGLE_CLUB;

/**
 * The properties for {@link ClubAdminSingleClubProvider}
 */
export type ClubAdminSingleClubProviderProps = {
    /** The uuid to load */
    uuid: UUID;

    /** Children of the provider */
    children: React.ReactNode;
};

/**
 * The provider of a club context
 */
export function ClubAdminSingleClubProvider(props: ClubAdminSingleClubProviderProps) {
    const [data, setData] = React.useState<ClubSchema | "loading">("loading");
    let fetching = false;

    /**
     * Fetch the data
     */
    const fetch = async () => {
        if (fetching) return;
        fetching = true;

        const res = await Api.clubAdmins.club.get(props.uuid);
        setData(res);

        fetching = false;
    };

    useEffect(() => {
        fetch().then();
    }, [props.uuid]);

    if (data === "loading") {
        return <div>Loading ..</div>;
    }

    return (
        <CLUB_ADMIN_SINGLE_CLUB.Provider
            value={{
                data,
                reset: fetch,
            }}
        >
            {props.children}
        </CLUB_ADMIN_SINGLE_CLUB.Provider>
    );
}
