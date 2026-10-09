import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCommitmentTree, verifyCommitmentProof } from "./merkle";
import { verifyCommitmentProofInBrowser } from "./merkle-browser";

const commitment = (value: string) => createHash("sha256").update(value).digest("hex");

describe("commitment Merkle tree", () => {
  it("has a deterministic empty root and rejects malformed inputs", () => {
    expect(buildCommitmentTree([]).root).toBe(commitment("\u0002"));
    expect(() => buildCommitmentTree(["not-a-hash"])).toThrow();
    expect(() => buildCommitmentTree([commitment("a"), commitment("a")])).toThrow();
  });

  it("sorts commitments and proves every leaf, including an odd final leaf", () => {
    const hashes = ["c", "a", "b"].map(commitment);
    const first = buildCommitmentTree(hashes);
    const second = buildCommitmentTree([...hashes].reverse());
    expect(first.root).toBe(second.root);
    expect(first.count).toBe(3);
    for (const hash of hashes) {
      const proof = first.proofFor(hash);
      expect(proof).not.toBeNull();
      expect(verifyCommitmentProof(hash, first.root, proof!)).toBe(true);
      expect(verifyCommitmentProof(commitment("impostor"), first.root, proof!)).toBe(false);
    }
    expect(first.proofFor(commitment("missing"))).toBeNull();
  });

  it("keeps the v1 cross-implementation root fixed", () => {
    expect(buildCommitmentTree(["alpha", "beta", "gamma"].map(commitment)).root)
      .toBe("50a28e5bbec7b4f84b0ba8c92515caa389db1da50f37530fef003c2859a140bd");
  });

  it("does not accept a changed root or sibling", () => {
    const hashes = ["x", "y"].map(commitment);
    const tree = buildCommitmentTree(hashes);
    const proof = tree.proofFor(hashes[0])!;
    expect(verifyCommitmentProof(hashes[0], commitment("wrong"), proof)).toBe(false);
    expect(verifyCommitmentProof(hashes[0], tree.root, [{ ...proof[0], sibling: commitment("wrong") }])).toBe(false);
  });

  it("verifies the server proof independently with browser crypto", async () => {
    const hashes = ["first", "second", "third"].map(commitment);
    const tree = buildCommitmentTree(hashes);
    for (const hash of hashes) {
      expect(await verifyCommitmentProofInBrowser(hash, tree.root, tree.proofFor(hash)!)).toBe(true);
    }
    expect(await verifyCommitmentProofInBrowser(hashes[0], commitment("fake"), tree.proofFor(hashes[0])!)).toBe(false);
  });
});
