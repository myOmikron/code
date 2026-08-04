import React from "react";
import { Api } from "src/api/api";
import { MeSchema } from "src/api/generated/common";
import { Navigate } from "@tanstack/react-router";
import { RequiredError, ResponseError } from "src/api/generated/common";

/** The global {@link AccountProvider} instance */
let ACCOUNT_PROVIDER: AccountProvider | null = null;

/** Data provided by the {@link ACCOUNT_CONTEXT} */
export type AccountContext = {
    /** The currently logged-in account */
    account: MeSchema;

    /** Reload the account's information */
    reset: (redirect_to_last_page: boolean) => void;
};

/** {@link React.Context} to access {@link SimpleAccount account information} */
const ACCOUNT_CONTEXT = React.createContext<AccountContext>({
    account: {
        display_name: "",
        uuid: "",
        role: { type: "SuperAdmin" },
        username: "",
    },

    /**
     * Reset the account's information
     */
    reset: () => {},
});
ACCOUNT_CONTEXT.displayName = "AccountContext";
export default ACCOUNT_CONTEXT;

/**
 * The properties of the account provider
 */
type AccountProviderProps = {
    /** The children of the properties */
    children: React.ReactNode | Array<React.ReactNode>;
};

/**
 * The state of the account provider
 */
type AccountProviderState = {
    /** The account */
    account: MeSchema | "unauthenticated" | "loading";
};

/**
 * Component for managing and providing the {@link AccountContext}
 *
 * This is a **singleton** only use at most **one** instance in your application.
 */
export class AccountProvider extends React.Component<AccountProviderProps, AccountProviderState> {
    state: AccountProviderState = { account: "loading" };

    fetching: boolean = false;
    redirect_to_last_page: boolean = true;

    /**
     * Fetch the account
     *
     * @param redirect_to_last_page Whether to redirect to the last page or not
     */
    fetchAccount = async (redirect_to_last_page: boolean) => {
        // Guard against a lot of calls
        if (this.fetching) return;
        this.fetching = true;
        this.redirect_to_last_page = redirect_to_last_page;

        this.setState({ account: "loading" });

        try {
            const account = await Api.common.me.get();
            this.setState({ account });
        } catch (e) {
            let msg;
            if (e instanceof ResponseError) {
                if (e.response.status === 401) {
                    this.setState({ account: "unauthenticated" });
                    return;
                }
            } else if (e instanceof RequiredError) {
                console.error(e);
                msg = "The server's response didn't match the spec";
            } else {
                console.error("Unknown error occurred:", e);
                msg = "Unknown error occurred";
            }
            throw msg;
        } finally {
            // Clear guard against a lot of calls
            this.fetching = false;
        }
    };

    /**
     * Hook when the component mounts
     */
    componentDidMount() {
        this.fetchAccount(true).then();

        // Register as global singleton
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        if (ACCOUNT_PROVIDER === null) ACCOUNT_PROVIDER = this;
        else if (ACCOUNT_PROVIDER === this) console.error("AccountProvider did mount twice");
        else console.error("Two instances of AccountProvider are used");
    }

    /**
     * Hook when the component will unmount
     */
    componentWillUnmount() {
        // Deregister as global singleton
        if (ACCOUNT_PROVIDER === this) ACCOUNT_PROVIDER = null;
        else if (ACCOUNT_PROVIDER === null) console.error("AccountProvider instance did unmount twice");
        else console.error("Two instances of AccountProvider are used");
    }

    /**
     * The render function
     *
     * @returns The JSX component
     */
    render() {
        switch (this.state.account) {
            case "loading":
                return <div></div>;
            case "unauthenticated":
                return (
                    <Navigate
                        to="/oidc/auth"
                        search={{
                            redirect_url: this.redirect_to_last_page ? window.location.pathname : "/",
                            external: false,
                        }}
                    />
                );
            default:
                return (
                    <ACCOUNT_CONTEXT.Provider
                        value={{
                            account: this.state.account,
                            reset: this.fetchAccount,
                        }}
                    >
                        {this.props.children}
                    </ACCOUNT_CONTEXT.Provider>
                );
        }
    }
}
