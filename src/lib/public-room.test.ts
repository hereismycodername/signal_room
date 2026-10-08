import { describe, expect, it } from "vitest";
import { revealForecastSummary } from "./public-room";

const forecasts = [{ probabilityBps: 2_000 }, { probabilityBps: 8_000 }];

describe("public forecast visibility", () => {
  it("hides probabilities while a question is open", () => {
    expect(revealForecastSummary("open", forecasts)).toEqual({
      forecastCount: 2,
      aggregateProbabilityBps: null,
      histogram: null,
    });
  });

  it("reveals only an aggregate distribution after sealing", () => {
    expect(revealForecastSummary("sealed", forecasts)).toEqual({
      forecastCount: 2,
      aggregateProbabilityBps: 5_000,
      histogram: [0, 1, 0, 0, 1],
    });
  });
});
