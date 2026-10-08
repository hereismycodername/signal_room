import { revealForecastSummary } from "@/lib/public-room";
import {
  getRoom,
  listForecastsForQuestion,
  listQuestionsByRoom,
} from "@/server/store";

type RouteContext = { params: Promise<{ roomId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { roomId } = await context.params;
  const room = await getRoom(roomId);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });

  const allQuestions = await listQuestionsByRoom(room.id);
  const visibleQuestions = allQuestions.filter((question) => question.status !== "draft");
  const publicQuestions = await Promise.all(
    visibleQuestions.map(async (question) => {
      const forecasts = await listForecastsForQuestion(question.id);
      const summary = revealForecastSummary(question.status, forecasts);
      return {
        id: question.id,
        prompt: question.prompt,
        category: question.category,
        resolutionCriteria: question.resolutionCriteria,
        closesAt: question.closesAt,
        status: question.status,
        ...summary,
        outcome: question.status === "resolved" ? question.outcome : null,
        evidenceLabel:
          question.status === "resolved" ? question.evidenceLabel : null,
        evidenceUrl: question.status === "resolved" ? question.evidenceUrl : null,
      };
    }),
  );

  return Response.json({
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      createdAt: room.createdAt,
      questions: publicQuestions,
    },
  });
}
