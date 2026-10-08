import { generateKeyPairSigner, signBytes } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { buildForecastMessage, buildSignInMessage } from "./messages";
import { verifyWalletSignature } from "../server/crypto";

describe("canonical wallet messages", () => {
  it("builds a deterministic, human-readable sign-in request", () => {
    const input = {
      domain: "signal-room.test",
      address: "wallet-address",
      uri: "https://signal-room.test",
      nonce: "nonce-123",
      issuedAt: "2026-10-08T10:00:00.000Z",
      expirationTime: "2026-10-08T10:05:00.000Z",
    };

    expect(buildSignInMessage(input)).toBe(buildSignInMessage(input));
    expect(buildSignInMessage(input)).toContain("will not trigger a transaction or cost SOL");
    expect(buildSignInMessage(input)).toContain("Nonce: nonce-123");
  });

  it("verifies the exact forecast message and rejects tampering", async () => {
    const signer = await generateKeyPairSigner();
    const message = buildForecastMessage({
      roomId: "room",
      questionId: "question",
      address: signer.address,
      probabilityBps: 6_800,
      salt: "test-salt-with-enough-entropy",
    });
    const signature = await signBytes(
      signer.keyPair.privateKey,
      new TextEncoder().encode(message),
    );
    const encodedSignature = Buffer.from(signature).toString("base64");

    await expect(
      verifyWalletSignature(signer.address, message, encodedSignature),
    ).resolves.toBe(true);
    await expect(
      verifyWalletSignature(
        signer.address,
        message.replace("6800", "6900"),
        encodedSignature,
      ),
    ).resolves.toBe(false);
  });
});
