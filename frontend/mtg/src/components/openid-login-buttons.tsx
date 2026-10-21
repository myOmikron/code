import { Button } from "components";
import { type ComponentType, type SVGProps, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { SimpleOpenIdProvider } from "src/api/generated";
import GoogleIcon from "src/assets/google.svg?react";
import { InlineError } from "src/components/inline-error";
import { isFormError } from "src/utils/error";

/** The brand mark shown on a provider's button, by provider id */
const PROVIDER_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
    google: GoogleIcon,
};

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
 * Preceded by an "or" divider towards the form above. Renders nothing while no provider is
 * active. A click sends the browser to the provider, which sends it back through the
 * backend's callback.
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
        <div className={"flex flex-col gap-6"}>
            <OrDivider label={tg("label.or")} />
            <div className={"flex flex-col gap-3"}>
                {providers.map((provider) => {
                    const Icon = PROVIDER_ICONS[provider.id];
                    return (
                        <Button
                            key={provider.id}
                            outline={true}
                            className={"w-full"}
                            disabled={starting !== null}
                            loading={starting === provider.id}
                            onClick={() => void start(provider.id)}
                        >
                            {Icon !== undefined && starting !== provider.id && (
                                <Icon data-slot={"icon"} aria-hidden={"true"} />
                            )}
                            {tg("button.continue-with-provider", { provider: provider.display_name })}
                        </Button>
                    );
                })}
                {unavailable && <InlineError>{tg("error.provider-unavailable")}</InlineError>}
            </div>
        </div>
    );
}

/**
 * A horizontal rule with a short word in its middle
 *
 * @returns the divider
 */
function OrDivider({ label }: { label: string }) {
    return (
        <div className={"flex items-center gap-3"} role={"separator"} aria-label={label}>
            <span className={"h-px flex-1 bg-zinc-950/10 dark:bg-white/10"} />
            <span className={"text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400"}>
                {label}
            </span>
            <span className={"h-px flex-1 bg-zinc-950/10 dark:bg-white/10"} />
        </div>
    );
}
