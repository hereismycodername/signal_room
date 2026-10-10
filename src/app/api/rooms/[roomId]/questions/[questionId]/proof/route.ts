import { buildCommitmentTree } from "@/lib/merkle";
import { buildResultTree, resultHash } from "@/lib/result-roots";
import { brierScoreBps } from "@/lib/room-results";
import { readSession } from "@/server/session";
import { getForecast, getRoomQuestion, listForecastsForQuestion } from "@/server/store";

type RouteContext = { params: Promise<{ roomId: string; questionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return Response.json({ error: "Wallet sign-in required." }, { status: 401 });

  const { roomId, questionId } = await context.params;
  const question = await getRoomQuestion(roomId, questionId);
  if (!question) return Response.json({ error: "Question not found." }, { status: 404 });
  if (question.status !== "sealed" && question.status !== "resolved") {
    return Response.json({ error: "Proofs are available after sealing." }, { status: 409 });
  }
  if (!question.commitmentsRoot || question.commitmentCount === null) {
    return Response.json({ error: "This question has no sealed commitment snapshot." }, { status: 409 });
  }

  const ownForecast = await getForecast(roomId, questionId, session.userId);
  if (!ownForecast) return Response.json({ error: "No forecast from this wallet." }, { status: 404 });

  const forecasts = await listForecastsForQuestion(questionId);
  const tree = buildCommitmentTree(forecasts.map((forecast) => forecast.commitmentHash));
  if (tree.root !== question.commitmentsRoot || tree.count !== question.commitmentCount) {
    return Response.json({ error: "Stored commitments differ from the sealed snapshot." }, { status: 500 });
  }
  const proof = tree.proofFor(ownForecast.commitmentHash);
  if (!proof) return Response.json({ error: "Forecast is absent from the sealed snapshot." }, { status: 500 });

  let result: null | {
    hash: string;
    root: string;
    count: number;
    proof: typeof proof;
    outcome: 0 | 1;
    score: number;
  } = null;
  if (question.status === "resolved") {
    if ((question.outcome !== 0 && question.outcome !== 1) || !question.resultsRoot) {
      return Response.json({ error: "Resolved result snapshot is incomplete." }, { status: 500 });
    }
    const resultTree = buildResultTree(forecasts, question.outcome);
    if (resultTree.root !== question.resultsRoot || resultTree.count !== question.commitmentCount) {
      return Response.json({ error: "Stored scores differ from the resolved snapshot." }, { status: 500 });
    }
    const hash = resultHash(ownForecast, question.outcome);
    const resultProof = resultTree.proofFor(hash);
    if (!resultProof) return Response.json({ error: "Your score is absent from the resolved snapshot." }, { status: 500 });
    result = {
      hash,
      root: resultTree.root,
      count: resultTree.count,
      proof: resultProof,
      outcome: question.outcome,
      score: brierScoreBps(ownForecast.probabilityBps, question.outcome),
    };
  }

  return Response.json({
    commitmentHash: ownForecast.commitmentHash,
    root: tree.root,
    count: tree.count,
    proof,
    algorithm: "sha256-prefix-v1",
    anchored: false,
    result,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
