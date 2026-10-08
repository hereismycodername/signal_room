import type { Forecast, Room } from "./forecasting";

const people = {
  nova: { id: "nova", name: "NovaResearch" },
  ida: { id: "ida", name: "0xIda" },
  teo: { id: "teo", name: "TeoSignals" },
  maya: { id: "maya", name: "MayaMacro" },
  you: { id: "you", name: "You" },
};

function forecasts(
  questionId: string,
  values: Array<[keyof typeof people, number]>,
): Forecast[] {
  return values.map(([personId, probability], index) => ({
    id: `${questionId}-${personId}`,
    participantId: people[personId].id,
    participantName: people[personId].name,
    probability,
    submittedAt: `2026-10-${String(index + 2).padStart(2, "0")}T12:00:00Z`,
  }));
}

export const CURRENT_PARTICIPANT = people.you;

export const DEMO_ROOM: Room = {
  id: "worlds-fair-radar",
  name: "Crypto World's Fair Radar",
  description:
    "Independent forecasts about the hackathon, Solana ecosystem, and what builders will ship next.",
  organizer: "Signal Room Labs",
  members: 24,
  questions: [
    {
      id: "submissions-1000",
      prompt: "Will Crypto World's Fair receive at least 1,000 eligible submissions?",
      category: "Hackathon",
      closesAt: "Oct 12 · 20:00 UTC",
      status: "open",
      resolutionCriteria:
        "Resolves YES if Colosseum publishes a final eligible submission count of 1,000 or more.",
      forecasts: forecasts("submissions-1000", [
        ["nova", 72],
        ["ida", 58],
        ["teo", 81],
        ["maya", 64],
      ]),
      anchored: false,
    },
    {
      id: "consumer-winner",
      prompt: "Will a consumer product win one of the top three grand prizes?",
      category: "Hackathon",
      closesAt: "Oct 13 · 06:00 UTC",
      status: "open",
      resolutionCriteria:
        "Resolves YES if at least one officially announced top-three project is primarily consumer-facing.",
      forecasts: forecasts("consumer-winner", [
        ["nova", 46],
        ["ida", 63],
        ["teo", 55],
      ]),
      anchored: false,
    },
    {
      id: "wallet-launch",
      prompt: "Will a new Solana wallet announce public beta before the submission deadline?",
      category: "Ecosystem",
      closesAt: "Oct 10 · 18:00 UTC",
      status: "sealed",
      resolutionCriteria:
        "Resolves YES after an official public-beta announcement from the wallet team.",
      forecasts: forecasts("wallet-launch", [
        ["nova", 38],
        ["ida", 44],
        ["teo", 27],
        ["maya", 51],
        ["you", 35],
      ]),
      anchored: false,
    },
    {
      id: "solana-price-180",
      prompt: "Will SOL close above $180 on October 5?",
      category: "Market",
      closesAt: "Oct 5 · 20:00 UTC",
      status: "resolved",
      resolutionCriteria:
        "Uses the UTC daily close published by the selected market data source.",
      sourceLabel: "Demo market close: $186.40",
      outcome: 1,
      forecasts: forecasts("solana-price-180", [
        ["nova", 78],
        ["ida", 61],
        ["teo", 84],
        ["maya", 49],
        ["you", 72],
      ]),
      anchored: false,
    },
    {
      id: "anchor-release",
      prompt: "Will Anchor publish a new stable release before October 7?",
      category: "Developer tools",
      closesAt: "Oct 7 · 12:00 UTC",
      status: "resolved",
      resolutionCriteria:
        "Resolves YES if a stable GitHub release is published before the deadline.",
      sourceLabel: "Demo result: no stable release",
      outcome: 0,
      forecasts: forecasts("anchor-release", [
        ["nova", 32],
        ["ida", 41],
        ["teo", 18],
        ["maya", 57],
        ["you", 24],
      ]),
      anchored: false,
    },
    {
      id: "payments-track",
      prompt: "Will payments be the largest category among featured demo-day projects?",
      category: "Hackathon",
      closesAt: "Oct 3 · 16:00 UTC",
      status: "resolved",
      resolutionCriteria:
        "Compares the primary categories of all projects selected for the official demo day.",
      sourceLabel: "Demo result: payments was the largest category",
      outcome: 1,
      forecasts: forecasts("payments-track", [
        ["nova", 67],
        ["ida", 52],
        ["teo", 73],
        ["maya", 39],
        ["you", 65],
      ]),
      anchored: false,
    },
  ],
};
