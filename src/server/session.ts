import "server-only";

import { cookies } from "next/headers";
import { getSession } from "@/server/store";
import { sha256Hex } from "@/server/crypto";

export const SESSION_COOKIE = "signal_room_session";

export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSession(await sha256Hex(token));
}
