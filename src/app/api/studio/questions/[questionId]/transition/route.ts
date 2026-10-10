import { z } from "zod";
import { canTransition } from "@/lib/forecasting";
import { readSession } from "@/server/session";
import {
  getQuestion,
  getRoom,
  transitionQuestion,
} from "@/server/store";

const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open") }),
  z.object({ action: z.literal("seal") }),
  z.object({
    action: z.literal("resolve"),
    outcome: z.union([z.literal(0), z.literal(1)]),
    evidenceLabel: z.string().trim().min(3).max(120),
    evidenceUrl: z.url().refine((value) => value.startsWith("https://") || value.startsWith("http://")),
  }),
]);

type RouteContext = { params: Promise<{ questionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return Response.json({ error: "Wallet sign-in required." }, { status: 401 });

  const { questionId } = await context.params;
  const question = await getQuestion(questionId);
  if (!question) return Response.json({ error: "Question not found." }, { status: 404 });
  const room = await getRoom(question.roomId);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });
  if (room.ownerUserId !== session.userId) {
    return Response.json({ error: "Only the room organizer can change this question." }, { status: 403 });
  }

  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid lifecycle transition." }, { status: 400 });
  }

  const nextStatus =
    parsed.data.action === "open"
      ? "open"
      : parsed.data.action === "seal"
        ? "sealed"
        : "resolved";
  if (!canTransition(question.status, nextStatus)) {
    return Response.json(
      { error: `Cannot move a ${question.status} question to ${nextStatus}.` },
      { status: 409 },
    );
  }

  if (parsed.data.action === "open" && question.closesAt <= new Date()) {
    return Response.json({ error: "Update the deadline before opening this question." }, { status: 409 });
  }
  if (parsed.data.action === "seal" && question.closesAt > new Date()) {
    return Response.json({ error: "Wait until the forecast deadline before sealing." }, { status: 409 });
  }

  const now = new Date();
  const values =
    parsed.data.action === "open"
      ? { status: "open" as const, openedAt: now }
      : parsed.data.action === "seal"
        ? { status: "sealed" as const, sealedAt: now }
        : {
            status: "resolved" as const,
            outcome: parsed.data.outcome,
            evidenceLabel: parsed.data.evidenceLabel,
            evidenceUrl: parsed.data.evidenceUrl,
            resolvedAt: now,
          };
  const updated = await transitionQuestion(question.id, question.status, values);
  if (!updated) {
    return Response.json({ error: "Question changed in another request. Refresh and retry." }, { status: 409 });
  }
  return Response.json({ question: updated });
}
