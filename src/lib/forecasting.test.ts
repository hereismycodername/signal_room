import { describe, expect, it } from "vitest";
import {
  aggregateProbability,
  brierScorePoints,
  buildLeaderboard,
  canTransition,
  type Question,
} from "./forecasting";

describe("brierScorePoints", () => {
  it("awards a perfect forecast 10,000 points", () => {
    expect(brierScorePoints(100, 1)).toBe(10_000);
    expect(brierScorePoints(0, 0)).toBe(10_000);
  });

  it("awards a neutral 50% forecast 7,500 points", () => {
    expect(brierScorePoints(50, 1)).toBe(7_500);
    expect(brierScorePoints(50, 0)).toBe(7_500);
  });

  it("awards a confidently wrong forecast zero points", () => {
    expect(brierScorePoints(100, 0)).toBe(0);
    expect(brierScorePoints(0, 1)).toBe(0);
  });
});

describe("question lifecycle", () => {
  it("only permits draft → open → sealed → resolved", () => {
    expect(canTransition("draft", "open")).toBe(true);
    expect(canTransition("open", "sealed")).toBe(true);
    expect(canTransition("sealed", "resolved")).toBe(true);
    expect(canTransition("open", "resolved")).toBe(false);
    expect(canTransition("resolved", "open")).toBe(false);
    expect(canTransition("resolved", "sealed")).toBe(false);
  });
});

describe("forecast aggregation", () => {
  it("returns a rounded average without exposing special cases", () => {
    expect(
      aggregateProbability([
        {
          id: "a",
          participantId: "one",
          participantName: "One",
          probability: 61,
          submittedAt: "2026-10-08T00:00:00Z",
        },
        {
          id: "b",
          participantId: "two",
          participantName: "Two",
          probability: 72,
          submittedAt: "2026-10-08T00:00:00Z",
        },
      ]),
    ).toBe(67);
    expect(aggregateProbability([])).toBeNull();
  });
});

describe("leaderboard", () => {
  it("ignores open questions and ranks resolved accuracy", () => {
    const questions: Question[] = [
      {
        id: "resolved",
        prompt: "Resolved?",
        category: "Test",
        closesAt: "now",
        status: "resolved",
        resolutionCriteria: "Test criterion",
        outcome: 1,
        anchored: false,
        forecasts: [
          {
            id: "good",
            participantId: "good",
            participantName: "Good",
            probability: 90,
            submittedAt: "2026-10-08T00:00:00Z",
          },
          {
            id: "bad",
            participantId: "bad",
            participantName: "Bad",
            probability: 10,
            submittedAt: "2026-10-08T00:00:00Z",
          },
        ],
      },
      {
        id: "open",
        prompt: "Open?",
        category: "Test",
        closesAt: "later",
        status: "open",
        resolutionCriteria: "Test criterion",
        anchored: false,
        forecasts: [
          {
            id: "open-only",
            participantId: "open-only",
            participantName: "Open Only",
            probability: 100,
            submittedAt: "2026-10-08T00:00:00Z",
          },
        ],
      },
    ];

    const leaderboard = buildLeaderboard(questions);
    expect(leaderboard.map((entry) => entry.participantId)).toEqual([
      "good",
      "bad",
    ]);
    expect(leaderboard[0].averageScore).toBe(9_900);
    expect(leaderboard[0].provisional).toBe(true);
  });
});
