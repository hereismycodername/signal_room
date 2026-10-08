import type { QuestionStatus } from "./forecasting";

type PublicForecast = { probabilityBps: number };

export function revealForecastSummary(
  status: QuestionStatus,
  forecasts: PublicForecast[],
) {
  if (status === "draft" || status === "open") {
    return {
      forecastCount: forecasts.length,
      aggregateProbabilityBps: null,
      histogram: null,
    };
  }

  const histogram = [0, 0, 0, 0, 0];
  for (const forecast of forecasts) {
    const bucket = Math.min(4, Math.floor(forecast.probabilityBps / 2_000));
    histogram[bucket] += 1;
  }

  return {
    forecastCount: forecasts.length,
    aggregateProbabilityBps:
      forecasts.length === 0
        ? null
        : Math.round(
            forecasts.reduce(
              (total, forecast) => total + forecast.probabilityBps,
              0,
            ) / forecasts.length,
          ),
    histogram,
  };
}
