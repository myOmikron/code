import { Button, Strong, Subheading, Text } from "components";
import { useTranslation } from "react-i18next";
import type { LifeHistory } from "src/utils/life-history";
import { groupLifeEvents } from "src/utils/life-history";

/** Reads complete Games and retained operations, with explicit compensating corrections. */
export function LifeHistoryView({ history, onCorrect }: { history: LifeHistory; onCorrect?: (ids: string[]) => void }) {
    const [t] = useTranslation("game-utils");
    return (
        <div className="space-y-6">
            {history.games.map((game, index) => (
                <section key={index} className="space-y-3">
                    <Subheading>{t("heading.life-game", { number: index + 1 })}</Subheading>
                    <Text>
                        {game.players.map((player, seat) => `${player.name}: ${game.startingLife[seat]}`).join(" · ")}
                    </Text>
                    {game.outcome && (
                        <Text>
                            <Strong>
                                {"draw" in game.outcome
                                    ? t("label.draw")
                                    : t("label.game-winner", {
                                          player: game.players.find(
                                              (player) =>
                                                  "winner" in game.outcome! && player.id === game.outcome.winner,
                                          )?.name,
                                      })}
                            </Strong>
                        </Text>
                    )}
                    <ol className="space-y-3">
                        {groupLifeEvents(game.events).map((event) => (
                            <li key={event.id} className="flex flex-wrap items-center justify-between gap-2">
                                <Text>
                                    <time dateTime={new Date(event.at).toISOString()}>
                                        {new Date(event.at).toLocaleTimeString()}
                                    </time>
                                    {" · "}
                                    {t(`label.history-${event.kind}`, {
                                        player: game.players.find((player) => player.id === event.player)?.name,
                                        commander: game.players.find((player) => player.id === event.commander)?.name,
                                        amount: (event.amount ?? 0) > 0 ? `+${event.amount}` : event.amount,
                                        damage: event.damageAmount,
                                    })}
                                </Text>
                                {onCorrect &&
                                    index === history.games.length - 1 &&
                                    !game.outcome &&
                                    ["life", "commander", "reclassify"].includes(event.kind) &&
                                    !game.events.some(
                                        (entry) => entry.corrects && event.ids.includes(entry.corrects),
                                    ) && (
                                        <Button outline onClick={() => onCorrect(event.ids)}>
                                            {t("button.correct-change")}
                                        </Button>
                                    )}
                            </li>
                        ))}
                    </ol>
                </section>
            ))}
        </div>
    );
}
