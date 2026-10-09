import type { BinaryOutcome, QuestionStatus } from "./forecasting";

export type ScoredForecast = {
  walletAddress: string;
  probabilityBps: number;
};

export type ScoredQuestion = {
  id: string;
  status: QuestionStatus;
  outcome: number | null;
  resolvedAt: Date | null;
  forecasts: ScoredForecast[];
};

export type RoomLeaderboardEntry = {
  walletAddress: string;
  averageScore: number;
  resolvedForecasts: number;
  directionAccuracy: number;
  currentStreak: number;
  provisional: boolean;
};

export function brierScoreBps(probabilityBps: number, outcome: BinaryOutcome) {
  const error = probabilityBps - outcome * 10_000;
  return Math.round(10_000 - (error * error) / 10_000);
}

function correctDirection(probabilityBps: number, outcome: BinaryOutcome) {
  return outcome === 1 ? probabilityBps > 5_000 : probabilityBps < 5_000;
}

export function buildRoomLeaderboard(questions: ScoredQuestion[]): RoomLeaderboardEntry[] {
  const rows = new Map<
    string,
    { scoreSum: number; resolvedForecasts: number; correct: number; streak: number }
  >();

  const resolved = questions
    .filter(
      (question): question is ScoredQuestion & { outcome: BinaryOutcome; resolvedAt: Date } =>
        question.status === "resolved" &&
        (question.outcome === 0 || question.outcome === 1) &&
        question.resolvedAt !== null,
    )
    .sort(
      (first, second) =>
        first.resolvedAt.getTime() - second.resolvedAt.getTime() ||
        first.id.localeCompare(second.id),
    );

  for (const question of resolved) {
    for (const forecast of question.forecasts) {
      const row = rows.get(forecast.walletAddress) ?? {
        scoreSum: 0,
        resolvedForecasts: 0,
        correct: 0,
        streak: 0,
      };
      const isCorrect = correctDirection(forecast.probabilityBps, question.outcome);
      row.scoreSum += brierScoreBps(forecast.probabilityBps, question.outcome);
      row.resolvedForecasts += 1;
      row.correct += Number(isCorrect);
      row.streak = isCorrect ? row.streak + 1 : 0;
      rows.set(forecast.walletAddress, row);
    }
  }

  return Array.from(rows, ([walletAddress, row]) => ({
    walletAddress,
    averageScore: Math.round(row.scoreSum / row.resolvedForecasts),
    resolvedForecasts: row.resolvedForecasts,
    directionAccuracy: Math.round((row.correct / row.resolvedForecasts) * 100),
    currentStreak: row.streak,
    provisional: row.resolvedForecasts < 3,
  })).sort(
    (first, second) =>
      second.averageScore - first.averageScore ||
      second.resolvedForecasts - first.resolvedForecasts ||
      first.walletAddress.localeCompare(second.walletAddress),
  );
}
