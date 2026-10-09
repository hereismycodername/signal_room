import { revealForecastSummary } from "@/lib/public-room";
import { buildRoomLeaderboard } from "@/lib/room-results";
import {
  getRoom,
  listQuestionsByRoom,
  listRoomForecastsWithWallet,
} from "@/server/store";

type RouteContext = { params: Promise<{ roomId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { roomId } = await context.params;
  const room = await getRoom(roomId);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });

  const allQuestions = await listQuestionsByRoom(room.id);
  const visibleQuestions = allQuestions.filter((question) => question.status !== "draft");
  const forecasts = await listRoomForecastsWithWallet(room.id);
  const forecastsByQuestion = new Map<string, typeof forecasts>();
  for (const forecast of forecasts) {
    const rows = forecastsByQuestion.get(forecast.questionId) ?? [];
    rows.push(forecast);
    forecastsByQuestion.set(forecast.questionId, rows);
  }
  const publicQuestions = visibleQuestions.map((question) => {
    const summary = revealForecastSummary(
      question.status,
      forecastsByQuestion.get(question.id) ?? [],
    );
    return {
      id: question.id,
      prompt: question.prompt,
      category: question.category,
      resolutionCriteria: question.resolutionCriteria,
      closesAt: question.closesAt,
      status: question.status,
      ...summary,
      commitmentsRoot: question.status === "sealed" || question.status === "resolved"
        ? question.commitmentsRoot
        : null,
      commitmentCount: question.status === "sealed" || question.status === "resolved"
        ? question.commitmentCount
        : null,
      outcome: question.status === "resolved" ? question.outcome : null,
      evidenceLabel: question.status === "resolved" ? question.evidenceLabel : null,
      evidenceUrl: question.status === "resolved" ? question.evidenceUrl : null,
    };
  });
  const leaderboard = buildRoomLeaderboard(
    visibleQuestions.map((question) => ({
      id: question.id,
      status: question.status,
      outcome: question.outcome,
      resolvedAt: question.resolvedAt,
      forecasts: forecastsByQuestion.get(question.id) ?? [],
    })),
  );

  return Response.json({
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      createdAt: room.createdAt,
      questions: publicQuestions,
    },
    leaderboard,
  }, { headers: { "Cache-Control": "no-store" } });
}
