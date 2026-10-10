import { createHash } from "node:crypto";
import { buildCommitmentTree } from "./merkle";
import { brierScoreBps } from "./room-results";
import type { BinaryOutcome } from "./forecasting";

const HEX_32 = /^[0-9a-f]{64}$/;

export type ResultForecast = {
  commitmentHash: string;
  probabilityBps: number;
};

export function resultHash(forecast: ResultForecast, outcome: BinaryOutcome) {
  if (!HEX_32.test(forecast.commitmentHash)) throw new Error("Invalid commitment hash.");
  if (!Number.isInteger(forecast.probabilityBps) || forecast.probabilityBps < 0 || forecast.probabilityBps > 10_000) {
    throw new Error("Invalid forecast probability.");
  }
  const score = brierScoreBps(forecast.probabilityBps, outcome);
  const bytes = Buffer.alloc(36);
  bytes[0] = 3;
  Buffer.from(forecast.commitmentHash, "hex").copy(bytes, 1);
  bytes[33] = outcome;
  bytes.writeUInt16LE(score, 34);
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildResultTree(forecasts: ResultForecast[], outcome: BinaryOutcome) {
  return buildCommitmentTree(forecasts.map((forecast) => resultHash(forecast, outcome)));
}

export function evidenceHash(label: string, url: string) {
  const bytes = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(label, "utf8"),
    Buffer.from([0]),
    Buffer.from(url, "utf8"),
  ]);
  return createHash("sha256").update(bytes).digest("hex");
}
