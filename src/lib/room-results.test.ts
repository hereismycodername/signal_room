import { describe, expect, it } from "vitest";
import { brierScoreBps, buildRoomLeaderboard } from "./room-results";

describe("stored room scoring", () => {
  it("scores exact basis point probabilities", () => {
    expect(brierScoreBps(10_000, 1)).toBe(10_000);
    expect(brierScoreBps(5_000, 0)).toBe(7_500);
    expect(brierScoreBps(0, 1)).toBe(0);
    expect(brierScoreBps(6_800, 1)).toBe(8_976);
  });

  it("ignores open questions and ranks resolved wallets chronologically", () => {
    const leaderboard = buildRoomLeaderboard([
      {
        id: "second",
        status: "resolved",
        outcome: 0,
        resolvedAt: new Date("2026-10-09T11:00:00Z"),
        forecasts: [
          { walletAddress: "accurate", probabilityBps: 1_000 },
          { walletAddress: "inaccurate", probabilityBps: 9_000 },
        ],
      },
      {
        id: "first",
        status: "resolved",
        outcome: 1,
        resolvedAt: new Date("2026-10-09T10:00:00Z"),
        forecasts: [
          { walletAddress: "accurate", probabilityBps: 9_000 },
          { walletAddress: "inaccurate", probabilityBps: 1_000 },
        ],
      },
      {
        id: "hidden",
        status: "open",
        outcome: null,
        resolvedAt: null,
        forecasts: [{ walletAddress: "new", probabilityBps: 10_000 }],
      },
    ]);

    expect(leaderboard.map((entry) => entry.walletAddress)).toEqual([
      "accurate",
      "inaccurate",
    ]);
    expect(leaderboard[0]).toMatchObject({
      averageScore: 9_900,
      resolvedForecasts: 2,
      directionAccuracy: 100,
      currentStreak: 2,
      provisional: true,
    });
    expect(leaderboard[1].averageScore).toBe(1_900);
  });
});
