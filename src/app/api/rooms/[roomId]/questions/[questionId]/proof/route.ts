import { buildCommitmentTree } from "@/lib/merkle";
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

  return Response.json({
    commitmentHash: ownForecast.commitmentHash,
    root: tree.root,
    count: tree.count,
    proof,
    algorithm: "sha256-prefix-v1",
    anchored: false,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
