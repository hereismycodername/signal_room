import type { MerkleProofStep } from "./merkle";

const HEX_32 = /^[0-9a-f]{64}$/;

function fromHex(value: string) {
  if (!HEX_32.test(value)) throw new Error("Invalid Merkle hash.");
  return Uint8Array.from(value.match(/../g)!, (part) => parseInt(part, 16));
}

function concat(...parts: Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

async function digest(bytes: Uint8Array) {
  const input = new Uint8Array(bytes.length);
  input.set(bytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export async function verifyCommitmentProofInBrowser(
  commitmentHash: string,
  root: string,
  proof: MerkleProofStep[],
) {
  try {
    if (proof.length > 64) return false;
    let current = await digest(concat(Uint8Array.of(0), fromHex(commitmentHash)));
    for (const step of proof) {
      if (step.position !== "left" && step.position !== "right") return false;
      const sibling = fromHex(step.sibling);
      current = await digest(step.position === "left"
        ? concat(Uint8Array.of(1), sibling, current)
        : concat(Uint8Array.of(1), current, sibling));
    }
    const expected = fromHex(root);
    return current.every((byte, index) => byte === expected[index]);
  } catch {
    return false;
  }
}

export async function resultHashInBrowser(
  commitmentHash: string,
  probabilityBps: number,
  outcome: 0 | 1,
) {
  if (!Number.isInteger(probabilityBps) || probabilityBps < 0 || probabilityBps > 10_000) {
    throw new Error("Invalid probability.");
  }
  const score = Math.round(10_000 - ((probabilityBps - outcome * 10_000) ** 2) / 10_000);
  const scoreBytes = Uint8Array.of(score & 255, score >> 8);
  const bytes = await digest(concat(Uint8Array.of(3), fromHex(commitmentHash), Uint8Array.of(outcome), scoreBytes));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function evidenceHashInBrowser(label: string, url: string) {
  const bytes = await digest(concat(
    Uint8Array.of(4),
    new TextEncoder().encode(label),
    Uint8Array.of(0),
    new TextEncoder().encode(url),
  ));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
