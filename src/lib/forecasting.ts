export type QuestionStatus = "open" | "sealed" | "resolved";
export type BinaryOutcome = 0 | 1;

export type Forecast = {
  id: string;
  participantId: string;
  participantName: string;
  probability: number;
  submittedAt: string;
};

export type Question = {
  id: string;
  prompt: string;
  category: string;
  closesAt: string;
  status: QuestionStatus;
  resolutionCriteria: string;
  sourceLabel?: string;
  outcome?: BinaryOutcome;
  forecasts: Forecast[];
  anchored: boolean;
};

export type Room = {
  id: string;
  name: string;
  description: string;
  organizer: string;
  members: number;
  questions: Question[];
};

export type LeaderboardEntry = {
  participantId: string;
  participantName: string;
  averageScore: number;
  resolvedForecasts: number;
  directionAccuracy: number;
  currentStreak: number;
  provisional: boolean;
};

export function clampProbability(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function brierScorePoints(
  probabilityPercent: number,
  outcome: BinaryOutcome,
) {
  const probabilityBps = clampProbability(probabilityPercent) * 100;
  const outcomeBps = outcome * 10_000;
  const squaredError = (probabilityBps - outcomeBps) ** 2;

  return Math.round(10_000 - squaredError / 10_000);
}

export function isDirectionCorrect(
  probabilityPercent: number,
  outcome: BinaryOutcome,
) {
  if (probabilityPercent === 50) return false;
  return outcome === 1 ? probabilityPercent > 50 : probabilityPercent < 50;
}

export function aggregateProbability(forecasts: Forecast[]) {
  if (forecasts.length === 0) return null;
  return Math.round(
    forecasts.reduce((total, forecast) => total + forecast.probability, 0) /
      forecasts.length,
  );
}

export function buildHistogram(forecasts: Forecast[]) {
  const buckets = [0, 0, 0, 0, 0];

  for (const forecast of forecasts) {
    const bucket = Math.min(4, Math.floor(clampProbability(forecast.probability) / 20));
    buckets[bucket] += 1;
  }

  return buckets;
}

export function buildLeaderboard(questions: Question[]): LeaderboardEntry[] {
  const participantRows = new Map<
    string,
    {
      participantName: string;
      scores: number[];
      directions: boolean[];
    }
  >();

  for (const question of questions) {
    if (question.status !== "resolved" || question.outcome === undefined) continue;

    for (const forecast of question.forecasts) {
      const row = participantRows.get(forecast.participantId) ?? {
        participantName: forecast.participantName,
        scores: [],
        directions: [],
      };

      row.scores.push(brierScorePoints(forecast.probability, question.outcome));
      row.directions.push(isDirectionCorrect(forecast.probability, question.outcome));
      participantRows.set(forecast.participantId, row);
    }
  }

  return Array.from(participantRows.entries())
    .map(([participantId, row]) => {
      let currentStreak = 0;
      for (let index = row.directions.length - 1; index >= 0; index -= 1) {
        if (!row.directions[index]) break;
        currentStreak += 1;
      }

      return {
        participantId,
        participantName: row.participantName,
        averageScore: Math.round(
          row.scores.reduce((total, score) => total + score, 0) /
            row.scores.length,
        ),
        resolvedForecasts: row.scores.length,
        directionAccuracy: Math.round(
          (row.directions.filter(Boolean).length / row.directions.length) * 100,
        ),
        currentStreak,
        provisional: row.scores.length < 3,
      };
    })
    .sort(
      (first, second) =>
        second.averageScore - first.averageScore ||
        second.resolvedForecasts - first.resolvedForecasts,
    );
}

export function canTransition(
  current: QuestionStatus,
  next: QuestionStatus,
) {
  return (
    (current === "open" && next === "sealed") ||
    (current === "sealed" && next === "resolved")
  );
}
