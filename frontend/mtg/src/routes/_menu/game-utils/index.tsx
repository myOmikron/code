import { HeartIcon, PrinterIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import { Heading, Text } from "components";
import { useTranslation } from "react-i18next";
import { GameToolCard } from "src/components/game-tool-card";

export const Route = createFileRoute("/_menu/game-utils/")({
    component: RouteComponent,
});

/**
 * The launcher every table tool is picked from.
 *
 * @returns the tool selection
 */
function RouteComponent() {
    const [t] = useTranslation("game-utils");

    const tools = [
        {
            to: "/game-utils/life-tracker",
            icon: HeartIcon,
            color: "from-blue-600 to-blue-950",
            title: t("heading.life-counter"),
            description: t("description.life-counter"),
        },
        {
            to: "/game-utils/proxy-printer",
            icon: PrinterIcon,
            color: "from-emerald-600 to-emerald-950",
            title: t("heading.proxy-printer"),
            description: t("description.proxy-printer"),
        },
    ] as const;

    return (
        <div className={"mx-auto flex w-full max-w-3xl flex-col gap-6"}>
            <div>
                <Heading>{t("heading.page")}</Heading>
                <Text className={"mt-2"}>{t("description.choose-tool")}</Text>
            </div>
            <nav aria-label={t("label.navigation")} className={"grid gap-3 sm:grid-cols-2"}>
                {tools.map((tool) => (
                    <GameToolCard key={tool.to} {...tool} />
                ))}
                <GameToolCard
                    icon={SparklesIcon}
                    title={t("label.more-tools-soon")}
                    description={t("description.more-tools-soon")}
                />
            </nav>
        </div>
    );
}
