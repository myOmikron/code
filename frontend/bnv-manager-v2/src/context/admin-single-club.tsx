import React, { useEffect } from "react";
import { Api, UUID } from "src/api/api";
import { ClubSchema } from "src/api/generated/admin";

/** Data provided by the {@link ADMIN_SINGLE_CLUB} */
export type AdminSingleClubContext = {
    /** The currently active context */
    data: ClubSchema;

    /** Reload the devices' information */
    reset: () => void;
};

/** {@link React.Context} */
const ADMIN_SINGLE_CLUB = React.createContext<AdminSingleClubContext>({
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
ADMIN_SINGLE_CLUB.displayName = "AdminSingleClubContext";
export default ADMIN_SINGLE_CLUB;

/**
 * The properties for {@link AdminSingleClubProvider}
 */
export type AdminSingleClubProviderProps = {
    /** The uuid to load */
    uuid: UUID;

    /** Children of the provider */
    children: React.ReactNode;
};

/**
 * The provider of a device context
 */
export function AdminSingleClubProvider(props: AdminSingleClubProviderProps) {
    const [data, setData] = React.useState<ClubSchema | "loading">("loading");
    let fetching = false;

    /**
     * Fetch the data
     */
    const fetch = async () => {
        if (fetching) return;
        fetching = true;

        const res = await Api.admin.clubs.get(props.uuid);
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
        <ADMIN_SINGLE_CLUB.Provider
            value={{
                data,
                reset: fetch,
            }}
        >
            {props.children}
        </ADMIN_SINGLE_CLUB.Provider>
    );
}
