import { cookies } from "next/headers";
import { sha256Hex } from "@/server/crypto";
import { readSession, SESSION_COOKIE } from "@/server/session";
import { deleteSession, storageMode } from "@/server/store";

export async function GET() {
  const session = await readSession();
  if (!session) return Response.json({ authenticated: false });

  return Response.json({
    authenticated: true,
    address: session.walletAddress,
    expiresAt: session.expiresAt,
    storage: storageMode(),
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await sha256Hex(token));
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ authenticated: false });
}
