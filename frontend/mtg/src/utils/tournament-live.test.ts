import { describe, expect, it } from "vitest";
import { parseTournamentEvent, topicsOf } from "src/utils/tournament-live";

describe("topicsOf", () => {
    it("refetches the standings when they changed", () => {
        expect(topicsOf({ kind: "StandingsChanged" })).toEqual(["standings"]);
    });

    it("refetches the Rounds when a Result changed", () => {
        expect(topicsOf({ kind: "ResultDisputed", round: 2, match_uuid: "m" })).toEqual(["rounds"]);
    });

    it("refetches the Tournament with the Rounds when a Round starts, since its state may follow", () => {
        expect(topicsOf({ kind: "RoundStarted", round: 1 })).toEqual(["rounds", "tournament"]);
    });

    it("refetches the Participants and the Rounds when the roster changed, since a preview goes with it", () => {
        expect(topicsOf({ kind: "ParticipantsChanged" })).toEqual(["participants", "rounds"]);
    });

    it("refetches everything on a resync", () => {
        expect(topicsOf({ kind: "Resync" })).toEqual(["tournament", "participants", "rounds", "standings"]);
    });
});

describe("parseTournamentEvent", () => {
    it("reads the json of an event", () => {
        expect(parseTournamentEvent('{"kind":"RoundEnded","round":3}')).toEqual({ kind: "RoundEnded", round: 3 });
    });

    it("takes anything it cannot read for a resync", () => {
        expect(parseTournamentEvent("not json")).toEqual({ kind: "Resync" });
        expect(parseTournamentEvent('{"kind":"SomethingNew"}')).toEqual({ kind: "Resync" });
    });
});
