import { describe, expect, it } from "vitest";
import { verifyCommitmentProof } from "./merkle";
import { evidenceHashInBrowser, resultHashInBrowser, verifyCommitmentProofInBrowser } from "./merkle-browser";
import { buildResultTree, evidenceHash, resultHash } from "./result-roots";

const first = { commitmentHash: "11".repeat(32), probabilityBps: 8_000 };
const second = { commitmentHash: "22".repeat(32), probabilityBps: 2_000 };

describe("result snapshot v1", () => {
  it("is order-independent and proves a specific score and outcome", () => {
    const tree = buildResultTree([first, second], 1);
    expect(tree.root).toBe(buildResultTree([second, first], 1).root);
    const hash = resultHash(first, 1);
    expect(verifyCommitmentProof(hash, tree.root, tree.proofFor(hash)!)).toBe(true);
    expect(verifyCommitmentProof(resultHash(first, 0), tree.root, tree.proofFor(hash)!)).toBe(false);
  });

  it("commits to the cited resolution evidence", () => {
    expect(evidenceHash("Official result", "https://example.org/yes"))
      .not.toBe(evidenceHash("Official result", "https://example.org/no"));
  });

  it("matches server and browser hashing byte for byte", async () => {
    const tree = buildResultTree([first, second], 1);
    const hash = resultHash(first, 1);
    expect(await resultHashInBrowser(first.commitmentHash, first.probabilityBps, 1)).toBe(hash);
    expect(await evidenceHashInBrowser("Official result", "https://example.org/yes"))
      .toBe(evidenceHash("Official result", "https://example.org/yes"));
    expect(await verifyCommitmentProofInBrowser(hash, tree.root, tree.proofFor(hash)!)).toBe(true);
  });
});
