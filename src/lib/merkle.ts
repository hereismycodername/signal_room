import { createHash } from "node:crypto";

export type MerkleProofStep = {
  sibling: string;
  position: "left" | "right";
};

const HEX_32 = /^[0-9a-f]{64}$/;

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest();
}

function hashLeaf(commitmentHash: string) {
  return digest(Buffer.concat([Buffer.from([0]), Buffer.from(commitmentHash, "hex")]));
}

function hashPair(left: Uint8Array, right: Uint8Array) {
  return digest(Buffer.concat([Buffer.from([1]), left, right]));
}

export function buildCommitmentTree(commitmentHashes: string[]) {
  for (const hash of commitmentHashes) {
    if (!HEX_32.test(hash)) throw new Error("Invalid commitment hash.");
  }
  const commitments = [...commitmentHashes].sort();
  for (let index = 1; index < commitments.length; index += 1) {
    if (commitments[index] === commitments[index - 1]) {
      throw new Error("Duplicate commitment hash.");
    }
  }

  const levels: Buffer[][] = [commitments.map(hashLeaf)];
  while (levels.at(-1)!.length > 1) {
    const current = levels.at(-1)!;
    const parents: Buffer[] = [];
    for (let index = 0; index < current.length; index += 2) {
      parents.push(hashPair(current[index], current[index + 1] ?? current[index]));
    }
    levels.push(parents);
  }

  const root = levels[0].length === 0
    ? digest(Buffer.from([2])).toString("hex")
    : levels.at(-1)![0].toString("hex");

  function proofFor(commitmentHash: string): MerkleProofStep[] | null {
    let index = commitments.indexOf(commitmentHash);
    if (index < 0) return null;
    const steps: MerkleProofStep[] = [];
    for (let level = 0; level < levels.length - 1; level += 1) {
      const nodes = levels[level];
      const siblingIndex = index ^ 1;
      steps.push({
        sibling: (nodes[siblingIndex] ?? nodes[index]).toString("hex"),
        position: index % 2 === 0 ? "right" : "left",
      });
      index = Math.floor(index / 2);
    }
    return steps;
  }

  return { root, count: commitments.length, proofFor };
}

export function verifyCommitmentProof(
  commitmentHash: string,
  root: string,
  proof: MerkleProofStep[],
) {
  if (!HEX_32.test(commitmentHash) || !HEX_32.test(root)) return false;
  let current = hashLeaf(commitmentHash);
  for (const step of proof) {
    if (!HEX_32.test(step.sibling) || (step.position !== "left" && step.position !== "right")) {
      return false;
    }
    const sibling = Buffer.from(step.sibling, "hex");
    current = step.position === "left"
      ? hashPair(sibling, current)
      : hashPair(current, sibling);
  }
  return current.toString("hex") === root;
}
