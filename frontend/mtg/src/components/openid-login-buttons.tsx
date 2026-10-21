import { Button } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { SimpleOpenIdProvider } from "src/api/generated";
import { InlineError } from "src/components/inline-error";
import { isFormError } from "src/utils/error";

/**
 * The properties for {@link OpenIdLoginButtons}
 */
export type OpenIdLoginButtonsProps = {
    /** Keep the session alive across browser restarts once logged in */
    rememberMe: boolean;
};

/**
 * One "Continue with …" button per active OpenID provider, for signing up and logging in alike.
 *
 * Renders nothing while no provider is active. A click sends the browser to the provider,
 * which sends it back through the backend's callback.
 *
 * @returns the buttons, or nothing
 */
export function OpenIdLoginButtons({ rememberMe }: OpenIdLoginButtonsProps) {
    const [tg] = useTranslation();
    const [providers, setProviders] = useState<SimpleOpenIdProvider[]>([]);
    const [starting, setStarting] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);

    useEffect(() => {
        Api.auth.oidc
            .providers()
            .then((response) => setProviders(response.providers))
            .catch(() => setProviders([]));
    }, []);

    /**
     * Starts an OIDC login through `provider` and leaves for its authorization page.
     *
     * @param provider the id of the provider
     */
    async function start(provider: string) {
        setStarting(provider);
        setUnavailable(false);
        try {
            const started = await Api.auth.oidc.start(provider, rememberMe);
            if (isFormError(started)) {
                setUnavailable(true);
                setStarting(null);
                return;
            }
            window.location.assign(started.url);
        } catch (error) {
            console.error(error);
            setUnavailable(true);
            setStarting(null);
        }
    }

    if (providers.length === 0) return null;

    return (
        <div className={"flex flex-col gap-3"}>
            {providers.map((provider) => (
                <Button
                    key={provider.id}
                    outline={true}
                    disabled={starting !== null}
                    onClick={() => void start(provider.id)}
                >
                    {tg("button.continue-with-provider", { provider: provider.display_name })}
                </Button>
            ))}
            {unavailable && <InlineError>{tg("error.provider-unavailable")}</InlineError>}
        </div>
    );
}
