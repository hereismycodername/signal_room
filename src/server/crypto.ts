import {
  address,
  assertIsSignatureBytes,
  getPublicKeyFromAddress,
  verifySignature,
} from "@solana/kit";

const encoder = new TextEncoder();

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(value).toString("base64url");
}

export function isSolanaAddress(value: string) {
  try {
    address(value);
    return true;
  } catch {
    return false;
  }
}

export async function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signatureBase64: string,
) {
  try {
    const signature = new Uint8Array(Buffer.from(signatureBase64, "base64"));
    assertIsSignatureBytes(signature);
    const publicKey = await getPublicKeyFromAddress(address(walletAddress));
    return verifySignature(publicKey, signature, encoder.encode(message));
  } catch {
    return false;
  }
}
