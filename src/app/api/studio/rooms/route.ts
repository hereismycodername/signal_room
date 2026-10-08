import { z } from "zod";
import { readSession } from "@/server/session";
import {
  createRoom,
  listQuestionsByRoom,
  listRoomsByOwner,
  storageMode,
} from "@/server/store";

const roomSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(12).max(500),
});

export async function GET() {
  const session = await readSession();
  if (!session) return Response.json({ error: "Wallet sign-in required." }, { status: 401 });

  const ownerRooms = await listRoomsByOwner(session.userId);
  const result = await Promise.all(
    ownerRooms.map(async (room) => ({
      ...room,
      questions: await listQuestionsByRoom(room.id),
    })),
  );
  return Response.json({ rooms: result, storage: storageMode() });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return Response.json({ error: "Wallet sign-in required." }, { status: 401 });

  const parsed = roomSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Room name must be 3–80 characters and description 12–500 characters." },
      { status: 400 },
    );
  }

  const room = await createRoom({
    id: crypto.randomUUID(),
    name: parsed.data.name,
    description: parsed.data.description,
    ownerUserId: session.userId,
    createdAt: new Date(),
  });
  return Response.json({ room: { ...room, questions: [] }, storage: storageMode() }, { status: 201 });
}
