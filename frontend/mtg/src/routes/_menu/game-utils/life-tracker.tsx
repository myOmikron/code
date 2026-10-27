import { createFileRoute } from "@tanstack/react-router";
import { LifeCounter } from "src/components/life-counter";

export const Route = createFileRoute("/_menu/game-utils/life-tracker")({ component: RouteComponent });

function RouteComponent() {
    return <LifeCounter />;
}
