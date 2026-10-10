import { z } from "zod";
import { readSession } from "@/server/session";
import { createQuestion, getRoom } from "@/server/store";

const questionSchema = z.object({
  prompt: z.string().trim().min(12).max(240),
  category: z.string().trim().min(2).max(50),
  resolutionCriteria: z.string().trim().min(20).max(800),
  closesAt: z.string().datetime(),
});

type RouteContext = { params: Promise<{ roomId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return Response.json({ error: "Wallet sign-in required." }, { status: 401 });

  const { roomId } = await context.params;
  const room = await getRoom(roomId);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });
  if (room.ownerUserId !== session.userId) {
    return Response.json({ error: "Only the room organizer can add questions." }, { status: 403 });
  }

  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Question fields are incomplete or invalid." }, { status: 400 });
  }

  const closesAt = new Date(parsed.data.closesAt);
  if (closesAt <= new Date()) {
    return Response.json({ error: "The forecast deadline must be in the future." }, { status: 400 });
  }

  const now = new Date();
  const question = await createQuestion({
    id: crypto.randomUUID(),
    roomId,
    prompt: parsed.data.prompt,
    category: parsed.data.category,
    resolutionCriteria: parsed.data.resolutionCriteria,
    closesAt,
    status: "draft",
    outcome: null,
    evidenceLabel: null,
    evidenceUrl: null,
    openedAt: null,
    sealedAt: null,
    commitmentsRoot: null,
    commitmentCount: null,
    resultsRoot: null,
    evidenceHash: null,
    resolvedAt: null,
    createdAt: now,
  });

  return Response.json({ question }, { status: 201 });
}
