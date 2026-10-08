import { cookies } from "next/headers";
import { z } from "zod";
import {
  randomToken,
  sha256Hex,
  verifyWalletSignature,
} from "@/server/crypto";
import { SESSION_COOKIE } from "@/server/session";
import {
  consumeNonce,
  createSession,
  getNonce,
  storageMode,
  upsertUser,
} from "@/server/store";

const requestSchema = z.object({
  address: z.string().min(32).max(44),
  nonceId: z.string().uuid(),
  signature: z.string().min(80).max(128),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid sign-in response." }, { status: 400 });
  }

  const nonce = await getNonce(parsed.data.nonceId);
  if (
    !nonce ||
    nonce.walletAddress !== parsed.data.address ||
    nonce.consumedAt ||
    nonce.expiresAt <= new Date()
  ) {
    return Response.json({ error: "Sign-in request expired or was already used." }, { status: 401 });
  }

  const valid = await verifyWalletSignature(
    parsed.data.address,
    nonce.message,
    parsed.data.signature,
  );
  if (!valid) {
    return Response.json({ error: "Wallet signature is invalid." }, { status: 401 });
  }

  if (!(await consumeNonce(nonce.id))) {
    return Response.json({ error: "Sign-in request was already used." }, { status: 409 });
  }

  const user = await upsertUser(parsed.data.address);
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession({
    id: crypto.randomUUID(),
    userId: user.id,
    walletAddress: user.walletAddress,
    tokenHash: await sha256Hex(token),
    expiresAt,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });

  return Response.json({
    address: user.walletAddress,
    expiresAt,
    storage: storageMode(),
  });
}
