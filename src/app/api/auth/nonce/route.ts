import { z } from "zod";
import { buildSignInMessage } from "@/lib/messages";
import { isSolanaAddress, randomToken } from "@/server/crypto";
import { createNonce, storageMode } from "@/server/store";

const requestSchema = z.object({
  address: z.string().min(32).max(44),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isSolanaAddress(parsed.data.address)) {
    return Response.json({ error: "Invalid Solana address." }, { status: 400 });
  }

  const url = new URL(request.url);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
  const id = crypto.randomUUID();
  const message = buildSignInMessage({
    domain: url.host,
    address: parsed.data.address,
    uri: url.origin,
    nonce: randomToken(18),
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(),
  });

  await createNonce({
    id,
    walletAddress: parsed.data.address,
    message,
    expiresAt,
    consumedAt: null,
  });

  return Response.json({ id, message, expiresAt, storage: storageMode() });
}
