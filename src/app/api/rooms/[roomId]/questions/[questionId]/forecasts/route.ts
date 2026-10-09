import { z } from "zod";
import { DEMO_ROOM } from "@/lib/demo-room";
import { buildForecastMessage } from "@/lib/messages";
import { sha256Hex, verifyWalletSignature } from "@/server/crypto";
import { readSession } from "@/server/session";
import {
  createForecast,
  getForecast,
  getRoomQuestion,
  storageMode,
} from "@/server/store";

const requestSchema = z.object({
  probabilityBps: z.number().int().min(0).max(10_000),
  salt: z.string().min(16).max(128),
  signature: z.string().min(80).max(128),
});

type RouteContext = {
  params: Promise<{ roomId: string; questionId: string }>;
};

function findDemoQuestion(roomId: string, questionId: string) {
  if (roomId !== DEMO_ROOM.id) return null;
  return DEMO_ROOM.questions.find((question) => question.id === questionId) ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return Response.json({ error: "Wallet sign-in required." }, { status: 401 });

  const { roomId, questionId } = await context.params;
  const forecast = await getForecast(roomId, questionId, session.userId);
  return Response.json({
    forecast: forecast
      ? {
          probabilityBps: forecast.probabilityBps,
          commitmentHash: forecast.commitmentHash,
          submittedAt: forecast.submittedAt,
        }
      : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return Response.json({ error: "Wallet sign-in required." }, { status: 401 });

  const { roomId, questionId } = await context.params;
  const storedQuestion = await getRoomQuestion(roomId, questionId);
  const question = storedQuestion ?? findDemoQuestion(roomId, questionId);
  if (!question) return Response.json({ error: "Question not found." }, { status: 404 });
  if (question.status !== "open") {
    return Response.json({ error: "This question is no longer open." }, { status: 409 });
  }
  if (storedQuestion && storedQuestion.closesAt <= new Date()) {
    return Response.json({ error: "The forecast deadline has passed." }, { status: 409 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid forecast payload." }, { status: 400 });
  }

  const message = buildForecastMessage({
    roomId,
    questionId,
    address: session.walletAddress,
    probabilityBps: parsed.data.probabilityBps,
    salt: parsed.data.salt,
  });
  const valid = await verifyWalletSignature(
    session.walletAddress,
    message,
    parsed.data.signature,
  );
  if (!valid) {
    return Response.json({ error: "Forecast signature is invalid." }, { status: 401 });
  }

  const commitmentHash = await sha256Hex(message);
  const submittedAt = new Date();
  const created = await createForecast({
    id: crypto.randomUUID(),
    roomId,
    questionId,
    userId: session.userId,
    probabilityBps: parsed.data.probabilityBps,
    salt: parsed.data.salt,
    commitmentHash,
    signature: parsed.data.signature,
    submittedAt,
  });
  if (!created) {
    return Response.json(
      { error: "This wallet already submitted a forecast for the question." },
      { status: 409 },
    );
  }

  return Response.json(
    {
      forecast: { probabilityBps: parsed.data.probabilityBps, commitmentHash, submittedAt },
      storage: storageMode(),
    },
    { status: 201 },
  );
}
